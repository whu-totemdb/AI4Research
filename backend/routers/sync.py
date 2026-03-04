from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import SyncConfig
from services.webdav_service import encrypt_password, WebDAVSyncService

router = APIRouter(prefix="/api/sync", tags=["sync"])

_sync_status: dict = {"running": False, "last_result": None, "error": None}


class SyncConfigCreate(BaseModel):
    webdav_url: str = "https://dav.jianguoyun.com/dav/"
    username: str
    password: str
    sync_folder: str = "/AI4Research"


class SyncConfigOut(BaseModel):
    id: int
    webdav_url: str
    username: str
    sync_folder: str
    last_sync_at: str | None = None


@router.get("/config")
async def get_sync_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SyncConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        return None
    return SyncConfigOut(
        id=cfg.id,
        webdav_url=cfg.webdav_url,
        username=cfg.username,
        sync_folder=cfg.sync_folder,
        last_sync_at=cfg.last_sync_at.isoformat() if cfg.last_sync_at else None,
    )


@router.post("/config")
async def save_sync_config(body: SyncConfigCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SyncConfig).limit(1))
    cfg = result.scalar_one_or_none()
    encrypted = encrypt_password(body.password)
    if cfg:
        cfg.webdav_url = body.webdav_url
        cfg.username = body.username
        cfg.password = encrypted
        cfg.sync_folder = body.sync_folder
    else:
        cfg = SyncConfig(
            webdav_url=body.webdav_url,
            username=body.username,
            password=encrypted,
            sync_folder=body.sync_folder,
        )
        db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return SyncConfigOut(
        id=cfg.id,
        webdav_url=cfg.webdav_url,
        username=cfg.username,
        sync_folder=cfg.sync_folder,
        last_sync_at=cfg.last_sync_at.isoformat() if cfg.last_sync_at else None,
    )


@router.post("/trigger")
async def trigger_sync(db: AsyncSession = Depends(get_db)):
    if _sync_status["running"]:
        raise HTTPException(409, "Sync already in progress")

    result = await db.execute(select(SyncConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(400, "Sync not configured")

    _sync_status["running"] = True
    _sync_status["error"] = None
    try:
        svc = WebDAVSyncService(cfg.webdav_url, cfg.username, cfg.password, cfg.sync_folder)
        res = await svc.sync()
        cfg.last_sync_at = datetime.utcnow()
        await db.commit()
        _sync_status["last_result"] = res
        return {"status": "ok", **res}
    except Exception as e:
        _sync_status["error"] = str(e)
        raise HTTPException(500, f"Sync failed: {e}")
    finally:
        _sync_status["running"] = False


@router.post("/test")
async def test_sync_connection(body: SyncConfigCreate):
    """Test WebDAV connection without saving config."""
    try:
        svc = WebDAVSyncService.from_plain_password(
            body.webdav_url, body.username, body.password, body.sync_folder
        )
        await svc.test_connection()
        return {"status": "ok", "message": "Connection successful"}
    except Exception as e:
        raise HTTPException(500, f"Connection test failed: {str(e)}")


@router.get("/status")
async def sync_status():
    return _sync_status
