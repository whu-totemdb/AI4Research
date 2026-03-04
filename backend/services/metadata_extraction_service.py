"""
Metadata Extraction Service - AI Agent-based metadata extraction with tool use.

This service uses an AI agent with access to multiple tools (DBLP, OpenAlex, web search)
to extract comprehensive paper metadata that may not be available in the markdown.
"""

import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from services.ai_chat_service import get_default_provider, chat_with_tools
from services.mcp_tools import MCPToolRegistry

logger = logging.getLogger(__name__)


async def extract_metadata_with_agent(
    db: AsyncSession,
    paper_id: int,
    paper_title: str,
    md_content: Optional[str] = None,
    agent_config: Optional[dict] = None,
) -> dict:
    """
    Extract paper metadata using AI agent with tool access.

    Args:
        db: Database session
        paper_id: Paper ID
        paper_title: Paper title
        md_content: Optional markdown content (first 3000 chars)
        agent_config: Agent service configuration (enabled_tools, tool_priority, etc.)

    Returns:
        dict with keys: title, authors, venue, publish_date, abstract, doi, arxiv_id
    """

    # Get AI provider
    provider = await get_default_provider(db)
    if not provider:
        logger.warning(f"No AI provider configured for metadata extraction")
        return {}

    # Build agent prompt
    prompt = _build_extraction_prompt(paper_title, md_content)

    # Get enabled tools from agent config
    enabled_tools = []
    if agent_config and agent_config.get("enabled"):
        tool_names = agent_config.get("enabled_tools", [])
        for tool_name in tool_names:
            tool = MCPToolRegistry.get_tool(tool_name)
            if tool:
                enabled_tools.append(tool)

    # If no tools configured, use default set
    if not enabled_tools:
        default_tools = ["dblp_search", "openalex_search", "searxng_search"]
        for tool_name in default_tools:
            tool = MCPToolRegistry.get_tool(tool_name)
            if tool:
                enabled_tools.append(tool)

    logger.info(f"Paper {paper_id}: Starting metadata extraction with {len(enabled_tools)} tools")

    # Call AI with tools
    try:
        messages = [{"role": "user", "content": prompt}]
        response_text = ""

        async for chunk in chat_with_tools(provider, messages, enabled_tools, db):
            response_text += chunk

        # Parse JSON response
        metadata = _parse_metadata_json(response_text)
        logger.info(f"Paper {paper_id}: Extracted metadata: {list(metadata.keys())}")
        return metadata

    except Exception as e:
        logger.error(f"Paper {paper_id}: Metadata extraction failed: {e}", exc_info=True)
        return {}


def _build_extraction_prompt(paper_title: str, md_content: Optional[str] = None) -> str:
    """Build the extraction prompt for the AI agent."""

    prompt = f"""你是学术论文元数据提取专家。请提取以下论文的完整元数据。

**当前信息：**
- 标题（可能不准确）：{paper_title}
"""

    if md_content:
        prompt += f"""- 论文内容（前3000字符）：
{md_content}
"""

    prompt += """
**你的任务：**
使用可用工具（DBLP、OpenAlex、网络搜索）智能地查找和验证论文信息。

**关键要求：**

1. **标题提取**：从论文正文提取真实标题，忽略文件名格式（如 "作者 等 - 年份 - 标题"）

2. **作者列表**：完整作者名单，逗号分隔（如：John Doe, Jane Smith）

3. **发表场地（venue）- 最重要**：
   - **必须使用标准缩写格式**：会议缩写 + 年份（如：ICDE 2025, SIGMOD 2024）
   - **arXiv 论文必须检查录取状态**：
     * 在 DBLP/OpenAlex 搜索标题，查看是否有正式发表记录
     * 网络搜索 "论文标题 + accepted" 或 "to appear"
     * 检查论文中是否提到 "Accepted by", "To appear in", "Published in"
     * **已录取**：venue = 会议缩写（如 "ICML 2025"），保留 arxiv_id
     * **未录取**：venue = "arXiv"，保留 arxiv_id
   - **期刊形式的会议**：统一为会议缩写
     * "Proceedings of the ACM on Management of Data" → "SIGMOD 2025"
     * "Proceedings of the VLDB Endowment" → "VLDB 2025"

   **常见缩写**：
   - 数据库：SIGMOD, VLDB, ICDE, EDBT, CIDR
   - 机器学习：NeurIPS, ICML, ICLR, AAAI, CVPR
   - 系统：OSDI, SOSP, NSDI, ATC, EuroSys

4. **发表日期**：YYYY-MM-DD 或 YYYY（已录取用会议日期，未录取用 arXiv 日期）

5. **摘要**：完整摘要（优先从 Markdown，否则从搜索结果）

6. **DOI**：格式如 10.1145/xxx（arXiv 预印本通常无 DOI）

7. **arXiv ID**：格式如 2401.12345（如有）

**工作流程：**
1. 从论文内容提取真实标题
2. **重点**：如果是 arXiv 论文，必须多方验证录取状态
3. 在 DBLP/OpenAlex 搜索标题
4. 网络搜索补充信息
5. 规范化 venue 为标准缩写格式
6. 交叉验证所有信息

**判断原则：**
- 优先使用学术数据库（DBLP、OpenAlex）的信息
- 如果多个来源冲突，选择最权威的来源
- arXiv 论文：有任何正式发表证据就使用会议/期刊名称
- 无法确定的信息返回 null
- **必须返回 JSON 格式**

**返回格式：**
```json
{
  "title": "完整论文标题",
  "authors": "作者1, 作者2, 作者3",
  "venue": "ICML 2025",
  "publish_date": "2025-07",
  "abstract": "论文摘要",
  "doi": "10.xxxx/xxxxx",
  "arxiv_id": "2501.12345"
}
```

**示例：**
- 已录取 arXiv：venue = "ICML 2025", arxiv_id = "2501.12345"
- 未录取 arXiv：venue = "arXiv", arxiv_id = "2501.12345"
- 会议论文：venue = "SIGMOD 2024", doi = "10.1145/xxx"

只返回 JSON，不要其他文字。"""

    return prompt


def _parse_metadata_json(text: str) -> dict:
    """Parse JSON from AI response, handling markdown code blocks."""
    import re

    # Try to find JSON in markdown code block
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        # Try to find raw JSON
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
        else:
            return {}

    try:
        metadata = json.loads(json_str)
        # Clean up null values
        return {k: v for k, v in metadata.items() if v and v != "null"}
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse metadata JSON: {json_str[:200]}")
        return {}
