import asyncio


async def ask_claude_stream(prompt: str):
    """Call claude --print and yield output chunks.

    Uses asyncio.create_subprocess_exec to run:
      claude --print "prompt"

    Yields chunks of text as they come from stdout.
    """
    cmd = ["claude", "--print", prompt]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    while True:
        chunk = await process.stdout.read(256)
        if not chunk:
            break
        yield chunk.decode("utf-8", errors="replace")

    await process.wait()


def build_claude_prompt(
    question: str,
    selected_text: str = "",
    matched_markdown: str = "",
    paper_title: str = "",
    paper_abstract: str = "",
) -> str:
    """Build the prompt for Claude."""
    parts = []
    parts.append("你是一个论文阅读助手。请基于以下论文内容回答用户的问题。回答请使用中文。\n")

    if paper_title:
        parts.append(f"## 论文标题\n{paper_title}\n")
    if paper_abstract:
        parts.append(f"## 摘要\n{paper_abstract}\n")
    if matched_markdown:
        parts.append(f"## 相关段落（Markdown，含公式）\n{matched_markdown}\n")
    if selected_text:
        parts.append(f"## 用户选中的文本\n{selected_text}\n")

    parts.append(f"## 用户问题\n{question}")

    return "\n".join(parts)
