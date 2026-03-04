from typing import AsyncGenerator
from database import PAPERS_DIR, async_session
from services.paper_fs_service import get_markdown
from services.ai_chat_service import chat_stream, get_default_provider
from models import AppSetting

DEFAULT_SUMMARY_PROMPT = """请对以下学术论文进行全面总结，使用Markdown格式，包含：
## 研究背景与动机
## 核心方法
## 实验设计与结果
## 主要贡献
## 局限性与未来工作
## 关键公式（保留LaTeX格式）

论文内容：
{content}
"""


async def _get_summary_prompt() -> str:
    """Read custom summary prompt from settings, fall back to default."""
    try:
        async with async_session() as session:
            setting = await session.get(AppSetting, "summary_prompt")
            if setting and setting.value and setting.value.strip():
                return setting.value
    except Exception:
        pass
    return DEFAULT_SUMMARY_PROMPT


async def get_summary(paper_id: int) -> str | None:
    """Read papers/{id}/notes/summary.md, return None if not exists"""
    summary_path = PAPERS_DIR / str(paper_id) / "notes" / "summary.md"
    if summary_path.exists():
        return summary_path.read_text(encoding="utf-8")
    return None


async def generate_summary(paper_id: int, db) -> AsyncGenerator[str, None]:
    """Generate full-text summary using AI API, stream chunks, save when done."""
    from models import Paper

    # Get paper to access title for new naming scheme
    paper = await db.get(Paper, paper_id)
    paper_title = paper.title if paper else None

    md_content = get_markdown(paper_id, title=paper_title)
    if not md_content:
        raise ValueError("No markdown content found for this paper")

    provider = await get_default_provider(db)
    if not provider:
        raise ValueError("No AI provider configured")

    max_chars = 60000
    if len(md_content) > max_chars:
        md_content = md_content[:max_chars] + "\n\n[... 内容已截断 ...]"

    prompt_template = await _get_summary_prompt()
    prompt = prompt_template.replace("{content}", md_content)
    messages = [{"role": "user", "content": prompt}]

    full_response = ""
    async for chunk in chat_stream(provider, messages, system_prompt="你是一个学术论文分析专家。"):
        full_response += chunk
        yield chunk

    if full_response:
        summary_dir = PAPERS_DIR / str(paper_id) / "notes"
        summary_dir.mkdir(parents=True, exist_ok=True)
        summary_path = summary_dir / "summary.md"
        summary_path.write_text(full_response, encoding="utf-8")
