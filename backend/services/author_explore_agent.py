"""
Smart Author Exploration Agent with parallel tool execution.

Key improvements over the old approach:
1. Parallel tool execution via asyncio.gather when LLM requests multiple tools
2. Parallel exploration of multiple authors with concurrency limit
3. Phased exploration strategy in prompt
4. Integration with author_profile_builder for structured analysis
5. Smart stopping — agent evaluates information completeness
"""

import asyncio
import json
import logging
import re
import sys
from typing import AsyncGenerator

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.ai_chat_service import (
    _is_claude_provider,
    _chat_with_tools_claude,
    _chat_with_tools_openai,
)
from services.mcp_tools import MCPToolRegistry, get_tool_secrets

logger = logging.getLogger(__name__)

# Max concurrent authors to explore at once
MAX_AUTHOR_CONCURRENCY = 2


async def _load_secrets_once(db: AsyncSession) -> dict:
    """Load tool secrets once, before parallel execution."""
    return await get_tool_secrets(db)


def _inject_secrets(tool_name: str, args: dict, secrets: dict) -> dict:
    """Inject API keys into tool args (no DB access needed)."""
    args = dict(args)
    if tool_name == "tavily_search":
        args["_api_key"] = secrets.get("tavily_api_key", "")
    elif tool_name == "searxng_search":
        args["_api_key"] = secrets.get("searxng_url", "")
    elif tool_name == "serper_search":
        args["_api_key"] = secrets.get("serper_api_key", "")
    return args


async def _execute_tools_parallel(
    tool_calls: list[dict],
    tool_map: dict,
    secrets: dict,
) -> list[dict]:
    """Execute multiple tool calls in parallel using asyncio.gather.
    Secrets are pre-loaded to avoid concurrent DB access."""

    async def _run_one(tc: dict) -> dict:
        name = tc.get("name", "")
        args = tc.get("arguments", {})
        tool_id = tc.get("id", f"tool_{name}")
        tool = tool_map.get(name)
        if not tool:
            return {"id": tool_id, "name": name, "result": json.dumps({"error": f"Unknown tool: {name}"}), "error": True}
        try:
            injected = _inject_secrets(name, args, secrets)
            result = await tool.execute(**injected)
            return {"id": tool_id, "name": name, "result": json.dumps(result, ensure_ascii=False), "error": False}
        except Exception as e:
            logger.error(f"Tool {name} failed: {e}", exc_info=True)
            return {"id": tool_id, "name": name, "result": f"Error: {e}", "error": True}

    return await asyncio.gather(*[_run_one(tc) for tc in tool_calls])


