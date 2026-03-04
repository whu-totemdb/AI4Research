import json
import httpx
from typing import AsyncGenerator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_ai_providers(db: AsyncSession) -> list[dict]:
    """Read ai_providers JSON from AppSetting table"""
    from models import AppSetting
    result = await db.execute(select(AppSetting).where(AppSetting.key == "ai_providers"))
    setting = result.scalar_one_or_none()
    if not setting or not setting.value:
        return []
    return json.loads(setting.value)


async def get_default_provider(db: AsyncSession) -> dict | None:
    """Get the default provider (is_default=true), or first one"""
    providers = await get_ai_providers(db)
    if not providers:
        return None
    for p in providers:
        if p.get("is_default"):
            return p
    return providers[0]


async def get_provider_by_id(db: AsyncSession, provider_id: str) -> dict | None:
    """Get a specific provider by id"""
    providers = await get_ai_providers(db)
    for p in providers:
        if p.get("id") == provider_id:
            return p
    return None


def _is_claude_provider(provider: dict) -> bool:
    return provider.get("provider_type") == "claude"


async def chat_stream(provider: dict, messages: list[dict], system_prompt: str = "") -> AsyncGenerator[str, None]:
    """Call AI API with streaming. Supports both OpenAI and Claude provider types."""
    api_url = provider["api_url"].rstrip("/")

    if _is_claude_provider(provider):
        yield_gen = _chat_stream_claude(api_url, provider, messages, system_prompt)
    else:
        yield_gen = _chat_stream_openai(api_url, provider, messages, system_prompt)

    async for chunk in yield_gen:
        yield chunk


