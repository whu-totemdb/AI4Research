"""
Outline Service: Maintains JSONL file with paper outline and metadata.

This service keeps a file-based representation of the folder hierarchy and paper metadata
in JSONL format for easy AI consumption. The file is automatically updated on every
folder/paper CRUD operation.
"""
import json
import logging
from pathlib import Path
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import PAPERS_DIR
from models import Folder, Paper, paper_folders

logger = logging.getLogger(__name__)

OUTLINE_DIR = PAPERS_DIR / "Outline"
OUTLINE_FILE = OUTLINE_DIR / "papers_outline.jsonl"


def ensure_outline_dir() -> Path:
    """Create Outline directory if it doesn't exist."""
    OUTLINE_DIR.mkdir(parents=True, exist_ok=True)
    return OUTLINE_DIR


async def _build_folder_path(db: AsyncSession, folder_id: int) -> list[str]:
    """Recursively build path array for a folder (e.g., ['ML', 'Deep Learning'])."""
    folder = await db.get(Folder, folder_id)
    if not folder:
        return []

    if folder.parent_id is None:
        return [folder.name]

    parent_path = await _build_folder_path(db, folder.parent_id)
    return parent_path + [folder.name]


async def _get_paper_folder_paths(db: AsyncSession, paper_id: int) -> list[list[str]]:
    """Get all folder paths for a paper (supports M2M relationship)."""
    # Get all folder IDs for this paper
    result = await db.execute(
        select(paper_folders.c.folder_id).where(paper_folders.c.paper_id == paper_id)
    )
    folder_ids = [row[0] for row in result.all()]

    # Build path for each folder
    paths = []
    for fid in folder_ids:
        path = await _build_folder_path(db, fid)
        if path:
            paths.append(path)

    return paths


def _write_outline_atomic(entries: list[dict]) -> None:
    """Write JSONL file atomically using temp file + rename pattern."""
    ensure_outline_dir()

    temp_path = OUTLINE_FILE.with_suffix(".jsonl.tmp")

    try:
        with temp_path.open("w", encoding="utf-8") as f:
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # Atomic rename
        temp_path.replace(OUTLINE_FILE)
        logger.info(f"Successfully wrote {len(entries)} entries to outline JSONL")
    except Exception as e:
        logger.error(f"Failed to write outline JSONL: {e}")
        if temp_path.exists():
            temp_path.unlink()
        raise


async def rebuild_full_outline(db: AsyncSession) -> None:
    """
    Rebuild the entire outline JSONL file from database.

    This is called after every folder/paper CRUD operation to ensure
    the JSONL file stays in sync with the database.
    """
    try:
        entries = []

        # 1. Load all folders
        folders_result = await db.execute(select(Folder).order_by(Folder.id))
        folders = folders_result.scalars().all()

        for folder in folders:
            path = await _build_folder_path(db, folder.id)
            entry = {
                "type": "folder",
                "id": folder.id,
                "name": folder.name,
                "parent_id": folder.parent_id,
                "path": path,
                "created_at": folder.created_at.isoformat() if folder.created_at else None,
                "updated_at": folder.updated_at.isoformat() if folder.updated_at else None,
            }
            entries.append(entry)

        # 2. Load all papers
        papers_result = await db.execute(select(Paper).order_by(Paper.id))
        papers = papers_result.scalars().all()

        for paper in papers:
            # Get folder IDs and paths
            folder_result = await db.execute(
                select(paper_folders.c.folder_id).where(paper_folders.c.paper_id == paper.id)
            )
            folder_ids = [row[0] for row in folder_result.all()]
            folder_paths = await _get_paper_folder_paths(db, paper.id)

            entry = {
                "type": "paper",
                "id": paper.id,
                "title": paper.title,
                "authors": paper.authors,
                "abstract": paper.abstract,
                "venue": paper.venue,
                "publish_date": paper.publish_date,
                "brief_note": paper.brief_note,
                "importance": paper.importance,
                "tags": paper.tags,
                "folder_ids": folder_ids,
                "folder_paths": folder_paths,
                "file_location": f"papers/{paper.id}",
                "created_at": paper.created_at.isoformat() if paper.created_at else None,
                "updated_at": paper.updated_at.isoformat() if paper.updated_at else None,
            }
            entries.append(entry)

        # 3. Write atomically
        _write_outline_atomic(entries)

        logger.info(f"Rebuilt outline JSONL: {len(folders)} folders, {len(papers)} papers")

    except Exception as e:
        logger.error(f"Failed to rebuild outline JSONL: {e}", exc_info=True)
        # Don't raise - this is a secondary operation, main DB operation should succeed