def _build_exploration_prompt(
    author_name: str,
    paper_title: str,
    paper_venue: str,
    paper_authors: str,
) -> str:
    return f"""你是一位学术情报分析专家。请对以下作者进行深度学术画像。

**目标作者**: {author_name}
**来源论文**: {paper_title}
**发表场地**: {paper_venue or '未知'}
**全部作者**: {paper_authors}

## 探索策略（你可以自由调整顺序和深度）

**阶段1 — 锚定身份**
- 用来源论文标题在 DBLP/OpenAlex 搜索，确认作者的准确 DBLP 主页 URL
- 如果作者是常见姓名，通过合作者、机构、研究方向交叉验证消歧

**阶段2 — 广泛收集**
- 在 DBLP 搜索该作者更多论文（建议 limit=100 获取完整列表）
- 在 OpenAlex 搜索补充引用数据
- 用网络搜索找 Google Scholar、个人主页、实验室页面
- 如果找到有价值的 URL，用 web_fetch 抓取详细信息

**阶段3 — 深度补充**
- 如果信息不足，尝试不同搜索词（英文名/中文名/机构+姓名）
- 抓取个人主页获取研究兴趣、教育背景、项目信息
- 查找近期动态（最新论文、获奖、学术服务等）

**你可以同时调用多个工具**，系统会并行执行以加速探索。

**效率原则**：
- 通常 3-5 轮工具调用即可收集足够信息，不要过度搜索
- 如果已经获得机构、研究方向、代表性论文、学术链接等核心信息，立即停止探索并输出结果
- 遇到 403/超时等错误的 URL 不要重试，换一个来源

**重要提醒**：
- 完成工具调用后，你必须输出完整的 Markdown 作者档案，不要只回复 "OK" 或 "完成" 等简短确认
- 即使信息不完整，也要按照格式输出一份档案，缺失的部分写"信息不足"

## 输出要求

完成探索后，输出一份**纯净的 Markdown 作者档案**。不要包含任何工具调用日志或探索过程描述。

格式：

# {author_name}

**机构**: [具体机构名称]

**职称/身份**: [如教授、博士生等，未知则省略此行]

**研究方向**: [具体研究方向，用逗号分隔]

## 学术背景

用分条目介绍，每条一个要点，例如：
- **教育经历**: 本科xxx大学，博士xxx大学，导师xxx
- **当前职位**: xxx大学xxx职位
- **学术荣誉**: 获得xxx奖项（如有）
- **学术特色**: 一句话概括其研究风格或核心贡献

## 学术链接

- DBLP: [完整URL]
- Google Scholar: [完整URL]
- 个人主页: [完整URL]
（未找到的链接直接省略，不要写"未找到"）

## 代表性论文

1. **论文标题** - 会议/期刊, 年份 (引用数)
2. ...
（按影响力排序，列出5-10篇最重要的论文）

## 研究轨迹

[基于论文时间线分析研究方向的演变，2-3句话]

## 主要合作者

- 合作者姓名 (机构, 合作论文数)
（列出3-5位最频繁的合作者）

## 与本论文的关系

- 作者位次: [第一作者/中间作者/末位作者/通讯作者]
- 本论文在其研究脉络中的位置: [简要分析]

## 消歧说明

[简要说明如何确认身份，如"通过DBLP主页URL和合作者网络确认"]

## 花边与轶事

[搜集该作者学术之外的有趣信息，例如：竞赛经历(ACM/ICPC等)、开源项目、社交媒体动态、业界演讲、创业经历、兴趣爱好等。如果实在找不到，写"暂无公开信息"。]
"""