async def _chat_stream_openai(api_url: str, provider: dict, messages: list[dict], system_prompt: str) -> AsyncGenerator[str, None]:
    """OpenAI-compatible streaming."""
    headers = {
        "Authorization": f"Bearer {provider['api_key']}",
        "Content-Type": "application/json",
    }

    all_messages = []
    if system_prompt:
        all_messages.append({"role": "system", "content": system_prompt})
    all_messages.extend(messages)

    body = {
        "model": provider["model"],
        "messages": all_messages,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", f"{api_url}/chat/completions", json=body, headers=headers) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue


async def _chat_stream_claude(api_url: str, provider: dict, messages: list[dict], system_prompt: str) -> AsyncGenerator[str, None]:
    """Claude/Anthropic-compatible streaming."""
    headers = {
        "x-api-key": provider["api_key"],
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }

    # Claude uses a top-level system param, not a system message
    claude_messages = [m for m in messages if m.get("role") != "system"]

    thinking_budget = provider.get("thinking_budget", 0)

    body = {
        "model": provider["model"],
        "max_tokens": 32768,
        "stream": True,
        "messages": claude_messages,
    }
    if thinking_budget and thinking_budget > 0:
        body["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
    if system_prompt:
        body["system"] = system_prompt

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", f"{api_url}/messages", json=body, headers=headers) as resp:
            resp.raise_for_status()
            in_thinking = False
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    try:
                        event = json.loads(data)
                        event_type = event.get("type", "")
                        if event_type == "content_block_start":
                            block = event.get("content_block", {})
                            if block.get("type") == "thinking":
                                in_thinking = True
                                yield "\n<think>\n"
                        elif event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            delta_type = delta.get("type", "")
                            if delta_type == "thinking_delta":
                                text = delta.get("thinking", "")
                                if text:
                                    yield text
                            elif delta_type == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    yield text
                        elif event_type == "content_block_stop":
                            if in_thinking:
                                in_thinking = False
                                yield "\n</think>\n"
                        elif event_type == "message_stop":
                            return
                    except json.JSONDecodeError:
                        continue


async def chat_single(provider: dict, messages: list[dict], system_prompt: str = "") -> str:
    """Make a single (non-streaming) AI request and return the full response text."""
    api_url = provider["api_url"].rstrip("/")

    if _is_claude_provider(provider):
        return await _chat_single_claude(api_url, provider, messages, system_prompt)
    else:
        return await _chat_single_openai(api_url, provider, messages, system_prompt)


async def _chat_single_openai(api_url: str, provider: dict, messages: list[dict], system_prompt: str) -> str:
    headers = {
        "Authorization": f"Bearer {provider['api_key']}",
        "Content-Type": "application/json",
    }

    all_messages = []
    if system_prompt:
        all_messages.append({"role": "system", "content": system_prompt})
    all_messages.extend(messages)

    body = {
        "model": provider["model"],
        "messages": all_messages,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{api_url}/chat/completions", json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _chat_single_claude(api_url: str, provider: dict, messages: list[dict], system_prompt: str) -> str:
    headers = {
        "x-api-key": provider["api_key"],
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }

    claude_messages = [m for m in messages if m.get("role") != "system"]

    thinking_budget = provider.get("thinking_budget", 0)

    body = {
        "model": provider["model"],
        "max_tokens": 32768,
        "messages": claude_messages,
    }
    if thinking_budget and thinking_budget > 0:
        body["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
    if system_prompt:
        body["system"] = system_prompt

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{api_url}/messages", json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        # Filter for text blocks, skip thinking blocks
        for block in data.get("content", []):
            if block.get("type") == "text":
                return block.get("text", "")
        return ""


def build_context_messages(
    selected_text: str | None,
    matched_markdown: str | None,
    context_files: list[dict],
    paper_info: dict,
    question: str,
) -> list[dict]:
    """Build message list with context for the AI"""
    system_parts = [
        "你是一个学术论文阅读助手。请基于提供的论文上下文回答问题。",
        f"论文标题: {paper_info.get('title', 'Unknown')}",
        "",
        "**输出格式要求**：",
        "- 使用 Markdown 格式输出，支持标题、列表、表格等",
        "- 数学公式必须使用 LaTeX 格式：",
        "  - 行内公式：$formula$",
        "  - 独立公式：$$formula$$",
        "- 示例：$\\langle o, q \\rangle$、$$E[X] = \\sum_{i=1}^{n} p_i x_i$$",
    ]
    if paper_info.get("authors"):
        system_parts.append(f"作者: {paper_info['authors']}")

    user_parts = []

    if context_files:
        user_parts.append("=== 参考文件 ===")
        for cf in context_files:
            user_parts.append(f"--- {cf['name']} ---")
            # Special handling for notes.jsonl files
            if cf['name'].endswith('notes.jsonl'):
                user_parts.append("这是用户在阅读论文时记录的笔记和高亮标注：")
            user_parts.append(cf["content"][:8000])

    if selected_text:
        user_parts.append(f"\n=== PDF选中文本 ===\n{selected_text}")

    if matched_markdown:
        user_parts.append(f"\n=== 匹配的Markdown ===\n{matched_markdown}")

    user_parts.append(f"\n=== 问题 ===\n{question}")

    return [
        {"role": "system", "content": "\n".join(system_parts)},
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]


async def chat_with_tools(
    provider: dict,
    messages: list[dict],
    tools: list,
    db: AsyncSession,
    max_iterations: int = 10,
    paper_id: int | None = None,
) -> AsyncGenerator[str, None]:
    """
    Chat with AI using tools (function calling) - Agent decides when to stop.

    The AI agent autonomously:
    - Decides which tools to call
    - Decides the order of tool calls
    - Decides when it has enough information to answer
    - Decides when to stop calling tools

    Args:
        provider: AI provider config
        messages: Conversation messages
        tools: List of MCPTool instances
        db: Database session for tool execution
        max_iterations: Maximum tool calling iterations (safety limit)
        paper_id: Current paper ID (injected into pageindex_search tool)

    Yields:
        Text chunks from AI responses and tool execution logs
    """
    import logging
    logger = logging.getLogger(__name__)

    # Build tools schema
    tools_schema = [tool.get_schema() for tool in tools]
    tool_map = {tool.name: tool for tool in tools}

    current_messages = messages.copy()
    iteration = 0

    logger.info(f"Starting agent with {len(tools)} tools available")

    while iteration < max_iterations:
        iteration += 1
        logger.info(f"Agent iteration {iteration}/{max_iterations}")

        # Call AI with tools - let it decide what to do
        try:
            if _is_claude_provider(provider):
                response = await _chat_with_tools_claude(provider, current_messages, tools_schema)
            else:
                response = await _chat_with_tools_openai(provider, current_messages, tools_schema)
        except Exception as e:
            logger.error(f"Agent API call failed: {e}", exc_info=True)
            yield f"\n[✗ Agent API 调用失败: {str(e)}]\n\n"
            break

        # Check if AI wants to use tools
        tool_calls = response.get("tool_calls", [])
        content = response.get("content", "")

        logger.info(f"Agent iteration {iteration}: tool_calls={len(tool_calls)}, content_length={len(content)}")
        if content:
            logger.info(f"Agent content preview: {content[:200]}")
        else:
            logger.warning(f"Agent returned no content in iteration {iteration}")

        # If AI returns content without tool calls, it's done
        if not tool_calls:
            if content:
                logger.info("Agent finished - returning final answer")
                yield content
            else:
                logger.warning("Agent returned empty response")
                logger.warning(f"Full response object: {response}")
            break

        # AI wants to use tools - execute them
        logger.info(f"Agent requesting {len(tool_calls)} tool calls")

        # If AI provided thinking/reasoning content along with tool calls, yield it
        if content:
            logger.info(f"Agent provided reasoning before tool calls: {content[:100]}")
            yield content

        # Add assistant message with tool calls
        assistant_msg = {"role": "assistant", "content": content or ""}
        if _is_claude_provider(provider):
            # Claude format: content blocks
            assistant_msg["content"] = []
            if content:
                assistant_msg["content"].append({"type": "text", "text": content})
            for tc in tool_calls:
                assistant_msg["content"].append({
                    "type": "tool_use",
                    "id": tc.get("id", f"tool_{tc['name']}"),
                    "name": tc["name"],
                    "input": tc["arguments"]
                })
        else:
            # OpenAI format: tool_calls array
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.get("id", f"call_{tc['name']}"),
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"])
                    }
                }
                for tc in tool_calls
            ]

        current_messages.append(assistant_msg)

        # Execute each tool call
        for tool_call in tool_calls:
            tool_name = tool_call.get("name")
            tool_args = tool_call.get("arguments", {})
            tool_id = tool_call.get("id", f"tool_{tool_name}")

            if tool_name not in tool_map:
                logger.warning(f"Unknown tool: {tool_name}")
                error_msg = f"Error: Tool '{tool_name}' not found"

                if _is_claude_provider(provider):
                    current_messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": error_msg
                        }]
                    })
                else:
                    current_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "content": error_msg
                    })
                continue

            try:
                tool = tool_map[tool_name]
                logger.info(f"Executing tool: {tool_name} with args: {tool_args}")

                # Inject paper_id for pageindex_search
                if tool_name == "pageindex_search" and paper_id is not None:
                    tool_args["paper_id"] = paper_id
                    logger.info(f"Injected paper_id={paper_id} into pageindex_search")

                # Inject provider config for pageindex_search
                if tool_name == "pageindex_search":
                    tool_args["_provider_config"] = provider
                    logger.info(f"Injected provider config into pageindex_search")

                # Yield tool execution log
                yield f"\n[🔧 调用工具: {tool_name}]\n"

                # Execute tool
                result = await tool.execute(**tool_args)
                result_str = json.dumps(result, ensure_ascii=False, indent=2)

                logger.info(f"Tool {tool_name} returned: {result_str[:200]}...")

                # Yield tool result preview
                yield f"[✓ 工具返回: {len(result_str)} 字符]\n\n"

                # Add tool result to messages
                if _is_claude_provider(provider):
                    current_messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": result_str
                        }]
                    })
                else:
                    current_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "content": result_str
                    })

            except Exception as e:
                logger.error(f"Tool {tool_name} failed: {e}", exc_info=True)
                error_msg = f"Error executing {tool_name}: {str(e)}"

                yield f"[✗ 工具错误: {str(e)}]\n\n"

                if _is_claude_provider(provider):
                    current_messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": error_msg,
                            "is_error": True
                        }]
                    })
                else:
                    current_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "content": error_msg
                    })

        # Continue loop - let AI decide next action

    # If reached max iterations, force final answer
    if iteration >= max_iterations:
        logger.warning(f"Agent reached max iterations ({max_iterations})")

        # Check if the last response already had content (AI was trying to answer)
        # In that case, don't force another answer to avoid duplication
        if current_messages and current_messages[-1].get("role") == "assistant":
            last_content = current_messages[-1].get("content", "")
            # For Claude format, check content blocks
            if isinstance(last_content, list):
                has_text = any(block.get("type") == "text" and block.get("text") for block in last_content)
            else:
                has_text = bool(last_content)

            if has_text:
                logger.info("Last iteration already had content, skipping forced answer")
                yield "\n\n[⚠️ 已达到最大迭代次数，Agent 停止]"
                return

        yield "\n\n[⚠️ 达到最大迭代次数，正在生成最终答案...]\n\n"

        # Force AI to give final answer based on collected information
        try:
            current_messages.append({
                "role": "user",
                "content": "你已经收集了足够的信息。请基于以上工具返回的结果，直接回答用户的问题。不要再调用工具。"
            })

            if _is_claude_provider(provider):
                response = await _chat_with_tools_claude(provider, current_messages, [])
            else:
                response = await _chat_with_tools_openai(provider, current_messages, [])

            final_content = response.get("content", "")
            if final_content:
                logger.info("Agent generated final answer after max iterations")
                yield final_content
            else:
                logger.warning("Agent failed to generate final answer")
                yield "\n[抱歉，无法生成最终答案]"
        except Exception as e:
            logger.error(f"Failed to generate final answer: {e}", exc_info=True)
            yield f"\n[生成最终答案时出错: {str(e)}]"


