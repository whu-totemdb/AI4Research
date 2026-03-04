from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, PAPERS_DIR, UPLOAD_DIR
from models import Paper, AuthorInfo
from services.paper_fs_service import save_pdf, save_markdown, get_markdown, create_paper_dir
from services.outline_service import rebuild_full_outline

router = APIRouter(prefix="/api/papers", tags=["papers"])


class PaperUpdate(BaseModel):
    title: Optional[str] = None
    authors: Optional[str] = None
    abstract: Optional[str] = None
    folder_id: Optional[int] = None
    tags: Optional[str] = None
    venue: Optional[str] = None
    publish_date: Optional[str] = None
    brief_note: Optional[str] = None


class MarkdownUpload(BaseModel):
    content: str


class ImportanceUpdate(BaseModel):
    importance: int


class FolderAssignment(BaseModel):
    folder_ids: list[int]


@router.get("")
async def list_papers(
    folder_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """List all papers, optionally filtered by folder or search query."""
    stmt = select(Paper)

    if folder_id is not None:
        stmt = stmt.where(Paper.folder_id == folder_id)

    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                Paper.title.ilike(search_pattern),
                Paper.authors.ilike(search_pattern),
                Paper.abstract.ilike(search_pattern)
            )
        )

    stmt = stmt.order_by(Paper.created_at.desc())
    result = await db.execute(stmt)
    papers = result.scalars().all()

    return [_paper_dict(p) for p in papers]


@router.get("/{paper_id}")
async def get_paper(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single paper by ID."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")
    return _paper_dict(paper)