async def run_agent_loop(
    provider: dict,
    messages: list[dict],
    tools: list,
    db: AsyncSession,
    max_iterations: int = 25,
) -> AsyncGenerator[dict, None]:
    """
    Agent loop with parallel tool execution.

    Yields events:
      {"type": "tool_call", "tools": [...]}
      {"type": "tool_result", "results": [...]}
      {"type": "content", "text": "..."}
      {"type": "done", "full_content": "..."}
    """
    tools_schema = [t.get_schema() for t in tools]
    tool_map = {t.name: t for t in tools}
    current_messages = messages.copy()
    full_content = ""

    # Pre-load secrets once to avoid concurrent DB access
    secrets = await _load_secrets_once(db)

    for iteration in range(1, max_iterations + 1):
        logger.info(f"Agent iteration {iteration}/{max_iterations}")

        try:
            if _is_claude_provider(provider):
                response = await _chat_with_tools_claude(provider, current_messages, tools_schema)
            else:
                response = await _chat_with_tools_openai(provider, current_messages, tools_schema)
        except Exception as e:
            logger.error(f"Agent API call failed: {e}", exc_info=True)
            yield {"type": "error", "message": f"API调用失败: {e}"}
            break

        tool_calls = response.get("tool_calls", [])
        content = response.get("content", "")

        # No tool calls → agent is done
        if not tool_calls:
            if content:
                full_content += content
                logger.info(f"Agent finished at iteration {iteration}, final content length: {len(content)}")
                logger.info(f"Final content preview: {content[:500]}")
                yield {"type": "content", "text": content}
            else:
                logger.warning(f"Agent finished at iteration {iteration} with NO content")
            break

        # Emit content if any (thinking text before tool calls)
        if content:
            full_content += content
            yield {"type": "content", "text": content}

        # Emit tool call event
        tool_names = [tc["name"] for tc in tool_calls]
        yield {"type": "tool_call", "tools": tool_names, "count": len(tool_calls)}

        # Execute all tool calls in PARALLEL
        results = await _execute_tools_parallel(tool_calls, tool_map, secrets)

        # Emit results summary
        summaries = []
        for r in results:
            size = len(r["result"])
            status = "error" if r["error"] else f"{size}字符"
            summaries.append(f"{r['name']}: {status}")
        yield {"type": "tool_result", "summaries": summaries}

        # Build messages for next iteration
        assistant_msg = {"role": "assistant", "content": content or ""}
        if _is_claude_provider(provider):
            assistant_msg["content"] = []
            if content:
                assistant_msg["content"].append({"type": "text", "text": content})
            for tc in tool_calls:
                assistant_msg["content"].append({
                    "type": "tool_use",
                    "id": tc.get("id", f"tool_{tc['name']}"),
                    "name": tc["name"],
                    "input": tc["arguments"],
                })
            current_messages.append(assistant_msg)
            # Claude: all tool results in one user message
            tool_results_content = []
            for r in results:
                tool_results_content.append({
                    "type": "tool_result",
                    "tool_use_id": r["id"],
                    "content": r["result"],
                    **({"is_error": True} if r["error"] else {}),
                })
            current_messages.append({"role": "user", "content": tool_results_content})
        else:
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.get("id", f"call_{tc['name']}"),
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": json.dumps(tc["arguments"])},
                }
                for tc in tool_calls
            ]
            current_messages.append(assistant_msg)
            for r in results:
                current_messages.append({
                    "role": "tool",
                    "tool_call_id": r["id"],
                    "content": r["result"],
                })

    if iteration >= max_iterations:
        yield {"type": "warning", "message": f"达到最大迭代次数 {max_iterations}"}

    # If final content is too short (< 500 chars), it's likely just "OK" or similar
    # Force one more call to get the full markdown
    if len(full_content) < 500:
        logger.warning(f"Final content too short ({len(full_content)} chars), requesting full output")
        print(f"[DEBUG] Content too short ({len(full_content)} chars), forcing full output", file=sys.stderr)
        current_messages.append({
            "role": "user",
            "content": "请立即输出完整的 Markdown 作者档案。不要只回复确认信息，必须包含所有章节（机构、研究方向、学术背景、学术链接、代表性论文、研究轨迹、主要合作者、与本论文的关系、消歧说明、花边与轶事）。"
        })
        try:
            if _is_claude_provider(provider):
                response = await _chat_with_tools_claude(provider, current_messages, tools_schema)
            else:
                response = await _chat_with_tools_openai(provider, current_messages, tools_schema)
            additional_content = response.get("content", "")
            if additional_content:
                full_content += "\n\n" + additional_content
                logger.info(f"Got additional content: {len(additional_content)} chars")
                print(f"[DEBUG] Got additional {len(additional_content)} chars", file=sys.stderr)
                yield {"type": "content", "text": additional_content}
            else:
                logger.warning(f"Additional request returned empty content")
                print(f"[DEBUG] Additional request returned EMPTY", file=sys.stderr)
        except Exception as e:
            logger.error(f"Failed to get full output: {e}")
            print(f"[DEBUG] Additional request FAILED: {e}", file=sys.stderr)

    yield {"type": "done", "full_content": full_content}


def _extract_markdown(ai_content: str, author_name: str, paper_title: str, paper_venue: str) -> str:
    """Extract clean markdown from agent output, stripping thinking/reasoning text."""
    # Clean tool log artifacts
    ai_content = re.sub(r'\[🔧[^\]]*\]', '', ai_content)
    ai_content = re.sub(r'\[✓[^\]]*\]', '', ai_content)
    ai_content = re.sub(r'\[✗[^\]]*\]', '', ai_content)
    ai_content = re.sub(r'\[⚠️[^\]]*\]', '', ai_content)

    # Try code block extraction first
    md_match = re.search(r'```(?:markdown)?\s*(#.*?)\s*```', ai_content, re.DOTALL)
    if md_match:
        return md_match.group(1).strip()

    # Find the LAST occurrence of a top-level heading (the final profile output)
    # This skips any thinking text that precedes it
    heading_matches = list(re.finditer(r'^# .+', ai_content, re.MULTILINE))
    if heading_matches:
        # Take content from the last top-level heading onward
        last_heading_pos = heading_matches[-1].start()
        markdown = ai_content[last_heading_pos:].strip()
        # Also strip any trailing thinking text after the markdown
        # (unlikely but just in case)
        if len(markdown) > 100:
            return markdown

    # Try finding content after "---" separator (common pattern)
    sep_match = re.search(r'\n---\s*\n(# .+)', ai_content, re.DOTALL)
    if sep_match:
        return sep_match.group(1).strip()

    # Fallback: use everything if it's long enough
    cleaned = re.sub(r'\n{3,}', '\n\n', ai_content).strip()
    if len(cleaned) > 200:
        return cleaned

    return f"# {author_name}\n\n**机构**: 信息不足\n**研究方向**: 信息不足\n\n## 代表性论文\n\n- **{paper_title}** - {paper_venue or '未知'}\n"


