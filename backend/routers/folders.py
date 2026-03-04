from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Folder
from services.outline_service import rebuild_full_outline

router = APIRouter(prefix="/api/folders", tags=["folders"])


class FolderCreate(BaseModel):
    name: str
    parent_id: int | None = None


class FolderUpdate(BaseModel):
    name: str | None = None
    parent_id: int | None = None


@router.get("/tree")
async def get_folder_tree(db: AsyncSession = Depends(get_db)):
    stmt = select(Folder).where(Folder.parent_id.is_(None)).order_by(Folder.name)
    result = await db.execute(stmt)
    roots = result.scalars().all()
    return [_folder_tree(f) for f in roots]


@router.get("")
async def list_folders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Folder).order_by(Folder.name))
    return [_folder_flat(f) for f in result.scalars().all()]


@router.get("/{folder_id}")
async def get_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    return _folder_tree(folder)


@router.post("")
async def create_folder(body: FolderCreate, db: AsyncSession = Depends(get_db)):
    folder = Folder(name=body.name, parent_id=body.parent_id)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)

    # Update outline JSONL
    try:
        await rebuild_full_outline(db)
    except Exception as e:
        logger.error(f"Failed to update outline JSONL: {e}", exc_info=True)

    return _folder_flat(folder)


@router.put("/{folder_id}")
async def update_folder(folder_id: int, body: FolderUpdate, db: AsyncSession = Depends(get_db)):
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    if body.name is not None:
        folder.name = body.name
    if body.parent_id is not None:
        folder.parent_id = body.parent_id
    folder.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(folder)

    # Update outline JSONL
    try:
        await rebuild_full_outline(db)
    except Exception as e:
        logger.error(f"Failed to update outline JSONL: {e}", exc_info=True)

    return _folder_flat(folder)


@router.delete("/{folder_id}")
async def delete_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    await db.delete(folder)
    await db.commit()

    # Update outline JSONL
    try:
        await rebuild_full_outline(db)
    except Exception as e:
        logger.error(f"Failed to update outline JSONL: {e}", exc_info=True)

    return {"ok": True}


def _folder_flat(f: Folder) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "parent_id": f.parent_id,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    }


def _folder_tree(f: Folder) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "parent_id": f.parent_id,
        "children": [_folder_tree(c) for c in (f.children or [])],
        "papers": [
            {"id": p.id, "title": p.title, "file_path": p.file_path, "tags": p.tags}
            for p in (f.papers or [])
        ],
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    }
