import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Paper, Note
from services.matching_service import match_text_to_markdown
from services.paper_fs_service import get_markdown, append_note_to_jsonl
from services.claude_service import ask_claude_stream, build_claude_prompt

router = APIRouter(prefix="/api/papers", tags=["claude"])


class MatchTextRequest(BaseModel):
    selected_text: str


class AskClaudeRequest(BaseModel):
    selected_text: str = ""
    question: str
    matched_markdown: str | None = None


@router.post("/{paper_id}/match-text")
async def match_text(paper_id: int, body: MatchTextRequest, db: AsyncSession = Depends(get_db)):
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    md_content = get_markdown(paper_id, title=paper.title)
    if not md_content:
        raise HTTPException(404, "No markdown file for this paper")

    result = match_text_to_markdown(body.selected_text, md_content)
    if not result:
        return {"matched_section": None, "context_before": "", "context_after": "", "confidence": 0}

    return {
        "matched_section": result.matched_section,
        "context_before": result.context_before,
        "context_after": result.context_after,
        "confidence": result.confidence,
    }


@router.post("/{paper_id}/ask-claude")
async def ask_claude(paper_id: int, body: AskClaudeRequest, db: AsyncSession = Depends(get_db)):
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    prompt = build_claude_prompt(
        question=body.question,
        selected_text=body.selected_text,
        matched_markdown=body.matched_markdown or "",
        paper_title=paper.title,
        paper_abstract=paper.abstract or "",
    )

    async def event_stream():
        full_response = ""
        async for chunk in ask_claude_stream(prompt):
            full_response += chunk
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        # Save as note after completion
        note = Note(
            paper_id=paper_id,
            content=full_response,
            selection_text=body.selected_text,
            note_type="claude_response",
        )
        db.add(note)
        await db.commit()
        await db.refresh(note)

        # Append note to JSONL file
        try:
            note_data = {
                "id": note.id,
                "title": "Claude Response",
                "content": full_response,
                "selected_text": body.selected_text,
                "page": None,
                "color": None,
                "note_type": "claude_response",
                "created_at": note.created_at.isoformat() if note.created_at else None,
            }
            append_note_to_jsonl(paper_id, note_data)
        except Exception:
            pass  # File write is best-effort

        yield f"data: {json.dumps({'done': True, 'note_id': note.id})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
