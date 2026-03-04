import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Note
from services.paper_fs_service import append_note_to_jsonl, update_note_in_jsonl, delete_note_from_jsonl

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NoteCreate(BaseModel):
    paper_id: int
    title: str | None = "Untitled"
    content: str = ""
    page_number: int | None = None
    selection_text: str | None = None
    position_data: dict | None = None
    note_type: str = "note"
    color: str | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    page_number: int | None = None
    selection_text: str | None = None
    position_data: dict | None = None
    note_type: str | None = None
    color: str | None = None


@router.get("")
async def list_notes(paper_id: int = Query(...), db: AsyncSession = Depends(get_db)):
    # Sync JSONL to database if needed
    await _sync_jsonl_to_db(paper_id, db)

    stmt = select(Note).where(Note.paper_id == paper_id).order_by(Note.page_number, Note.created_at)
    result = await db.execute(stmt)
    return [_note_dict(n) for n in result.scalars().all()]


@router.get("/{note_id}")
async def get_note(note_id: int, db: AsyncSession = Depends(get_db)):
    note = await db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    return _note_dict(note)


@router.post("")
async def create_note(body: NoteCreate, db: AsyncSession = Depends(get_db)):
    print(f"DEBUG: Received note data: {body.model_dump()}")
    note = Note(
        paper_id=body.paper_id,
        title=body.title or "Untitled",
        content=body.content,
        page_number=body.page_number,
        selection_text=body.selection_text,
        position_data=json.dumps(body.position_data) if body.position_data else None,
        note_type=body.note_type,
        color=body.color,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    # Append note to JSONL file
    note_data = {
        "id": note.id,
        "title": note.title or "Untitled",
        "content": note.content,
        "selected_text": note.selection_text,
        "page": note.page_number,
        "color": note.color,
        "note_type": note.note_type,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }
    append_note_to_jsonl(note.paper_id, note_data)

    return _note_dict(note)


@router.put("/{note_id}")
async def update_note(note_id: int, body: NoteUpdate, db: AsyncSession = Depends(get_db)):
    note = await db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "Note not found")

    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.content = body.content
    if body.page_number is not None:
        note.page_number = body.page_number
    if body.selection_text is not None:
        note.selection_text = body.selection_text
    if body.position_data is not None:
        note.position_data = json.dumps(body.position_data)
    if body.note_type is not None:
        note.note_type = body.note_type
    if body.color is not None:
        note.color = body.color
    note.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(note)

    # Update note in JSONL file
    note_data = {
        "id": note.id,
        "title": note.title or "Untitled",
        "content": note.content,
        "selected_text": note.selection_text,
        "page": note.page_number,
        "color": note.color,
        "note_type": note.note_type,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }
    update_note_in_jsonl(note.paper_id, note.id, note_data)

    return _note_dict(note)


@router.delete("/{note_id}")
async def delete_note(note_id: int, db: AsyncSession = Depends(get_db)):
    note = await db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "Note not found")

    # Remove note from JSONL file
    delete_note_from_jsonl(note.paper_id, note.id)

    await db.delete(note)
    await db.commit()
    return {"ok": True}


def _note_dict(n: Note) -> dict:
    return {
        "id": n.id,
        "paper_id": n.paper_id,
        "content": n.content,
        "page_number": n.page_number,
        "selection_text": n.selection_text,
        "position_data": json.loads(n.position_data) if n.position_data else None,
        "file_name": n.file_name,
        "note_type": n.note_type,
        "color": n.color,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


def _extract_title(content: str) -> str:
    """Extract title from content (first line if it starts with #)."""
    if not content:
        return "Untitled"
    lines = content.split('\n')
    if lines and lines[0].startswith('#'):
        return lines[0].replace('#', '').strip()
    return "Untitled"


async def _sync_jsonl_to_db(paper_id: int, db: AsyncSession):
    """Sync notes from JSONL file to database if file was modified externally."""
    from database import PAPERS_DIR
    from dateutil import parser as date_parser

    notes_file = PAPERS_DIR / str(paper_id) / "notes" / "notes.jsonl"
    if not notes_file.exists():
        return

    # Read all notes from JSONL
    jsonl_notes = {}
    try:
        with open(notes_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    note_data = json.loads(line)
                    note_id = note_data.get("id")
                    if note_id:
                        jsonl_notes[note_id] = note_data
    except Exception as e:
        print(f"Error reading notes.jsonl for sync: {e}")
        return

    # Get all notes from database for this paper
    stmt = select(Note).where(Note.paper_id == paper_id)
    result = await db.execute(stmt)
    db_notes = {n.id: n for n in result.scalars().all()}

    # Sync: update existing notes if JSONL has newer data
    for note_id, jsonl_data in jsonl_notes.items():
        db_note = db_notes.get(note_id)

        if db_note:
            # Check if JSONL has newer updated_at timestamp
            jsonl_updated = jsonl_data.get("updated_at")
            if jsonl_updated:
                try:
                    jsonl_updated_dt = date_parser.parse(jsonl_updated)
                    db_updated_dt = db_note.updated_at

                    # Only update if JSONL is newer
                    if not db_updated_dt or jsonl_updated_dt > db_updated_dt:
                        db_note.title = jsonl_data.get("title", "Untitled")
                        db_note.content = jsonl_data.get("content", "")
                        db_note.page_number = jsonl_data.get("page")
                        db_note.selection_text = jsonl_data.get("selected_text")
                        db_note.note_type = jsonl_data.get("note_type", "note")
                        db_note.color = jsonl_data.get("color")
                        db_note.updated_at = jsonl_updated_dt
                except Exception as e:
                    print(f"Error parsing date for note {note_id}: {e}")
        else:
            # Note exists in JSONL but not in DB - create it
            try:
                created_at = jsonl_data.get("created_at")
                updated_at = jsonl_data.get("updated_at")
                new_note = Note(
                    id=note_id,
                    paper_id=paper_id,
                    title=jsonl_data.get("title", "Untitled"),
                    content=jsonl_data.get("content", ""),
                    page_number=jsonl_data.get("page"),
                    selection_text=jsonl_data.get("selected_text"),
                    note_type=jsonl_data.get("note_type", "note"),
                    color=jsonl_data.get("color"),
                    created_at=date_parser.parse(created_at) if created_at else datetime.utcnow(),
                    updated_at=date_parser.parse(updated_at) if updated_at else None,
                )
                db.add(new_note)
            except Exception as e:
                print(f"Error creating note {note_id} from JSONL: {e}")

    await db.commit()