async def _chat_with_tools_openai(provider: dict, messages: list[dict], tools_schema: list[dict]) -> dict:
    """OpenAI function calling (non-streaming for simplicity)."""
    headers = {
        "Authorization": f"Bearer {provider['api_key']}",
        "Content-Type": "application/json",
    }

    body = {
        "model": provider["model"],
        "messages": messages,
        "tools": tools_schema,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{provider['api_url'].rstrip('/')}/chat/completions", json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        choice = data["choices"][0]
        message = choice["message"]

        tool_calls = []
        if message.get("tool_calls"):
            for tc in message["tool_calls"]:
                tool_calls.append({
                    "id": tc["id"],  # Keep the ID from OpenAI
                    "name": tc["function"]["name"],
                    "arguments": json.loads(tc["function"]["arguments"])
                })

        return {
            "content": message.get("content", ""),
            "tool_calls": tool_calls
        }


async def _chat_with_tools_claude(provider: dict, messages: list[dict], tools_schema: list[dict]) -> dict:
    """Claude tool use (non-streaming for simplicity)."""
    headers = {
        "x-api-key": provider["api_key"],
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }

    # Convert OpenAI tool schema to Claude format
    claude_tools = []
    for tool in tools_schema:
        func = tool["function"]
        claude_tools.append({
            "name": func["name"],
            "description": func["description"],
            "input_schema": func["parameters"]
        })

    body = {
        "model": provider["model"],
        "max_tokens": 32768,
        "messages": messages,
        "tools": claude_tools,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{provider['api_url'].rstrip('/')}/messages", json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        tool_calls = []
        content_text = ""

        for block in data.get("content", []):
            if block.get("type") == "text":
                content_text += block.get("text", "")
            elif block.get("type") == "tool_use":
                tool_calls.append({
                    "id": block.get("id"),  # Keep the ID from Claude
                    "name": block.get("name"),
                    "arguments": block.get("input", {})
                })

        return {
            "content": content_text,
            "tool_calls": tool_calls
        }

