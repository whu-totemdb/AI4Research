import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from database import get_db, async_session
from models import Paper, Folder, paper_folders
from services.classify_service import (
    classify_paper,
    generate_folder_structures,
    _flatten_folder_tree,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/classify", tags=["classify"])


class ClassifySingleBody(BaseModel):
    provider_id: str | None = None
    context_chars: int = 1000


class ClassifyBatchBody(BaseModel):
    paper_ids: list[int]
    provider_id: str | None = None
    context_chars: int = 1000
    concurrency: int = 3


class GenerateFoldersBody(BaseModel):
    provider_id: str | None = None
    custom_prompt: str = ""


class ApplyFoldersBody(BaseModel):
    proposal: list[dict]
    reclassify: bool = False
    provider_id: str | None = None
    context_chars: int = 1000
    concurrency: int = 3


async def _build_folder_tree(db: AsyncSession) -> list[dict]:
    """Build folder tree from DB within a given session."""
    # Load ALL folders at once to avoid lazy loading issues
    stmt = select(Folder).order_by(Folder.name)
    result = await db.execute(stmt)
    all_folders = result.scalars().all()

    # Convert to dict for easier access
    folder_dict = {}
    for f in all_folders:
        folder_dict[f.id] = {
            "id": f.id,
            "name": f.name,
            "parent_id": f.parent_id,
            "children": [],
            "papers": [],
        }

    # Build tree structure
    roots = []
    for folder_id, folder_data in folder_dict.items():
        parent_id = folder_data["parent_id"]
        if parent_id is None:
            roots.append(folder_data)
        elif parent_id in folder_dict:
            folder_dict[parent_id]["children"].append(folder_data)

    return roots


# ---- Single paper classification ----

@router.post("/paper/{paper_id}")
async def classify_single_paper(
    paper_id: int,
    body: ClassifySingleBody,
    db: AsyncSession = Depends(get_db),
):
    try:
        folder_tree = await _build_folder_tree(db)
        if not folder_tree:
            raise HTTPException(400, "没有可用的文件夹，请先创建文件夹")

        folders = await classify_paper(
            paper_id, folder_tree, db,
            provider_id=body.provider_id,
            context_chars=body.context_chars,
        )
        return {"paper_id": paper_id, "folders": folders}
    except ValueError as e:
        logger.error(f"classify_single_paper ValueError: {e}")
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("classify_single_paper error")
        error_msg = str(e)
        if "provider" in error_msg.lower():
            error_msg = "AI服务配置错误，请检查设置"
        elif "timeout" in error_msg.lower():
            error_msg = "AI服务响应超时，请稍后重试"
        raise HTTPException(500, error_msg)


# ---- Batch classification (SSE) ----

@router.post("/batch")
async def classify_batch(body: ClassifyBatchBody):
    """Classify multiple papers. Returns SSE stream with progress events."""
    paper_ids = body.paper_ids
    provider_id = body.provider_id
    context_chars = body.context_chars
    concurrency = body.concurrency

    async def event_generator():
        total = len(paper_ids)
        current = 0
        results = {}
        errors = {}
        sem = asyncio.Semaphore(concurrency)

        async def classify_one(pid: int):
            nonlocal current
            async with sem:
                try:
                    async with async_session() as db:
                        folder_tree = await _build_folder_tree(db)
                        if not folder_tree:
                            raise ValueError("没有可用的文件夹")

                        folders = await classify_paper(
                            pid, folder_tree, db,
                            provider_id=provider_id,
                            context_chars=context_chars,
                        )
                        current += 1
                        results[pid] = folders
                        return json.dumps({
                            "type": "progress",
                            "paper_id": pid,
                            "folders": folders,
                            "current": current,
                            "total": total,
                        }, ensure_ascii=False)
                except Exception as e:
                    current += 1
                    error_msg = str(e)
                    if "provider" in error_msg.lower():
                        error_msg = "AI服务配置错误"
                    elif "timeout" in error_msg.lower():
                        error_msg = "AI服务响应超时"
                    errors[pid] = error_msg
                    logger.exception(f"classify paper {pid} error")
                    return json.dumps({
                        "type": "error",
                        "paper_id": pid,
                        "error": error_msg,
                        "current": current,
                        "total": total,
                    }, ensure_ascii=False)

        try:
            # Run sequentially to provide ordered progress events
            for pid in paper_ids:
                event_data = await classify_one(pid)
                yield {"data": event_data}

            yield {"data": json.dumps({
                "type": "done",
                "results": {str(k): v for k, v in results.items()},
                "errors": {str(k): v for k, v in errors.items()},
            }, ensure_ascii=False)}
        except Exception as e:
            logger.exception("classify_batch error")
            yield {"data": json.dumps({"type": "error", "error": str(e)}, ensure_ascii=False)}

    return EventSourceResponse(event_generator())


# ---- Generate folder structure proposals ----

@router.post("/generate-folders")
async def generate_folders(body: GenerateFoldersBody, db: AsyncSession = Depends(get_db)):
    try:
        # Get all paper titles
        result = await db.execute(select(Paper.title))
        titles = [row[0] for row in result.all()]
        if not titles:
            raise HTTPException(400, "No papers found")

        proposals = await generate_folder_structures(
            titles, db,
            provider_id=body.provider_id,
            custom_prompt=body.custom_prompt,
        )
        return {"proposals": proposals}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("generate_folders error")
        raise HTTPException(500, str(e))


# ---- Apply a folder structure proposal ----

@router.post("/apply-folders")
async def apply_folders(body: ApplyFoldersBody):
    """Apply a folder structure proposal. Returns SSE stream with progress."""
    proposal = body.proposal
    reclassify = body.reclassify
    provider_id = body.provider_id
    context_chars = body.context_chars
    concurrency = body.concurrency

    async def event_generator():
        try:
            async with async_session() as db:
                # Step 1: Delete all existing folders (cascade removes paper_folders)
                yield {"data": json.dumps({"type": "progress", "step": "deleting_folders", "message": "正在删除旧文件夹..."}, ensure_ascii=False)}
                await db.execute(delete(paper_folders))
                await db.execute(delete(Folder))
                await db.commit()

                # Step 2: Create new folders from proposal
                yield {"data": json.dumps({"type": "progress", "step": "creating_folders", "message": "正在创建新文件夹..."}, ensure_ascii=False)}

                async def create_folders_recursive(nodes: list[dict], parent_id: int | None = None):
                    for node in nodes:
                        folder = Folder(name=node["name"], parent_id=parent_id)
                        db.add(folder)
                        await db.flush()  # get the id
                        children = node.get("children", [])
                        if children:
                            await create_folders_recursive(children, folder.id)

                await create_folders_recursive(proposal)
                await db.commit()

                # Step 3: Find or create "未分类" folder, move all papers there
                yield {"data": json.dumps({"type": "progress", "step": "moving_papers", "message": "正在移动论文到未分类..."}, ensure_ascii=False)}
                stmt = select(Folder).where(Folder.name == "未分类", Folder.parent_id.is_(None))
                result = await db.execute(stmt)
                uncategorized = result.scalar_one_or_none()
                if not uncategorized:
                    uncategorized = Folder(name="未分类", parent_id=None)
                    db.add(uncategorized)
                    await db.flush()

                # Update all papers' folder_id to uncategorized
                paper_result = await db.execute(select(Paper))
                all_papers = paper_result.scalars().all()
                # Extract paper IDs before commit to avoid lazy loading issues
                paper_ids_list = [p.id for p in all_papers]
                for p in all_papers:
                    p.folder_id = uncategorized.id
                await db.commit()

                yield {"data": json.dumps({
                    "type": "progress",
                    "step": "folders_created",
                    "message": f"文件夹创建完成，共 {len(paper_ids_list)} 篇论文已移至未分类",
                }, ensure_ascii=False)}

            # Step 4: Reclassify if requested
            if reclassify and all_papers:
                paper_ids = paper_ids_list
                total = len(paper_ids)
                current = 0
                sem = asyncio.Semaphore(concurrency)

                async def classify_one(pid: int):
                    nonlocal current
                    async with sem:
                        try:
                            async with async_session() as cdb:
                                folder_tree = await _build_folder_tree(cdb)
                                if not folder_tree:
                                    raise ValueError("没有可用的文件夹")

                                folders = await classify_paper(
                                    pid, folder_tree, cdb,
                                    provider_id=provider_id,
                                    context_chars=context_chars,
                                )
                                current += 1
                                return json.dumps({
                                    "type": "classify_progress",
                                    "paper_id": pid,
                                    "folders": folders,
                                    "current": current,
                                    "total": total,
                                }, ensure_ascii=False)
                        except Exception as e:
                            current += 1
                            error_msg = str(e)
                            if "provider" in error_msg.lower():
                                error_msg = "AI服务配置错误"
                            elif "timeout" in error_msg.lower():
                                error_msg = "AI服务响应超时"
                            logger.exception(f"reclassify paper {pid} error")
                            return json.dumps({
                                "type": "error",
                                "paper_id": pid,
                                "error": error_msg,
                                "current": current,
                                "total": total,
                            }, ensure_ascii=False)

                for pid in paper_ids:
                    event_data = await classify_one(pid)
                    yield {"data": event_data}

            yield {"data": json.dumps({"type": "done"}, ensure_ascii=False)}

        except Exception as e:
            logger.exception("apply_folders error")
            yield {"data": json.dumps({"type": "error", "error": str(e)}, ensure_ascii=False)}

    return EventSourceResponse(event_generator())
