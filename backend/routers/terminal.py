from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from services.terminal_service import terminal_manager
from middleware.path_validator import get_safe_paper_dir

logger = logging.getLogger(__name__)

router = APIRouter(tags=["terminal"])


# ---------- Pydantic models ----------

class CreateSessionPayload(BaseModel):
    paper_id: int | None = None


class ContextPayload(BaseModel):
    title: str = ""
    authors: str = ""
    abstract: str = ""
    notes: str = ""
    selectedText: str = ""


# ---------- REST endpoints ----------

@router.post("/api/terminal/sessions")
async def create_session(payload: CreateSessionPayload = None):
    """
    Create a new terminal session running claude.

    SECURITY NOTE: In local mode, Claude runs with full system access.
    Path validation provides basic protection but cannot prevent all risks.
    Only use with trusted code and in controlled environments.
    """
    work_dir = None
    mode = "local"  # Default mode

    if payload and payload.paper_id is not None:
        # Validate and get paper directory using path validator
        work_dir = get_safe_paper_dir(payload.paper_id)
        if work_dir is None:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid or non-existent paper directory for paper_id={payload.paper_id}"
            )
        logger.info(f"Creating session for paper_id={payload.paper_id} at {work_dir}")

    session_id = await terminal_manager.create_session(work_dir=work_dir)

    return {
        "sessionId": session_id,
        "mode": mode,
        "securityWarning": (
            "Local mode: Claude has full system access. "
            "Path validation is active but provides limited protection. "
            "Only use with trusted code."
        )
    }


@router.delete("/api/terminal/sessions/{session_id}")
async def destroy_session(session_id: str):
    """Destroy a terminal session."""
    session = terminal_manager.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    await terminal_manager.destroy_session(session_id)
    return {"ok": True}


@router.post("/api/terminal/sessions/{session_id}/context")
async def inject_context(session_id: str, payload: ContextPayload):
    """Inject paper context into the session's CLAUDE.md."""
    session = terminal_manager.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    await session.inject_context(payload.model_dump())
    return {"ok": True}


# ---------- WebSocket ----------

@router.websocket("/ws/terminal/{session_id}")
async def terminal_ws(ws: WebSocket, session_id: str):
    """Bidirectional WebSocket bridge between xterm.js and the terminal process."""
    session = terminal_manager.get_session(session_id)
    if not session:
        await ws.close(code=4004, reason="Session not found")
        return

    await ws.accept()
    logger.info("WebSocket connected: session %s", session_id)

    async def ws_to_pty():
        """Forward user keystrokes from WebSocket to the terminal process."""
        try:
            while True:
                data = await ws.receive_text()
                # Resize protocol: \x01R<rows>;<cols>
                if data.startswith("\x01R"):
                    try:
                        parts = data[2:].split(";")
                        rows, cols = int(parts[0]), int(parts[1])
                        await session.resize(rows, cols)
                    except (ValueError, IndexError):
                        pass
                else:
                    await session.write(data)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.debug("ws_to_pty error: %s", exc)

    async def pty_to_ws():
        """Forward terminal output from the process to the WebSocket."""
        try:
            while True:
                data = await session.read()
                if data == b"":
                    if not session.is_alive():
                        try:
                            await ws.send_bytes(b"\r\n[Process exited]\r\n")
                        except Exception:
                            pass
                        break
                    await asyncio.sleep(0.02)
                    continue
                if data:
                    await ws.send_bytes(data)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.debug("pty_to_ws error: %s", exc)

    ws_task = asyncio.create_task(ws_to_pty())
    pty_task = asyncio.create_task(pty_to_ws())

    try:
        done, pending = await asyncio.wait(
            [ws_task, pty_task], return_when=asyncio.FIRST_COMPLETED
        )
        for t in pending:
            t.cancel()
    finally:
        logger.info("WebSocket disconnected: session %s", session_id)
