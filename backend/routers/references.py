from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import PaperReference, Paper

router = APIRouter(prefix="/api/references", tags=["references"])


class ReferenceCreate(BaseModel):
    source_paper_id: int
    target_paper_id: int
    source_page: int | None = None
    description: str | None = None


def _serialize_ref(ref: PaperReference, other_id: int, other_title: str) -> dict:
    return {
        "id": ref.id,
        "source_paper_id": ref.source_paper_id,
        "target_paper_id": ref.target_paper_id,
        "source_page": ref.source_page,
        "description": ref.description,
        "created_at": ref.created_at.isoformat() if ref.created_at else None,
        "other_paper_title": other_title,
        "other_paper_id": other_id,
    }


@router.get("/paper/{paper_id}")
async def get_paper_references(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get all references for a paper (both as source and target)."""
    stmt = (
        select(PaperReference)
        .where(
            or_(
                PaperReference.source_paper_id == paper_id,
                PaperReference.target_paper_id == paper_id,
            )
        )
        .order_by(PaperReference.created_at.desc())
    )
    result = await db.execute(stmt)
    refs = result.scalars().all()

    output = []
    for ref in refs:
        other_id = ref.target_paper_id if ref.source_paper_id == paper_id else ref.source_paper_id
        other_paper = await db.get(Paper, other_id)
        output.append(_serialize_ref(ref, other_id, other_paper.title if other_paper else "Unknown"))
    return output


# Alias so frontend can call GET /api/references/by-paper/{paper_id}
@router.get("/by-paper/{paper_id}")
async def get_references_by_paper(paper_id: int, db: AsyncSession = Depends(get_db)):
    return await get_paper_references(paper_id, db)


@router.post("")
async def create_reference(body: ReferenceCreate, db: AsyncSession = Depends(get_db)):
    """Create a new paper reference."""
    source = await db.get(Paper, body.source_paper_id)
    target = await db.get(Paper, body.target_paper_id)
    if not source or not target:
        raise HTTPException(404, "Paper not found")
    if body.source_paper_id == body.target_paper_id:
        raise HTTPException(400, "Cannot reference self")

    ref = PaperReference(
        source_paper_id=body.source_paper_id,
        target_paper_id=body.target_paper_id,
        source_page=body.source_page,
        description=body.description,
    )
    db.add(ref)
    await db.commit()
    await db.refresh(ref)
    return {
        "id": ref.id,
        "source_paper_id": ref.source_paper_id,
        "target_paper_id": ref.target_paper_id,
        "source_page": ref.source_page,
        "description": ref.description,
        "created_at": ref.created_at.isoformat() if ref.created_at else None,
    }


@router.delete("/{ref_id}")
async def delete_reference(ref_id: int, db: AsyncSession = Depends(get_db)):
    ref = await db.get(PaperReference, ref_id)
    if not ref:
        raise HTTPException(404, "Reference not found")
    await db.delete(ref)
    await db.commit()
    return {"ok": True}