@router.post("")
async def upload_paper(
    file: UploadFile = File(...),
    title: str = Form(...),
    folder_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """Upload a new paper PDF."""
    if not file.filename or not file.filename.endswith('.pdf'):
        raise HTTPException(400, "Only PDF files are allowed")

    # Create paper record
    paper = Paper(
        title=title,
        folder_id=folder_id,
        file_path=None,  # Will be set after saving
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)

    # Save PDF file
    try:
        content = await file.read()
        pdf_path = save_pdf(paper.id, content)
        paper.file_path = f"/papers/{paper.id}/paper.pdf"
        paper.paper_dir = str(PAPERS_DIR / str(paper.id))
        await db.commit()
        await db.refresh(paper)
    except Exception as e:
        await db.delete(paper)
        await db.commit()
        raise HTTPException(500, f"Failed to save PDF: {str(e)}")

    # Update outline JSONL
    try:
        await rebuild_full_outline(db)
    except Exception as e:
        import logging
        logging.warning(f"Failed to rebuild outline after paper upload: {e}")

    # Start background metadata extraction
    asyncio.create_task(_background_extract_metadata(paper.id))

    return _paper_dict(paper)


@router.put("/{paper_id}")
async def update_paper(
    paper_id: int,
    body: PaperUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update paper metadata."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    if body.title is not None:
        paper.title = body.title
    if body.authors is not None:
        paper.authors = body.authors
    if body.abstract is not None:
        paper.abstract = body.abstract
    if body.folder_id is not None:
        paper.folder_id = body.folder_id
    if body.tags is not None:
        paper.tags = body.tags
    if body.venue is not None:
        paper.venue = body.venue
    if body.publish_date is not None:
        paper.publish_date = body.publish_date
    if body.brief_note is not None:
        paper.brief_note = body.brief_note

    paper.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(paper)

    # Update outline JSONL
    try:
        await rebuild_full_outline(db)
    except Exception as e:
        import logging
        logging.warning(f"Failed to rebuild outline after paper update: {e}")

    return _paper_dict(paper)


@router.delete("/{paper_id}")
async def delete_paper(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a paper and its files."""
    from sqlalchemy import delete as sql_delete

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    # Delete related author_infos first
    await db.execute(sql_delete(AuthorInfo).where(AuthorInfo.paper_id == paper_id))

    # Delete paper directory
    paper_dir = PAPERS_DIR / str(paper_id)
    if paper_dir.exists():
        import shutil
        shutil.rmtree(paper_dir, ignore_errors=True)

    # Delete paper (notes will be cascade deleted)
    await db.delete(paper)
    await db.commit()

    # Update outline JSONL
    try:
        await rebuild_full_outline(db)
    except Exception as e:
        import logging
        logging.warning(f"Failed to rebuild outline after paper deletion: {e}")

    return {"ok": True}


@router.post("/{paper_id}/markdown")
async def upload_markdown(
    paper_id: int,
    body: MarkdownUpload,
    db: AsyncSession = Depends(get_db)
):
    """Upload or update markdown content for a paper."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    save_markdown(paper_id, body.content, title=paper.title)
    paper.has_markdown = True
    await db.commit()

    return {"ok": True}


@router.get("/{paper_id}/markdown")
async def get_paper_markdown(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get markdown content for a paper."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    content = get_markdown(paper_id, title=paper.title)
    if content is None:
        raise HTTPException(404, "No markdown file found")

    return {"content": content}


@router.put("/{paper_id}/importance")
async def update_importance(
    paper_id: int,
    body: ImportanceUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update paper importance level."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    paper.importance = body.importance
    await db.commit()

    return {"ok": True}


@router.get("/{paper_id}/file")
async def get_paper_file(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get the PDF file for a paper."""
    from fastapi.responses import FileResponse

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    pdf_path = PAPERS_DIR / str(paper_id) / "paper.pdf"
    if not pdf_path.exists():
        raise HTTPException(404, "PDF file not found")

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"{paper.title[:50]}.pdf"
    )


@router.get("/{paper_id}/files")
async def get_paper_files(paper_id: int, db: AsyncSession = Depends(get_db)):
    """List all files in paper directory."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    paper_dir = PAPERS_DIR / str(paper_id)
    if not paper_dir.exists():
        return {"files": []}

    files = []
    for item in paper_dir.rglob("*"):
        if item.is_file():
            rel_path = item.relative_to(paper_dir)
            # Use forward slashes for consistency
            path_str = str(rel_path).replace("\\", "/")
            files.append({
                "name": path_str,  # Full path for nested files
                "path": path_str,
                "size": item.stat().st_size,
            })

    return {"files": files}


@router.post("/{paper_id}/folders")
async def set_paper_folders(
    paper_id: int,
    body: FolderAssignment,
    db: AsyncSession = Depends(get_db)
):
    """Assign paper to multiple folders."""
    from sqlalchemy import delete as sql_delete, insert
    from models import paper_folders
    import logging

    logger = logging.getLogger(__name__)
    logger.info(f"Setting folders for paper {paper_id}: {body.folder_ids}")

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    # Clear existing folder assignments
    delete_result = await db.execute(sql_delete(paper_folders).where(paper_folders.c.paper_id == paper_id))
    logger.info(f"Deleted {delete_result.rowcount} existing folder assignments")

    # Set new folder assignments
    if body.folder_ids:
        # Set primary folder_id to the first one
        paper.folder_id = body.folder_ids[0]
        logger.info(f"Set primary folder_id to {body.folder_ids[0]}")

        # Insert into paper_folders many-to-many table
        for folder_id in body.folder_ids:
            stmt = insert(paper_folders).values(paper_id=paper_id, folder_id=folder_id)
            insert_result = await db.execute(stmt)
            logger.info(f"Inserted paper_id={paper_id}, folder_id={folder_id}, rowcount={insert_result.rowcount}")
    else:
        # No folders assigned
        paper.folder_id = None
        logger.info("Cleared all folder assignments")

    await db.commit()
    await db.refresh(paper)

    logger.info(f"Committed changes for paper {paper_id}")

    return {"ok": True}


@router.post("/{paper_id}/extract-metadata")
async def extract_metadata(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Extract metadata from paper using AI agent with tools (DBLP, OpenAlex, web search)."""
    # Check paper exists
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    paper_title = paper.title  # Get title before stream starts

    async def stream():
        # Create a new database session for the stream
        from database import async_session

        async with async_session() as stream_db:
            try:
                # Send initial progress
                yield f'data: {json.dumps({"type": "progress", "message": "启动智能 Agent..."}, ensure_ascii=False)}\n\n'

                # Get markdown content (optional, for context)
                md_content = get_markdown(paper_id, title=paper_title)
                content_sample = md_content[:3000] if md_content else None

                # Get agent config
                from models import AppSetting
                agent_config = None
                setting = await stream_db.get(AppSetting, "agent_services")
                if setting:
                    try:
                        services = json.loads(setting.value)
                        for service in services:
                            if service.get("id") == "metadata_extraction":
                                agent_config = service
                                break
                    except json.JSONDecodeError:
                        pass

                if not agent_config or not agent_config.get("enabled"):
                    yield f'data: {json.dumps({"type": "error", "message": "元数据提取 Agent 未启用，请在设置中启用"}, ensure_ascii=False)}\n\n'
                    yield 'data: [DONE]\n\n'
                    return

                # Get AI provider
                from services.ai_chat_service import get_default_provider, chat_with_tools
                from services.mcp_tools import MCPToolRegistry

                provider = await get_default_provider(stream_db)
                if not provider:
                    yield f'data: {json.dumps({"type": "error", "message": "未配置 AI 提供商"}, ensure_ascii=False)}\n\n'
                    yield 'data: [DONE]\n\n'
                    return

                # Get enabled tools
                enabled_tools = []
                tool_names = agent_config.get("enabled_tools", [])
                for tool_name in tool_names:
                    tool = MCPToolRegistry.get_tool(tool_name)
                    if tool:
                        enabled_tools.append(tool)

                if not enabled_tools:
                    yield f'data: {json.dumps({"type": "error", "message": "没有可用的工具，请在设置中配置"}, ensure_ascii=False)}\n\n'
                    yield 'data: [DONE]\n\n'
                    return

                yield f'data: {json.dumps({"type": "progress", "message": f"Agent 可用工具: {", ".join([t.name for t in enabled_tools])}"}, ensure_ascii=False)}\n\n'

                # Build agent prompt
                from services.metadata_extraction_service import _build_extraction_prompt
                prompt = _build_extraction_prompt(paper_title, content_sample)

                # Call agent with tools
                messages = [{"role": "user", "content": prompt}]
                response_text = ""

                async for chunk in chat_with_tools(provider, messages, enabled_tools, stream_db):
                    response_text += chunk
                    # Forward tool execution logs to frontend
                    if chunk.startswith("[🔧") or chunk.startswith("[✓") or chunk.startswith("[✗"):
                        yield f'data: {json.dumps({"type": "progress", "message": chunk.strip()}, ensure_ascii=False)}\n\n'

                yield f'data: {json.dumps({"type": "progress", "message": "解析提取结果..."}, ensure_ascii=False)}\n\n'

                # Parse JSON response
                from services.metadata_extraction_service import _parse_metadata_json
                metadata = _parse_metadata_json(response_text)

                if not metadata:
                    yield f'data: {json.dumps({"type": "error", "message": "Agent 未返回有效的元数据"}, ensure_ascii=False)}\n\n'
                    yield 'data: [DONE]\n\n'
                    return

                # Update paper with extracted metadata using direct SQL update
                # This avoids session issues with ORM objects
                from sqlalchemy import update
                updated_fields = []
                update_values = {}

                if metadata.get("title"):
                    update_values["title"] = metadata["title"]
                    updated_fields.append("标题")
                if metadata.get("authors"):
                    update_values["authors"] = metadata["authors"]
                    updated_fields.append("作者")
                if metadata.get("venue"):
                    update_values["venue"] = metadata["venue"]
                    updated_fields.append("会议/期刊")
                if metadata.get("publish_date"):
                    update_values["publish_date"] = metadata["publish_date"]
                    updated_fields.append("发表日期")
                if metadata.get("abstract"):
                    update_values["abstract"] = metadata["abstract"]
                    updated_fields.append("摘要")
                if metadata.get("doi"):
                    # Store DOI in tags or a custom field if needed
                    updated_fields.append("DOI")
                if metadata.get("arxiv_id"):
                    # Store arXiv ID in tags or a custom field if needed
                    updated_fields.append("arXiv ID")

                if update_values:
                    stmt = update(Paper).where(Paper.id == paper_id).values(**update_values)
                    await stream_db.execute(stmt)
                    await stream_db.commit()

                yield f'data: {json.dumps({"type": "progress", "message": f"已更新: {", ".join(updated_fields)}"}, ensure_ascii=False)}\n\n'
                yield f'data: {json.dumps({"type": "result", "metadata": metadata}, ensure_ascii=False)}\n\n'
                yield f'data: {json.dumps({"type": "done"}, ensure_ascii=False)}\n\n'
                yield 'data: [DONE]\n\n'

            except Exception as e:
                import logging
                logging.error(f"Metadata extraction failed for paper {paper_id}: {e}", exc_info=True)
                error_msg = f"提取失败: {str(e)}"
                yield f'data: {json.dumps({"type": "error", "message": error_msg}, ensure_ascii=False)}\n\n'
                yield 'data: [DONE]\n\n'

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/{paper_id}/convert-md")
async def convert_pdf_to_md(
    paper_id: int,
    auto_extract: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """Convert PDF to Markdown using MinerU."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    try:
        from services.mineru_service import convert_pdf_to_md as mineru_convert
        result = await mineru_convert(db, paper_id)

        # Start background task to complete conversion and optionally extract metadata
        asyncio.create_task(_complete_conversion_task(paper_id, result["task_id"], auto_extract))

        return {"task_id": result["task_id"], "status": "pending"}
    except FileNotFoundError:
        raise HTTPException(404, "PDF file not found")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        import logging
        logging.error(f"Failed to start PDF conversion for paper {paper_id}: {e}", exc_info=True)
        raise HTTPException(500, f"Conversion failed: {str(e)}")


@router.get("/{paper_id}/convert-md/status")
async def get_convert_status(
    paper_id: int,
    task_id: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Get conversion status."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    # Check if markdown already exists
    if paper.has_markdown:
        return {"status": "completed", "progress": 100, "task_id": task_id}

    # For now, return pending status
    # In a production system, you'd track task status in database or cache
    return {"status": "pending", "progress": 50, "task_id": task_id}


@router.get("/{paper_id}/summary")
async def get_summary(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get paper summary."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    summary_file = PAPERS_DIR / str(paper_id) / "summary.md"
    if not summary_file.exists():
        raise HTTPException(404, "No summary found")

    content = summary_file.read_text(encoding="utf-8")
    return {"content": content}


@router.post("/{paper_id}/summary/generate")
async def generate_summary(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Generate paper summary using AI."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    # Get markdown content
    md_content = get_markdown(paper_id, title=paper.title)
    if not md_content:
        raise HTTPException(404, "No markdown content found for this paper")

    # Get AI provider
    from services.ai_chat_service import get_default_provider, chat_stream
    provider = await get_default_provider(db)
    if not provider:
        raise HTTPException(500, "No AI provider configured")

    # Build prompt for summary generation
    prompt = f"""请为以下论文生成一个详细的中文摘要。摘要应包括：
1. 研究背景和动机
2. 主要方法和创新点
3. 实验结果和结论
4. 研究意义

论文标题：{paper.title}

论文内容：
{md_content[:8000]}

请用清晰的中文段落形式输出摘要，不要使用 JSON 格式。"""

    # Stream response
    async def stream():
        try:
            messages = [{"role": "user", "content": prompt}]
            full_summary = ""

            async for chunk in chat_stream(provider, messages):
                full_summary += chunk
                # Send chunk in SSE format
                yield f'data: {json.dumps({"chunk": chunk})}\n\n'

            # Save summary to file
            summary_file = PAPERS_DIR / str(paper_id) / "summary.md"
            summary_file.write_text(full_summary, encoding="utf-8")

            yield 'data: [DONE]\n\n'
        except Exception as e:
            error_msg = f"Error generating summary: {str(e)}"
            yield f'data: {json.dumps({"error": error_msg})}\n\n'

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/{paper_id}/pageindex/status")
async def get_pageindex_status(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Check if PageIndex exists for a paper."""
    from services.pageindex_service import check_index_exists

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    if not paper.has_markdown:
        return {"exists": False, "reason": "No markdown file"}

    exists = check_index_exists(paper_id, paper.title)
    return {"exists": exists}


@router.get("/{paper_id}/authors")
async def get_author_infos(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get author information for a paper."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    stmt = select(AuthorInfo).where(AuthorInfo.paper_id == paper_id)
    result = await db.execute(stmt)
    authors = result.scalars().all()

    return [_author_info_dict(a) for a in authors]


@router.post("/{paper_id}/explore-authors")
async def explore_authors(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Explore and extract author information using smart AI agent with parallel execution."""
    from services.ai_chat_service import get_default_provider
    from services.author_explore_agent import explore_authors_parallel
    from models import AppSetting

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")
    if not paper.authors:
        raise HTTPException(400, "Paper has no authors")

    # Get AI provider
    provider = await get_default_provider(db)
    if not provider:
        raise HTTPException(500, "No AI provider configured")

    # Get agent services config
    result = await db.execute(select(AppSetting).where(AppSetting.key == "agent_services"))
    setting = result.scalar_one_or_none()
    agent_config = {}
    if setting and setting.value:
        try:
            services = json.loads(setting.value)
            for svc in services:
                if svc.get("id") == "author_exploration":
                    agent_config = svc
                    break
        except:
            pass

    # Parse authors
    author_list = [a.strip() for a in paper.authors.split(",") if a.strip()]

    return StreamingResponse(
        explore_authors_parallel(
            paper.id,
            author_list,
            paper.title or "",
            paper.venue or "",
            paper.authors or "",
            provider,
            agent_config,
        ),
        media_type="text/event-stream",
    )


@router.get("/{paper_id}/references")
async def get_paper_references_alias(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get paper references (alias for frontend compatibility)."""
    # Import here to avoid circular dependency
    from routers.references import get_paper_references
    return await get_paper_references(paper_id, db)


def _paper_dict(p: Paper) -> dict:
    """Convert Paper model to dictionary."""
    return {
        "id": p.id,
        "title": p.title,
        "authors": p.authors,
        "abstract": p.abstract,
        "file_path": p.file_path,
        "paper_dir": p.paper_dir,
        "has_markdown": p.has_markdown,
        "folder_id": p.folder_id,
        "folder_ids": [f.id for f in p.folders] if p.folders else [],  # Multi-folder support
        "tags": p.tags,
        "venue": p.venue,
        "publish_date": p.publish_date,
        "brief_note": p.brief_note,
        "importance": p.importance,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _author_info_dict(a: AuthorInfo) -> dict:
    """Convert AuthorInfo model to dictionary."""
    return {
        "id": a.id,
        "paper_id": a.paper_id,
        "author_name": a.author_name,
        "affiliation": a.affiliation,
        "research_areas": a.research_areas,
        "notable_works": a.notable_works,
        "profile_links": a.profile_links,
        "relationship_to_paper": a.relationship_to_paper,
        "raw_markdown": a.raw_markdown,
        "explored_at": a.explored_at.isoformat() if a.explored_at else None,
    }


async def _complete_conversion_task(paper_id: int, batch_id: str, auto_extract: bool):
    """Background task to complete PDF to Markdown conversion."""
    from database import async_session
    import logging

    try:
        async with async_session() as db:
            from services.mineru_service import complete_conversion
            await complete_conversion(db, paper_id, batch_id)
            logging.info(f"Paper {paper_id}: conversion completed successfully")

            # Optionally trigger metadata extraction
            if auto_extract:
                await _background_extract_metadata(paper_id)
    except Exception as e:
        logging.error(f"Error completing conversion for paper {paper_id}: {e}", exc_info=True)


async def _background_extract_metadata(paper_id: int):
    """Background task to extract metadata from paper using AI agent with tools."""
    from database import async_session
    from models import AppSetting
    from services.metadata_extraction_service import extract_metadata_with_agent
    from services.paper_fs_service import get_markdown
    import json

    try:
        # Create new database session for background task
        async with async_session() as db:
            # Get paper from database
            paper = await db.get(Paper, paper_id)
            if not paper:
                return

            # Get markdown content (optional, for context)
            md_content = get_markdown(paper_id, title=paper.title)
            content_sample = md_content[:3000] if md_content else None

            # Get metadata extraction agent config
            agent_config = None
            setting = await db.get(AppSetting, "agent_services")
            if setting:
                try:
                    services = json.loads(setting.value)
                    for service in services:
                        if service.get("id") == "metadata_extraction":
                            agent_config = service
                            break
                except json.JSONDecodeError:
                    pass

            # Extract metadata using AI agent with tools
            import logging
            logging.info(f"Paper {paper_id}: Starting agent-based metadata extraction")

            metadata = await extract_metadata_with_agent(
                db=db,
                paper_id=paper_id,
                paper_title=paper.title,
                md_content=content_sample,
                agent_config=agent_config,
            )

            # Update paper with extracted metadata
            if metadata:
                logging.info(f"Paper {paper_id}: Extracted metadata: {metadata}")
                updated_fields = []

                # Always update with extracted data (overwrite existing)
                if metadata.get("title"):
                    paper.title = metadata["title"]
                    updated_fields.append("title")
                if metadata.get("authors"):
                    paper.authors = metadata["authors"]
                    updated_fields.append("authors")
                if metadata.get("venue"):
                    paper.venue = metadata["venue"]
                    updated_fields.append("venue")
                if metadata.get("publish_date"):
                    paper.publish_date = metadata["publish_date"]
                    updated_fields.append("publish_date")
                if metadata.get("abstract"):
                    paper.abstract = metadata["abstract"]
                    updated_fields.append("abstract")

                if updated_fields:
                    await db.commit()
                    await db.refresh(paper)
                    logging.info(f"Paper {paper_id}: Updated fields: {updated_fields}")
                    logging.info(f"Paper {paper_id}: New title: {paper.title}")
                else:
                    logging.info(f"Paper {paper_id}: No fields to update")
            else:
                logging.warning(f"Paper {paper_id}: No metadata extracted")

    except Exception as e:
        # Log error but don't crash
        import logging
        logging.error(f"Error extracting metadata for paper {paper_id}: {e}", exc_info=True)


def _parse_metadata_json(text: str) -> dict | None:
    """Parse JSON from AI response, handling markdown code blocks."""
    import re

    # Try to find JSON in markdown code block
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        # Try to find raw JSON
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
        else:
            return None

    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        return None
