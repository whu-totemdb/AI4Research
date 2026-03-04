from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional

from middleware.path_validator import validate_work_dir

logger = logging.getLogger(__name__)

SESSIONS_DIR = Path(__file__).resolve().parent.parent / "data" / "sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "claude_context.md"

MAX_SESSIONS = 5
IDLE_TIMEOUT = 30 * 60  # 30 minutes


def _use_winpty() -> bool:
    """Check if pywinpty is available."""
    try:
        import winpty  # noqa: F401
        return True
    except ImportError:
        return False


class TerminalSession:
    """
    Represents a terminal session running Claude.

    SECURITY LIMITATIONS:
    - In local mode, Claude has full system access and can execute arbitrary commands
    - Path validation provides basic directory restriction but cannot prevent:
      * Symbolic link attacks
      * Path traversal via command execution
      * Network access or file system operations outside work_dir
    - This is suitable for development/research but NOT for production multi-tenant systems
    - Always run in trusted environments with trusted code only
    """
    def __init__(self, session_id: str, work_dir: Path):
        self.session_id = session_id
        self.work_dir = work_dir
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.last_activity = time.time()
        self._process: Optional[asyncio.subprocess.Process] = None
        self._pty = None  # winpty PtyProcess if available
        self._use_pty = _use_winpty()
        self._closed = False

        # Log session creation with work directory for security audit
        logger.info(
            f"TerminalSession created: session_id={session_id}, "
            f"work_dir={work_dir}, validated={validate_work_dir(work_dir)}"
        )

    async def start(self):
        """Start the claude process in the session work directory."""
        self.last_activity = time.time()

        if self._use_pty:
            try:
                from winpty import PtyProcess
                self._pty = PtyProcess.spawn(
                    ["claude"],
                    cwd=str(self.work_dir),
                )
                logger.info("Session %s started with winpty", self.session_id)
            except Exception as exc:
                logger.warning("winpty failed, falling back to subprocess: %s", exc)
                self._use_pty = False

        if not self._use_pty:
            # Fallback: asyncio subprocess
            self._process = await asyncio.create_subprocess_shell(
                "unset CLAUDECODE && claude",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(self.work_dir),
            )
            logger.info("Session %s started with subprocess (pid=%s)", self.session_id, self._process.pid)

    async def inject_context(self, paper_info: dict):
        """Write paper context into CLAUDE.md in the session work directory."""
        self.last_activity = time.time()
        template = TEMPLATE_PATH.read_text(encoding="utf-8") if TEMPLATE_PATH.exists() else (
            "# 论文上下文\n\n"
            "- 标题：{title}\n- 作者：{authors}\n- 摘要：{abstract}\n\n"
            "## 用户笔记\n{notes}\n\n## 用户选中的文本\n{selected_text}\n"
        )
        content = template.format(
            title=paper_info.get("title", ""),
            authors=paper_info.get("authors", ""),
            abstract=paper_info.get("abstract", ""),
            paper_dir=paper_info.get("paper_dir", ""),
            notes=paper_info.get("notes", ""),
            selected_text=paper_info.get("selectedText", ""),
        )
        claude_md = self.work_dir / "CLAUDE.md"
        claude_md.write_text(content, encoding="utf-8")
        logger.info("Context injected for session %s", self.session_id)

    async def write(self, data: str):
        """Write data to the terminal process stdin."""
        self.last_activity = time.time()
        if self._use_pty and self._pty:
            try:
                self._pty.write(data)
            except Exception as exc:
                logger.debug("pty write error: %s", exc)
        elif self._process and self._process.stdin:
            try:
                self._process.stdin.write(data.encode())
                await self._process.stdin.drain()
            except Exception as exc:
                logger.debug("stdin write error: %s", exc)

    async def read(self) -> bytes:
        """Read data from the terminal process stdout. Returns b'' as sentinel when process ends."""
        self.last_activity = time.time()
        if self._use_pty and self._pty:
            loop = asyncio.get_event_loop()
            try:
                data = await loop.run_in_executor(None, self._pty.read, 4096)
                return data.encode() if isinstance(data, str) else (data or b"")
            except EOFError:
                return b""
            except Exception:
                return b""
        elif self._process and self._process.stdout:
            try:
                data = await self._process.stdout.read(4096)
                return data if data else b""
            except Exception:
                return b""
        return b""

    async def resize(self, rows: int, cols: int):
        """Resize the PTY (only works with winpty)."""
        if self._use_pty and self._pty:
            try:
                self._pty.setwinsize(rows, cols)
            except Exception as exc:
                logger.debug("resize error: %s", exc)

    def is_alive(self) -> bool:
        if self._closed:
            return False
        if self._use_pty and self._pty:
            return self._pty.isalive()
        if self._process:
            return self._process.returncode is None
        return False

    async def close(self):
        """Terminate the process and clean up."""
        if self._closed:
            return
        self._closed = True

        if self._use_pty and self._pty:
            try:
                self._pty.close(force=True)
            except Exception:
                pass
            self._pty = None
        elif self._process:
            try:
                self._process.terminate()
                try:
                    await asyncio.wait_for(self._process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    self._process.kill()
            except Exception:
                pass
            self._process = None

        logger.info("Session %s closed", self.session_id)


class TerminalManager:
    def __init__(self):
        self._sessions: dict[str, TerminalSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    def _ensure_cleanup(self):
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        """Periodically check for idle sessions and clean them up."""
        while True:
            await asyncio.sleep(60)
            now = time.time()
            stale = [
                sid for sid, s in self._sessions.items()
                if now - s.last_activity > IDLE_TIMEOUT
            ]
            for sid in stale:
                logger.info("Cleaning up idle session %s", sid)
                await self.destroy_session(sid)

    async def create_session(self, work_dir: Optional[Path] = None) -> str:
        """
        Create a new terminal session and start the process. Returns session_id.

        Args:
            work_dir: Working directory for the session. If None, creates a temporary session directory.

        Returns:
            session_id: Unique identifier for the created session

        Note:
            Work directory validation is enforced in the router layer via path_validator middleware.
            This service trusts that validated paths are passed from the router.
        """
        self._ensure_cleanup()

        if len(self._sessions) >= MAX_SESSIONS:
            # Evict the oldest idle session
            oldest_sid = min(self._sessions, key=lambda s: self._sessions[s].last_activity)
            logger.warning("Max sessions reached, evicting %s", oldest_sid)
            await self.destroy_session(oldest_sid)

        session_id = uuid.uuid4().hex[:12]
        if work_dir is None:
            work_dir = SESSIONS_DIR / session_id
            logger.info(f"Creating temporary session {session_id} at {work_dir}")
        else:
            logger.info(f"Creating session {session_id} with work_dir={work_dir}")

        session = TerminalSession(session_id, work_dir)
        await session.start()
        self._sessions[session_id] = session
        return session_id

    def get_session(self, session_id: str) -> Optional[TerminalSession]:
        return self._sessions.get(session_id)

    async def destroy_session(self, session_id: str):
        session = self._sessions.pop(session_id, None)
        if session:
            await session.close()
            # Only clean up work directory if it's a temporary session dir (under SESSIONS_DIR)
            # Never delete paper data directories!
            try:
                if SESSIONS_DIR in session.work_dir.parents or session.work_dir.parent == SESSIONS_DIR:
                    shutil.rmtree(session.work_dir, ignore_errors=True)
            except Exception:
                pass

    async def destroy_all(self):
        for sid in list(self._sessions):
            await self.destroy_session(sid)


terminal_manager = TerminalManager()