def _parse_structured_data(markdown: str, author_name: str, paper_authors_str: str) -> dict:
    """Parse structured fields from markdown for database storage."""
    affiliation = ""
    research_areas = ""
    profile_links = []

    m = re.search(r'\*\*机构\*\*[：:]\s*(.+?)(?:\n|$)', markdown)
    if m:
        affiliation = m.group(1).strip()

    m = re.search(r'\*\*研究方向\*\*[：:]\s*(.+?)(?:\n|$)', markdown)
    if m:
        research_areas = m.group(1).strip()

    for label, pattern in [
        ("DBLP", r'DBLP[：:\s]*(?:\[.*?\]\()?(https?://[^\s\)\]]+)'),
        ("Google Scholar", r'Google Scholar[：:\s]*(?:\[.*?\]\()?(https?://[^\s\)\]]+)'),
        ("Homepage", r'(?:个人主页|Homepage|Personal)[：:\s]*(?:\[.*?\]\()?(https?://[^\s\)\]]+)'),
    ]:
        m = re.search(pattern, markdown)
        if m:
            profile_links.append(f"{label}: {m.group(1)}")

    # Author position
    authors_list = [a.strip() for a in paper_authors_str.split(",") if a.strip()]
    relationship = ""
    if authors_list:
        if authors_list[0] == author_name:
            relationship = "第一作者"
        elif authors_list[-1] == author_name:
            relationship = "末位作者"
        elif author_name in authors_list:
            relationship = "中间作者"

    return {
        "affiliation": affiliation or None,
        "research_areas": research_areas or None,
        "profile_links": "\n".join(profile_links) if profile_links else None,
        "relationship_to_paper": relationship or None,
    }


