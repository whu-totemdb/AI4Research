import httpx
import asyncio
import zipfile
import io
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MINERU_API_BASE = "https://mineru.net/api/v4"


async def get_mineru_api_key(db: AsyncSession) -> str:
    """Read mineru_api_key from AppSetting table"""
    from models import AppSetting
    result = await db.execute(select(AppSetting).where(AppSetting.key == "mineru_api_key"))
    setting = result.scalar_one_or_none()
    if not setting or not setting.value:
        raise ValueError("MinerU API key not configured")
    return setting.value


async def convert_pdf_to_md(db: AsyncSession, paper_id: int) -> dict:
    """Batch upload flow: get presigned URL, upload PDF, return batch_id."""
    from database import PAPERS_DIR

    api_key = await get_mineru_api_key(db)
    pdf_path = PAPERS_DIR / str(paper_id) / "paper.pdf"
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found for paper {paper_id}")

    # Step 1: Request presigned upload URL
    async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
        resp = await client.post(
            f"{MINERU_API_BASE}/file-urls/batch",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "files": [{"name": "paper.pdf", "url": "to_be_uploaded"}],
                "is_ocr": True,
                "enable_formula": True,
            },
        )
        if resp.status_code != 200:
            logger.error(f"MinerU batch request HTTP {resp.status_code}: {resp.text}")
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"MinerU batch request failed: {data}")
        batch_id = data["data"]["batch_id"]
        presigned_url = data["data"]["file_urls"][0]

    # Step 2: Upload PDF bytes via PUT to presigned URL
    pdf_bytes = pdf_path.read_bytes()
    async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
        resp = await client.put(presigned_url, content=pdf_bytes)
        if resp.status_code != 200:
            logger.error(f"MinerU presigned upload HTTP {resp.status_code}: {resp.text}")
        resp.raise_for_status()

    logger.info(f"Paper {paper_id}: uploaded to MinerU, batch_id={batch_id}")
    return {"task_id": batch_id}


async def complete_conversion(db: AsyncSession, paper_id: int, batch_id: str) -> str:
    """Poll batch results until done, download zip, extract markdown."""
    from models import Paper
    from services.paper_fs_service import save_markdown

    api_key = await get_mineru_api_key(db)
    max_wait = 600
    elapsed = 0

    # Get paper title for new naming scheme
    paper = await db.get(Paper, paper_id)
    paper_title = paper.title if paper else None

    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        while elapsed < max_wait:
            resp = await client.get(
                f"{MINERU_API_BASE}/extract-results/batch/{batch_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code != 200:
                logger.error(f"MinerU poll HTTP {resp.status_code}: {resp.text}")
            resp.raise_for_status()
            result = resp.json()
            if result.get("code") != 0:
                raise RuntimeError(f"MinerU poll error: {result}")

            extract_result = result["data"]["extract_result"]
            if not extract_result:
                await asyncio.sleep(5)
                elapsed += 5
                continue

            item = extract_result[0]
            state = item.get("state", "pending")

            if state == "done":
                full_zip_url = item.get("full_zip_url")
                if not full_zip_url:
                    raise RuntimeError("MinerU returned done but no full_zip_url")
                logger.info(f"Paper {paper_id}: conversion done, downloading zip")
                break
            elif state == "failed":
                raise RuntimeError(f"MinerU conversion failed for paper {paper_id}")

            await asyncio.sleep(5)
            elapsed += 5
        else:
            raise TimeoutError(f"MinerU conversion timed out after {max_wait}s for paper {paper_id}")

    # Download and extract markdown from zip
    async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
        resp = await client.get(full_zip_url)
        if resp.status_code != 200:
            logger.error(f"MinerU zip download HTTP {resp.status_code}: {resp.text[:500]}")
        resp.raise_for_status()

    md_content = _extract_md_from_zip(resp.content)
    if md_content:
        # Use new naming scheme with paper title
        save_markdown(paper_id, md_content, title=paper_title)
        if paper:
            paper.has_markdown = True
            await db.commit()
        logger.info(f"Paper {paper_id}: markdown saved ({len(md_content)} chars)")
    else:
        logger.warning(f"Paper {paper_id}: no markdown found in zip")

    return md_content or ""


def _extract_md_from_zip(zip_bytes: bytes) -> str | None:
    """Extract the first .md file content from a zip archive."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        md_files = [n for n in zf.namelist() if n.endswith(".md")]
        if not md_files:
            return None
        # Prefer the largest .md file (usually the full content)
        md_files.sort(key=lambda n: zf.getinfo(n).file_size, reverse=True)
        return zf.read(md_files[0]).decode("utf-8")
