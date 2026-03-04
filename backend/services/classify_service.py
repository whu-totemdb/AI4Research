import asyncio
import json
import logging
import re
from pathlib import Path

import aiofiles
from sqlalchemy import select, delete, insert
from sqlalchemy.ext.asyncio import AsyncSession

from models import Paper, Folder, paper_folders
from services.ai_chat_service import (
    get_default_provider,
    get_provider_by_id,
    chat_single,
)

logger = logging.getLogger(__name__)


def _parse_json_from_text(text: str):
    """Extract JSON from AI response, handling markdown code blocks."""
    # Try to find JSON in code blocks first
    m = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    # Try parsing directly
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try to find array or object pattern
    for pattern in [r"(\[[\s\S]*\])", r"(\{[\s\S]*\})"]:
        m = re.search(pattern, text)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                continue
    raise ValueError(f"Cannot parse JSON from AI response: {text[:200]}")


def _flatten_folder_tree(tree: list[dict], prefix: str = "") -> list[dict]:
    """Flatten nested folder tree into list of {id, name, path} for LEAF folders only."""
    result = []
    for node in tree:
        full_path = f"{prefix}/{node['name']}" if prefix else node["name"]
        children = node.get("children", [])
        if children:
            # Has children, recurse but don't add this node
            result.extend(_flatten_folder_tree(children, full_path))
        else:
            # Leaf node, add it
            result.append({"id": node["id"], "name": node["name"], "path": full_path})
    return result


async def _get_provider(db: AsyncSession, provider_id: str | None) -> dict:
    if provider_id:
        provider = await get_provider_by_id(db, provider_id)
    else:
        provider = await get_default_provider(db)
    if not provider:
        raise ValueError("No AI provider configured")
    return provider


async def classify_paper(
    paper_id: int,
    folder_tree: list[dict],
    db: AsyncSession,
    provider_id: str | None = None,
    context_chars: int = 1000,
) -> list[dict]:
    """Classify a single paper into folders using AI. Returns list of {id, name, path}."""
    try:
        # Load paper with eager loading to avoid lazy loading issues
        stmt = select(Paper).where(Paper.id == paper_id)
        result = await db.execute(stmt)
        paper = result.scalar_one_or_none()
        if not paper:
            logger.error(f"Paper {paper_id} not found")
            raise ValueError(f"Paper {paper_id} not found")

        # Extract attributes before any async operations to avoid lazy loading
        paper_title = paper.title
        paper_abstract = paper.abstract
        paper_dir = paper.paper_dir

        # Read markdown content asynchronously
        md_content = ""
        if paper_dir:
            md_path = Path(paper_dir) / "markdown" / "full.md"
            if md_path.exists():
                try:
                    async with aiofiles.open(md_path, mode='r', encoding='utf-8', errors='ignore') as f:
                        content = await f.read()
                        md_content = content[:context_chars]
                except Exception as e:
                    logger.warning(f"Failed to read markdown for paper {paper_id}: {e}")

        # Build context using extracted attributes
        context = f"论文标题: {paper_title}\n"
        if paper_abstract:
            context += f"摘要: {paper_abstract}\n"
        if md_content:
            context += f"\n论文内容摘录:\n{md_content}\n"

        # Flatten folder tree
        flat_folders = _flatten_folder_tree(folder_tree)
        if not flat_folders:
            logger.warning(f"No folders available for classification of paper {paper_id}")
            return []

        logger.info(f"Available leaf folders for paper {paper_id}: {[f['id'] for f in flat_folders]}")

        folder_list_str = "\n".join(
            f"- ID: {f['id']}, 路径: {f['path']}" for f in flat_folders
        )

        provider = await _get_provider(db, provider_id)
        logger.info(f"Classifying paper {paper_id} using provider {provider.get('name', 'unknown')}")

        system_prompt = (
            "你是一个学术论文分类助手。根据论文信息，将论文分类到最合适的文件夹中。\n"
            "重要：你只能选择叶子节点文件夹（没有子文件夹的文件夹），不能选择父文件夹。\n"
            "你必须只返回一个JSON数组，包含最合适的文件夹ID（数字）。\n"
            "选择1-3个最相关的叶子文件夹。只返回JSON数组，不要其他文字。\n"
            "示例: [1, 5, 12]"
        )

        user_msg = f"{context}\n可选文件夹:\n{folder_list_str}\n\n请返回最合适的文件夹ID数组（JSON格式）:"

        messages = [{"role": "user", "content": user_msg}]
        response = await chat_single(provider, messages, system_prompt)
        logger.debug(f"AI response for paper {paper_id}: {response[:200]}")

        # Parse response
        folder_ids = _parse_json_from_text(response)
        if not isinstance(folder_ids, list):
            folder_ids = [folder_ids]
        folder_ids = [int(fid) for fid in folder_ids if isinstance(fid, (int, float, str))]

        # Filter to valid LEAF folder IDs only
        valid_leaf_map = {f["id"]: f for f in flat_folders}
        valid_leaf_ids = set(valid_leaf_map.keys())
        logger.info(f"AI returned folder IDs: {folder_ids}, valid leaf IDs: {list(valid_leaf_ids)}")
        matched = [valid_leaf_map[fid] for fid in folder_ids if fid in valid_leaf_ids]

        # Log if AI returned non-leaf folders
        invalid_ids = [fid for fid in folder_ids if fid not in valid_leaf_ids]
        if invalid_ids:
            logger.warning(f"AI returned non-leaf folder IDs {invalid_ids} for paper {paper_id}, filtered out")

        logger.info(f"Matched leaf folders: {[f['id'] for f in matched]}")

        if not matched:
            logger.warning(f"No valid folders matched for paper {paper_id}, AI returned: {folder_ids}")

        # Update paper_folders M2M
        await db.execute(delete(paper_folders).where(paper_folders.c.paper_id == paper_id))
        for f in matched:
            await db.execute(insert(paper_folders).values(paper_id=paper_id, folder_id=f["id"]))
        # Also set folder_id to the first matched folder
        if matched:
            paper.folder_id = matched[0]["id"]
        await db.commit()

        # Refresh paper to avoid lazy loading issues after commit
        await db.refresh(paper)

        logger.info(f"Successfully classified paper {paper_id} into {len(matched)} folders: {[f['name'] for f in matched]}")
        return matched
    except Exception as e:
        logger.exception(f"Error classifying paper {paper_id}")
        await db.rollback()
        raise