async def explore_single_author(
    paper_id: int,
    author_name: str,
    paper_title: str,
    paper_venue: str,
    paper_authors: str,
    provider: dict,
    agent_config: dict,
) -> AsyncGenerator[dict, None]:
    """
    Explore a single author with the smart agent.
    Yields SSE-compatible event dicts.
    """
    from database import async_session

    # Build prompt
    prompt = _build_exploration_prompt(author_name, paper_title, paper_venue, paper_authors)

    # Get enabled tools
    enabled_tools = []
    if agent_config and agent_config.get("enabled"):
        for name in agent_config.get("enabled_tools", []):
            tool = MCPToolRegistry.get_tool(name)
            if tool:
                enabled_tools.append(tool)
    if not enabled_tools:
        for name in ["dblp_search", "openalex_search", "searxng_search", "web_fetch", "serper_search", "tavily_search"]:
            tool = MCPToolRegistry.get_tool(name)
            if tool:
                enabled_tools.append(tool)

    logger.info(f"Exploring {author_name} with {len(enabled_tools)} tools")

    try:
        async with async_session() as db:
            messages = [{"role": "user", "content": prompt}]
            final_content = ""

            async for event in run_agent_loop(provider, messages, enabled_tools, db, max_iterations=17):
                etype = event.get("type")

                if etype == "tool_call":
                    tools_str = ", ".join(event.get("tools", []))
                    yield {"type": "tool_call", "tool": tools_str, "query": f"并行调用 {event.get('count', 1)} 个工具"}

                elif etype == "tool_result":
                    summaries = event.get("summaries", [])
                    yield {"type": "tool_result", "tool": "", "summary": " | ".join(summaries)}

                elif etype == "content":
                    text = event.get("text", "")
                    if text.strip():
                        yield {"type": "thinking", "message": text[:200]}

                elif etype == "done":
                    final_content = event.get("full_content", "")
                    print(f"[DEBUG] Agent done, full_content length: {len(final_content)}", file=sys.stderr)
                    print(f"[DEBUG] full_content preview: {final_content[:300]}", file=sys.stderr)

                elif etype == "error":
                    yield {"type": "error", "message": event.get("message", "")}
                    return

                elif etype == "warning":
                    yield {"type": "thinking", "message": event.get("message", "")}

            # Extract and save
            markdown = _extract_markdown(final_content, author_name, paper_title, paper_venue)
            structured = _parse_structured_data(markdown, author_name, paper_authors)

            # Save to DB
            from models import AuthorInfo
            stmt = select(AuthorInfo).where(
                AuthorInfo.paper_id == paper_id,
                AuthorInfo.author_name == author_name,
            )
            result = await db.execute(stmt)
            author_info = result.scalar_one_or_none()

            if author_info:
                author_info.affiliation = structured["affiliation"]
                author_info.research_areas = structured["research_areas"]
                author_info.profile_links = structured["profile_links"]
                author_info.relationship_to_paper = structured["relationship_to_paper"]
                author_info.raw_markdown = markdown
            else:
                author_info = AuthorInfo(
                    paper_id=paper_id,
                    author_name=author_name,
                    raw_markdown=markdown,
                    **structured,
                )
                db.add(author_info)

            await db.commit()

            # Save file
            from database import PAPERS_DIR
            authors_dir = PAPERS_DIR / str(paper_id) / "authors"
            authors_dir.mkdir(parents=True, exist_ok=True)

            from services.author_file_service import resolve_author_file_path
            author_file = resolve_author_file_path(authors_dir, author_name)
            author_file.write_text(markdown, encoding="utf-8")

            logger.info(f"Saved {author_name} → {author_file}")
            yield {"type": "author_saved"}

    except Exception as e:
        logger.error(f"Exploration failed for {author_name}: {e}", exc_info=True)
        yield {"type": "error", "message": str(e)}


async def explore_authors_parallel(
    paper_id: int,
    author_list: list[str],
    paper_title: str,
    paper_venue: str,
    paper_authors: str,
    provider: dict,
    agent_config: dict,
) -> AsyncGenerator[str, None]:
    """
    Explore multiple authors with controlled parallelism.
    Yields SSE data strings.
    """
    total = len(author_list)
    semaphore = asyncio.Semaphore(MAX_AUTHOR_CONCURRENCY)
    event_queue: asyncio.Queue = asyncio.Queue()
    _SENTINEL = object()

    async def _explore_one(idx: int, name: str):
        async with semaphore:
            try:
                await event_queue.put(json.dumps({
                    "type": "progress",
                    "message": f"正在探索 {name} ({idx}/{total})...",
                    "current": idx,
                    "total": total,
                }))

                async for event in explore_single_author(
                    paper_id, name, paper_title, paper_venue, paper_authors,
                    provider, agent_config,
                ):
                    event["author_name"] = name
                    event["author_index"] = idx
                    await event_queue.put(json.dumps(event))

                await event_queue.put(json.dumps({
                    "type": "author_done",
                    "author_name": name,
                    "index": idx,
                    "total": total,
                }))
            except Exception as e:
                await event_queue.put(json.dumps({
                    "type": "error",
                    "message": f"探索 {name} 失败: {e}",
                    "author_name": name,
                }))

    async def _run_all():
        tasks = [
            asyncio.create_task(_explore_one(i, name))
            for i, name in enumerate(author_list, 1)
        ]
        await asyncio.gather(*tasks, return_exceptions=True)
        await event_queue.put(_SENTINEL)

    # Start all explorations in background
    runner = asyncio.create_task(_run_all())

    # Stream events as they arrive
    while True:
        item = await event_queue.get()
        if item is _SENTINEL:
            break
        yield f"data: {item}\n\n"

    yield f'data: {json.dumps({"type": "complete", "message": f"完成 {total} 位作者探索"})}\n\n'
