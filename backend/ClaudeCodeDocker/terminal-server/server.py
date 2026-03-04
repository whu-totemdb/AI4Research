import asyncio
import logging
import os
import uuid
from pathlib import Path
from typing import Dict, Optional
import json
import shutil

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Claude Code Terminal Server")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session storage
sessions: Dict[str, 'ClaudeSession'] = {}


class ClaudeSession:
    """Manages a Claude Code session with bubblewrap sandboxing"""

    def __init__(self, session_id: str, workspace_path: str):
        self.session_id = session_id
        self.workspace_path = workspace_path
        self.process: Optional[asyncio.subprocess.Process] = None
        self.websockets: list[WebSocket] = []
        self.running = False
        self.read_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start Claude Code with bubblewrap sandboxing"""
        try:
            # Ensure workspace exists
            os.makedirs(self.workspace_path, exist_ok=True)

            # Build bubblewrap command to restrict access to workspace only
            bwrap_cmd = [
                "bwrap",
                "--ro-bind", "/usr", "/usr",
                "--ro-bind", "/lib", "/lib",
                "--ro-bind", "/lib64", "/lib64",
                "--ro-bind", "/bin", "/bin",
                "--ro-bind", "/sbin", "/sbin",
                "--ro-bind", "/etc", "/etc",
                "--bind", self.workspace_path, "/workspace",
                "--proc", "/proc",
                "--dev", "/dev",
                "--tmpfs", "/tmp",
                "--chdir", "/workspace",
                "--unshare-all",
                "--share-net",
                "--die-with-parent",
                "--",
                "claude-code",
                "--cwd", "/workspace"
            ]

            logger.info(f"Starting Claude Code session {self.session_id} with command: {' '.join(bwrap_cmd)}")

            self.process = await asyncio.create_subprocess_exec(
                *bwrap_cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace_path
            )

            self.running = True
            self.read_task = asyncio.create_task(self._read_output())
            logger.info(f"Session {self.session_id} started successfully")

        except Exception as e:
            logger.error(f"Failed to start session {self.session_id}: {e}")
            raise

    async def _read_output(self):
        """Read output from Claude Code and broadcast to all connected WebSockets"""
        try:
            while self.running and self.process:
                # Read stdout
                if self.process.stdout:
                    data = await self.process.stdout.read(1024)
                    if data:
                        await self._broadcast(data.decode('utf-8', errors='replace'))
                    else:
                        break

                # Read stderr
                if self.process.stderr:
                    err_data = await self.process.stderr.read(1024)
                    if err_data:
                        await self._broadcast(err_data.decode('utf-8', errors='replace'))

        except Exception as e:
            logger.error(f"Error reading output for session {self.session_id}: {e}")
        finally:
            self.running = False

    async def _broadcast(self, message: str):
        """Broadcast message to all connected WebSockets"""
        disconnected = []
        for ws in self.websockets:
            try:
                await ws.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.append(ws)

        # Remove disconnected WebSockets
        for ws in disconnected:
            self.websockets.remove(ws)

    async def write_input(self, data: str):
        """Write input to Claude Code stdin"""
        if self.process and self.process.stdin:
            try:
                self.process.stdin.write(data.encode('utf-8'))
                await self.process.stdin.drain()
            except Exception as e:
                logger.error(f"Error writing input for session {self.session_id}: {e}")

    def add_websocket(self, ws: WebSocket):
        """Add a WebSocket connection to this session"""
        self.websockets.append(ws)

    def remove_websocket(self, ws: WebSocket):
        """Remove a WebSocket connection from this session"""
        if ws in self.websockets:
            self.websockets.remove(ws)

    async def stop(self):
        """Stop the Claude Code session"""
        self.running = False

        if self.read_task:
            self.read_task.cancel()
            try:
                await self.read_task
            except asyncio.CancelledError:
                pass

        if self.process:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
            except Exception as e:
                logger.error(f"Error stopping session {self.session_id}: {e}")

        # Close all WebSockets
        for ws in self.websockets:
            try:
                await ws.close()
            except Exception:
                pass
        self.websockets.clear()

        logger.info(f"Session {self.session_id} stopped")


# REST API Endpoints

@app.post("/api/sessions")
async def create_session():
    """Create a new Claude Code session"""
    session_id = str(uuid.uuid4())
    workspace_path = f"/workspace/{session_id}"

    try:
        session = ClaudeSession(session_id, workspace_path)
        await session.start()
        sessions[session_id] = session

        logger.info(f"Created session {session_id}")
        return JSONResponse({
            "session_id": session_id,
            "workspace_path": workspace_path,
            "status": "running"
        })

    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Destroy a Claude Code session"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        session = sessions[session_id]
        await session.stop()

        # Clean up workspace
        if os.path.exists(session.workspace_path):
            shutil.rmtree(session.workspace_path, ignore_errors=True)

        del sessions[session_id]
        logger.info(f"Deleted session {session_id}")

        return JSONResponse({"status": "deleted", "session_id": session_id})

    except Exception as e:
        logger.error(f"Failed to delete session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload/{folder}")
async def upload_files(folder: str, files: list[UploadFile] = File(...)):
    """Upload files to a workspace folder"""
    workspace_path = f"/workspace/{folder}"

    if not os.path.exists(workspace_path):
        raise HTTPException(status_code=404, detail="Workspace folder not found")

    try:
        uploaded_files = []
        for file in files:
            file_path = os.path.join(workspace_path, file.filename)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)

            uploaded_files.append(file.filename)
            logger.info(f"Uploaded file {file.filename} to {workspace_path}")

        return JSONResponse({
            "status": "success",
            "uploaded_files": uploaded_files,
            "count": len(uploaded_files)
        })

    except Exception as e:
        logger.error(f"Failed to upload files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/files/{folder}")
async def list_files(folder: str):
    """List files in a workspace folder"""
    workspace_path = f"/workspace/{folder}"

    if not os.path.exists(workspace_path):
        raise HTTPException(status_code=404, detail="Workspace folder not found")

    try:
        files = []
        for root, dirs, filenames in os.walk(workspace_path):
            for filename in filenames:
                file_path = os.path.join(root, filename)
                rel_path = os.path.relpath(file_path, workspace_path)
                files.append({
                    "name": filename,
                    "path": rel_path,
                    "size": os.path.getsize(file_path)
                })

        return JSONResponse({
            "folder": folder,
            "files": files,
            "count": len(files)
        })

    except Exception as e:
        logger.error(f"Failed to list files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse({
        "status": "healthy",
        "active_sessions": len(sessions),
        "sessions": list(sessions.keys())
    })


# WebSocket endpoint

@app.websocket("/ws/terminal/{session_id}")
async def websocket_terminal(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for terminal I/O"""
    await websocket.accept()

    if session_id not in sessions:
        await websocket.send_json({"error": "Session not found"})
        await websocket.close()
        return

    session = sessions[session_id]
    session.add_websocket(websocket)
    logger.info(f"WebSocket connected to session {session_id}")

    try:
        while True:
            data = await websocket.receive_text()
            await session.write_input(data)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected from session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        session.remove_websocket(websocket)


# Cleanup on shutdown

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up all sessions on shutdown"""
    logger.info("Shutting down, cleaning up sessions...")
    for session_id in list(sessions.keys()):
        try:
            await sessions[session_id].stop()
        except Exception as e:
            logger.error(f"Error stopping session {session_id}: {e}")


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
