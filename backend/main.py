import os
import sys

# Remove Claude Code session marker so spawned claude processes don't detect nesting
# Use Windows API directly because os.environ.pop only affects CRT copy,
# while winpty reads the Win32 process environment block
os.environ.pop("CLAUDECODE", None)
if sys.platform == "win32":
    import ctypes
    ctypes.windll.kernel32.SetEnvironmentVariableW("CLAUDECODE", None)

os.environ.setdefault("CLAUDE_CODE_GIT_BASH_PATH", r"D:\Software\Git\bin\bash.exe")

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import init_db, UPLOAD_DIR, PAPERS_DIR
from routers import papers, notes, folders, sync, terminal, claude_router, references, settings, chat_router, mcp_tools, classify


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="AI4Research", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/papers", StaticFiles(directory=str(PAPERS_DIR)), name="papers")

app.include_router(papers.router)
app.include_router(notes.router)
app.include_router(folders.router)
app.include_router(sync.router)
app.include_router(terminal.router)
app.include_router(claude_router.router)
app.include_router(references.router)
app.include_router(settings.router)
app.include_router(chat_router.router)
app.include_router(mcp_tools.router)
app.include_router(classify.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