async def classify_papers_batch(
    paper_ids: list[int],
    folder_tree: list[dict],
    db: AsyncSession,
    provider_id: str | None = None,
    context_chars: int = 1000,
    concurrency: int = 3,
):
    """Classify multiple papers concurrently. Yields (paper_id, result_or_error, is_error) tuples."""
    sem = asyncio.Semaphore(concurrency)

    async def _classify_one(pid: int):
        async with sem:
            try:
                folders = await classify_paper(pid, folder_tree, db, provider_id, context_chars)
                return pid, folders, False
            except Exception as e:
                logger.exception(f"Error classifying paper {pid}")
                return pid, str(e), True

    tasks = [asyncio.create_task(_classify_one(pid)) for pid in paper_ids]
    for coro in asyncio.as_completed(tasks):
        yield await coro


async def generate_folder_structures(
    paper_titles: list[str],
    db: AsyncSession,
    provider_id: str | None = None,
    custom_prompt: str = "",
) -> list:
    """Generate 3 folder structure proposals based on paper titles."""
    provider = await _get_provider(db, provider_id)

    titles_str = "\n".join(f"- {t}" for t in paper_titles)

    default_guidelines = "最多3级目录，目录标题要简洁明了，分类要合理且互不重叠，使用中文"
    if custom_prompt:
        default_guidelines += f"\n{custom_prompt}"

    system_prompt = (
        "你是一个学术论文分类专家。根据论文列表，生成合理的文件夹分类结构。\n"
        "你必须生成3个不同的分类方案，每个方案是一个JSON数组。\n"
        "每个文件夹对象格式: {\"name\": \"文件夹名\", \"children\": [...]}\n"
        "children可以嵌套，但最多3级。\n"
        "每个方案都必须包含一个名为\"未分类\"的文件夹。\n"
        f"分类要求: {default_guidelines}\n\n"
        "返回格式必须是一个JSON数组，包含3个方案，每个方案是一个文件夹数组:\n"
        "[\n"
        "  [{\"name\": \"...\", \"children\": [...]}, ...],\n"
        "  [{\"name\": \"...\", \"children\": [...]}, ...],\n"
        "  [{\"name\": \"...\", \"children\": [...]}, ...]\n"
        "]\n"
        "只返回JSON，不要其他文字。"
    )

    user_msg = f"以下是所有论文标题:\n{titles_str}\n\n请生成3个不同的文件夹分类方案:"

    messages = [{"role": "user", "content": user_msg}]
    response = await chat_single(provider, messages, system_prompt)

    proposals = _parse_json_from_text(response)
    if not isinstance(proposals, list) or len(proposals) == 0:
        raise ValueError("AI did not return valid proposals")

    # Ensure we have exactly 3 proposals
    if isinstance(proposals[0], dict):
        # AI returned a single proposal as array of folders
        proposals = [proposals]
    while len(proposals) < 3:
        proposals.append(proposals[-1])

    return proposals[:3]
