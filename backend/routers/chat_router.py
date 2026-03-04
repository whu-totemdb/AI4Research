import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, PAPERS_DIR
from services.ai_chat_service import (
    chat_stream, chat_with_tools, get_default_provider, get_provider_by_id, build_context_messages
)
from services.summary_service import get_summary, generate_summary

router = APIRouter(tags=["chat"])


class ChatStreamRequest(BaseModel):
    paper_id: int
    question: str
    selected_text: str | None = None
    matched_markdown: str | None = None
    context_files: list[str] = []
    provider_id: str | None = None
    history: list[dict] = []


class TranslateRequest(BaseModel):
    text: str
    provider_id: str | None = None


class ChatWithToolsRequest(BaseModel):
    paper_id: int
    question: str
    tools: list[str] = []
    max_turns: int = 5
    selected_text: str | None = None
    matched_markdown: str | None = None
    context_files: list[str] = []
    provider_id: str | None = None
    history: list[dict] = []


@router.post("/api/chat/stream")
async def chat_stream_endpoint(body: ChatStreamRequest, db: AsyncSession = Depends(get_db)):
    from models import Paper

    paper = await db.get(Paper, body.paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    if body.provider_id:
        provider = await get_provider_by_id(db, body.provider_id)
    else:
        provider = await get_default_provider(db)
    if not provider:
        raise HTTPException(400, "No AI provider configured")

    import logging
    logger = logging.getLogger(__name__)

    context_file_contents = []
    paper_dir = PAPERS_DIR / str(body.paper_id)
    logger.info(f"Paper directory: {paper_dir}")
    logger.info(f"Context files requested: {body.context_files}")

    for file_path in body.context_files:
        full_path = paper_dir / file_path
        logger.info(f"Checking file: {full_path}, exists={full_path.exists()}, is_file={full_path.is_file() if full_path.exists() else 'N/A'}")
        if full_path.exists() and full_path.is_file():
            try:
                content = full_path.read_text(encoding="utf-8")
                context_file_contents.append({"name": file_path, "content": content})
                logger.info(f"Successfully read file: {file_path}, length={len(content)}")
            except Exception as e:
                logger.error(f"Failed to read file {file_path}: {e}")
                continue
        else:
            logger.warning(f"File not found or not a file: {full_path}")

    logger.info(f"Total context files loaded: {len(context_file_contents)}")

    paper_info = {
        "title": paper.title,
        "authors": paper.authors or "",
    }

    context_msgs = build_context_messages(
        selected_text=body.selected_text,
        matched_markdown=body.matched_markdown,
        context_files=context_file_contents,
        paper_info=paper_info,
        question=body.question,
    )

    messages = []
    if body.history:
        messages.extend(body.history)
    messages.append(context_msgs[-1])

    system_prompt = context_msgs[0]["content"] if context_msgs else ""

    async def event_generator():
        try:
            async for chunk in chat_stream(provider, messages, system_prompt=system_prompt):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/api/chat/agent")
async def chat_agent_endpoint(body: ChatWithToolsRequest, db: AsyncSession = Depends(get_db)):
    """Agent 模式对话端点，支持工具调用"""
    from models import Paper
    import logging

    logger = logging.getLogger(__name__)

    # 获取论文信息
    paper = await db.get(Paper, body.paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    # 获取 AI provider
    if body.provider_id:
        provider = await get_provider_by_id(db, body.provider_id)
    else:
        provider = await get_default_provider(db)
    if not provider:
        raise HTTPException(400, "No AI provider configured")

    # 加载上下文文件
    context_file_contents = []
    paper_dir = PAPERS_DIR / str(body.paper_id)

    for file_path in body.context_files:
        full_path = paper_dir / file_path
        if full_path.exists() and full_path.is_file():
            try:
                content = full_path.read_text(encoding="utf-8")
                context_file_contents.append({"name": file_path, "content": content})
            except Exception as e:
                logger.error(f"Failed to read file {file_path}: {e}")
                continue

    # 构建上下文消息
    paper_info = {
        "title": paper.title,
        "authors": paper.authors or "",
    }

    context_msgs = build_context_messages(
        selected_text=body.selected_text,
        matched_markdown=body.matched_markdown,
        context_files=context_file_contents,
        paper_info=paper_info,
        question=body.question,
    )

    # 构建消息列表，包含 system prompt
    messages = []

    # 添加 system prompt 作为第一条消息
    if context_msgs and context_msgs[0].get("role") == "system":
        messages.append(context_msgs[0])

    # 添加历史消息
    if body.history:
        messages.extend(body.history)

    # 添加当前问题
    if len(context_msgs) > 1:
        messages.append(context_msgs[-1])
    elif context_msgs:
        messages.append({"role": "user", "content": body.question})

    # 使用 Agent 模式进行对话
    async def event_generator():
        try:
            # 获取工具实例
            from services.mcp_tools import MCPToolRegistry

            tool_instances = []
            for tool_name in body.tools:
                tool = MCPToolRegistry.get_tool(tool_name)
                if tool:
                    tool_instances.append(tool)
                else:
                    logger.warning(f"Tool not found: {tool_name}")

            if not tool_instances:
                raise ValueError("No valid tools found")

            async for chunk in chat_with_tools(
                provider=provider,
                messages=messages,
                tools=tool_instances,
                db=db,
                max_iterations=body.max_turns,
                paper_id=body.paper_id,
            ):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.error(f"Agent chat error: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/api/translate/stream")
async def translate_stream_endpoint(body: TranslateRequest, db: AsyncSession = Depends(get_db)):
    """Stream translation of text using AI"""
    from models import AppSetting

    # Get translation settings
    translation_prompt_setting = await db.get(AppSetting, "translation_prompt")
    translation_prompt = translation_prompt_setting.value if translation_prompt_setting else "请将以下文本翻译成中文，保持专业术语的准确性："

    # Get provider
    if body.provider_id:
        provider = await get_provider_by_id(db, body.provider_id)
    else:
        # Try to get translation-specific provider
        translation_provider_setting = await db.get(AppSetting, "translation_provider_id")
        if translation_provider_setting and translation_provider_setting.value:
            provider = await get_provider_by_id(db, translation_provider_setting.value)
        else:
            provider = await get_default_provider(db)

    if not provider:
        raise HTTPException(400, "No AI provider configured")

    # Build messages
    system_prompt = translation_prompt
    messages = [{"role": "user", "content": body.text}]

    async def event_generator():
        try:
            async for chunk in chat_stream(provider, messages, system_prompt=system_prompt):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/api/papers/{paper_id}/summary")
async def get_paper_summary(paper_id: int):
    content = await get_summary(paper_id)
    if content is None:
        raise HTTPException(404, "No summary found")
    return {"content": content}


@router.put("/api/papers/{paper_id}/summary")
async def save_paper_summary(paper_id: int, body: dict):
    content = body.get("content", "")
    summary_path = PAPERS_DIR / str(paper_id) / "notes" / "summary.md"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(content, encoding="utf-8")
    return {"ok": True}


@router.post("/api/papers/{paper_id}/summary/generate")
async def generate_paper_summary(paper_id: int, db: AsyncSession = Depends(get_db)):
    async def event_generator():
        try:
            async for chunk in generate_summary(paper_id, db):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ============================================================================
# PageIndex endpoints
# ============================================================================

class PageIndexGenerateRequest(BaseModel):
    model: str = "gpt-4o-2024-11-20"
    provider_id: str | None = None


class PageIndexSearchRequest(BaseModel):
    query: str
    provider_id: str | None = None
    max_nodes: int = 3


@router.post("/api/papers/{paper_id}/pageindex/generate")
async def generate_pageindex(
    paper_id: int,
    body: PageIndexGenerateRequest,
    db: AsyncSession = Depends(get_db)
):
    """生成 PageIndex 索引（流式返回执行信息）"""
    from models import Paper
    from services.ai_chat_service import get_provider_by_id, get_default_provider
    from services.paper_fs_service import get_md_filename
    from pathlib import Path
    import asyncio
    import os
    import shutil
    import logging

    logger = logging.getLogger(__name__)

    # 获取论文信息
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    # 检查是否有 Markdown 文件
    if not paper.has_markdown:
        raise HTTPException(400, "Paper does not have markdown file. Please convert PDF first.")

    # 获取 AI provider 配置
    if body.provider_id:
        provider = await get_provider_by_id(db, body.provider_id)
    else:
        provider = await get_default_provider(db)

    if not provider:
        raise HTTPException(400, "No AI provider configured")

    async def stream_generation():
        try:
            from database import PAPERS_DIR

            # 获取路径
            PAGEINDEX_DIR = Path(__file__).parent.parent.parent / "OtherProject" / "PageIndex"
            PAGEINDEX_SCRIPT = PAGEINDEX_DIR / "run_pageindex.py"

            paper_dir = PAPERS_DIR / str(paper_id)

            # 查找 .md 文件（不使用 get_md_filename，直接扫描目录）
            md_files = list(paper_dir.glob("*.md"))
            if not md_files:
                yield f"data: {json.dumps({'error': 'Markdown file not found in paper directory'})}\n\n"
                return

            md_path = md_files[0]  # 使用找到的第一个 .md 文件
            md_filename = md_path.name

            yield f"data: {json.dumps({'status': 'starting', 'message': f'找到 Markdown 文件: {md_filename}'})}\n\n"

            # 读取 PageIndex 的 .env 文件获取模型名称
            pageindex_env_path = PAGEINDEX_DIR / ".env"
            model_name = "pageindex_claude"  # 默认值
            if pageindex_env_path.exists():
                with open(pageindex_env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.startswith('MODEL_NAME='):
                            model_name = line.split('=', 1)[1].strip()
                            break

            # 构建命令（显式传递 model 参数，使用 .env 中的配置）
            cmd = [
                "python",
                str(PAGEINDEX_SCRIPT),
                "--md_path", str(md_path),
                "--model", model_name,
                "--if-add-node-id", "yes",
                "--if-add-node-summary", "yes",
                "--if-add-node-text", "yes",
                "--if-add-doc-description", "no",
            ]

            # 不设置环境变量，让脚本使用 .env 文件
            env = os.environ.copy()

            yield f"data: {json.dumps({'status': 'starting', 'message': '开始生成 PageIndex...'})}\n\n"

            # 执行命令（使用线程避免 Windows asyncio 限制）
            import subprocess
            from concurrent.futures import ThreadPoolExecutor

            def run_pageindex():
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    cwd=str(PAGEINDEX_DIR),
                    env=env,
                    text=True,
                    bufsize=1
                )
                return process

            # 在线程池中启动进程
            executor = ThreadPoolExecutor(max_workers=1)
            loop = asyncio.get_event_loop()
            process = await loop.run_in_executor(executor, run_pageindex)

            # 实时读取输出
            while True:
                line = process.stdout.readline()
                if not line:
                    break
                line_text = line.strip()
                if line_text:
                    yield f"data: {json.dumps({'status': 'running', 'message': line_text})}\n\n"

            # 等待进程结束
            process.wait()

            if process.returncode != 0:
                yield f"data: {json.dumps({'error': 'PageIndex generation failed'})}\n\n"
                return

            # 检查并移动生成的文件
            base_name = md_filename.rsplit('.', 1)[0]
            source_path = PAGEINDEX_DIR / "results" / f"{base_name}_structure.json"
            target_path = paper_dir / f"{base_name}_structure.json"

            if not source_path.exists():
                yield f"data: {json.dumps({'error': f'Index file not generated: {source_path}'})}\n\n"
                return

            # 移动文件
            shutil.move(str(source_path), str(target_path))

            yield f"data: {json.dumps({'status': 'completed', 'message': 'PageIndex 生成成功！', 'index_path': str(target_path)})}\n\n"

        except Exception as e:
            logger.error(f"Error generating PageIndex: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream_generation(), media_type="text/event-stream")


@router.get("/api/papers/{paper_id}/pageindex/status")
async def get_pageindex_status(paper_id: int, db: AsyncSession = Depends(get_db)):
    """检查 PageIndex 索引状态"""
    from models import Paper
    from services.pageindex_service import check_index_exists, get_index_path

    # 获取论文信息
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    # 检查索引是否存在
    exists = check_index_exists(paper_id, paper.title)

    result = {
        "exists": exists,
        "paper_id": paper_id,
        "has_markdown": paper.has_markdown
    }

    if exists:
        index_path = get_index_path(paper_id, paper.title)
        result["index_path"] = str(index_path)

    return result


@router.post("/api/papers/{paper_id}/pageindex/search")
async def search_pageindex(
    paper_id: int,
    body: PageIndexSearchRequest,
    db: AsyncSession = Depends(get_db)
):
    """使用 PageIndex 执行检索"""
    from models import Paper
    from services.pageindex_service import search_content, check_index_exists, PageIndexError
    from services.ai_chat_service import get_provider_by_id, get_default_provider
    import logging

    logger = logging.getLogger(__name__)

    # 获取论文信息
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")

    # 检查索引是否存在
    if not check_index_exists(paper_id, paper.title):
        raise HTTPException(400, "Index not found. Please generate index first.")

    # 获取 AI provider 配置
    if body.provider_id:
        provider = await get_provider_by_id(db, body.provider_id)
    else:
        provider = await get_default_provider(db)

    if not provider:
        raise HTTPException(400, "No AI provider configured")

    try:
        # 执行检索
        answer = await search_content(
            paper_id=paper_id,
            query=body.query,
            title=paper.title,
            provider_config=provider,
            max_nodes=body.max_nodes
        )

        logger.info(f"PageIndex search completed for paper {paper_id}")

        return {
            "success": True,
            "query": body.query,
            "answer": answer
        }

    except PageIndexError as e:
        logger.error(f"PageIndex search failed for paper {paper_id}: {e}")
        raise HTTPException(500, str(e))
    except Exception as e:
        logger.error(f"Unexpected error in PageIndex search for paper {paper_id}: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to search: {str(e)}")
