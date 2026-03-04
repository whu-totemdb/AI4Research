"""
MCP Tool Registry — extensible tool system for AI Agent function calling.

Tools register themselves at module load time. The registry provides
OpenAI-compatible function schemas so both OpenAI and Claude providers
can use them via tool_use / function_calling.
"""

import logging
from abc import ABC, abstractmethod

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AppSetting

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Abstract base & registry
# ---------------------------------------------------------------------------

class MCPTool(ABC):
    name: str
    description: str
    requires_api_key: bool = False
    api_key_setting: str = ""  # setting key name in AppSetting

    @abstractmethod
    async def execute(self, **kwargs) -> dict:
        ...

    @abstractmethod
    def get_schema(self) -> dict:
        """Return OpenAI function-calling compatible schema."""
        ...


class MCPToolRegistry:
    """Singleton registry for all MCP tools."""

    _tools: dict[str, MCPTool] = {}

    @classmethod
    def register(cls, tool: MCPTool):
        cls._tools[tool.name] = tool

    @classmethod
    def get_tool(cls, name: str) -> MCPTool | None:
        return cls._tools.get(name)

    @classmethod
    def list_tools(cls) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "requires_api_key": t.requires_api_key,
                "api_key_setting": t.api_key_setting,
            }
            for t in cls._tools.values()
        ]

    @classmethod
    def get_tools_schema(cls) -> list[dict]:
        return [t.get_schema() for t in cls._tools.values()]


# ---------------------------------------------------------------------------
# Built-in tool: DBLP search
# ---------------------------------------------------------------------------

class DBLPSearchTool(MCPTool):
    name = "dblp_search"
    description = (
        "Search DBLP for academic paper metadata. "
        "Returns titles, authors, venue, and year for matching papers. "
        "Use this when you need to find or verify publication information. "
        "IMPORTANT: For author exploration, it's recommended to start from a known paper "
        "and then explore the author's DBLP profile, rather than directly searching by author name, "
        "as author name ambiguity (same names) can lead to inaccurate results."
    )
    requires_api_key = False
    api_key_setting = ""

    def get_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query — paper title, author name, or keywords. Note: For author searches, prefer starting from a specific paper to get accurate author DBLP URLs, as many authors share the same name.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results to return (1-200). Use larger value for author bibliography exploration.",
                            "minimum": 1,
                            "maximum": 200,
                        },
                    },
                    "required": ["query"],
                },
            },
        }

    async def execute(self, **kwargs) -> dict:
        query = kwargs.get("query", "")
        if not query:
            return {"error": "query is required"}

        limit = kwargs.get("limit", 50)
        try:
            limit = int(limit)
        except Exception:
            limit = 50
        limit = max(1, min(200, limit))

        url = "https://dblp.org/search/publ/api"
        params = {"q": query, "format": "json", "h": limit}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, params=params)
                if resp.status_code >= 500 and limit > 100:
                    params["h"] = 100
                    resp = await client.get(url, params=params)
                if resp.status_code >= 500 and params["h"] > 50:
                    params["h"] = 50
                    resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning(f"DBLP request failed: {e}")
            return {"error": f"DBLP request failed: {e}"}

        hits = data.get("result", {}).get("hits", {}).get("hit", [])
        results = []
        for hit in hits:
            info = hit.get("info", {})
            authors_raw = info.get("authors", {}).get("author", [])
            if isinstance(authors_raw, dict):
                authors_raw = [authors_raw]
            authors = ", ".join(
                a.get("text", a) if isinstance(a, dict) else str(a)
                for a in authors_raw
            )
            results.append({
                "title": info.get("title", ""),
                "authors": authors,
                "venue": info.get("venue", ""),
                "year": info.get("year", ""),
                "url": info.get("url", ""),
            })

        return {"results": results, "total": len(results)}


# ---------------------------------------------------------------------------
# Built-in tool: Tavily web search
# ---------------------------------------------------------------------------

class TavilySearchTool(MCPTool):
    name = "tavily_search"
    description = (
        "Search the web using Tavily API. "
        "Returns relevant search result snippets. "
        "Use this when DBLP doesn't have enough information or you need "
        "broader web context about a paper."
    )
    requires_api_key = True
    api_key_setting = "tavily_api_key"

    def get_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query",
                        }
                    },
                    "required": ["query"],
                },
            },
        }

    async def execute(self, **kwargs) -> dict:
        query = kwargs.get("query", "")
        api_key = kwargs.get("_api_key", "")
        if not query:
            return {"error": "query is required"}
        if not api_key:
            return {"error": "Tavily API key not configured. Set tavily_api_key in Settings."}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={"query": query, "api_key": api_key},
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning(f"Tavily request failed: {e}")
            return {"error": f"Tavily request failed: {e}"}

        results = []
        for item in data.get("results", [])[:5]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "content": item.get("content", "")[:300],
            })

        return {"results": results, "total": len(results)}


# ---------------------------------------------------------------------------
# Helper: load runtime secrets for tools that need API keys
# ---------------------------------------------------------------------------

async def get_tool_secrets(db: AsyncSession) -> dict:
    """Read API keys from AppSetting that tools may need."""
    tavily_result = await db.execute(
        select(AppSetting).where(AppSetting.key == "tavily_api_key")
    )
    tavily_row = tavily_result.scalar_one_or_none()

    searxng_result = await db.execute(
        select(AppSetting).where(AppSetting.key == "searxng_url")
    )
    searxng_row = searxng_result.scalar_one_or_none()

    serper_result = await db.execute(
        select(AppSetting).where(AppSetting.key == "serper_api_key")
    )
    serper_row = serper_result.scalar_one_or_none()

    return {
        "tavily_api_key": tavily_row.value if tavily_row else "",
        "searxng_url": searxng_row.value if searxng_row else "",
        "serper_api_key": serper_row.value if serper_row else "",
    }


async def execute_tool(tool_name: str, arguments: dict, db: AsyncSession) -> dict:
    """Execute a registered tool by name, injecting secrets as needed."""
    tool = MCPToolRegistry.get_tool(tool_name)
    if not tool:
        return {"error": f"Unknown tool: {tool_name}"}

    # Inject API keys for tools that need them
    secrets = await get_tool_secrets(db)
    if tool_name == "tavily_search":
        arguments["_api_key"] = secrets.get("tavily_api_key", "")
    elif tool_name == "searxng_search":
        arguments["_api_key"] = secrets.get("searxng_url", "")
    elif tool_name == "serper_search":
        arguments["_api_key"] = secrets.get("serper_api_key", "")
    elif tool_name == "pageindex_search":
        # Inject AI provider config for PageIndex
        from services.ai_chat_service import get_default_provider
        provider = await get_default_provider(db)
        if not provider:
            return {"error": "No AI provider configured for PageIndex"}
        arguments["_provider_config"] = provider

    return await tool.execute(**arguments)


async def check_tool_status(tool_name: str, db: AsyncSession) -> dict:
    """Check whether a tool is properly configured and usable."""
    tool = MCPToolRegistry.get_tool(tool_name)
    if not tool:
        return {"name": tool_name, "available": False, "reason": "Tool not found"}

    if tool.requires_api_key:
        secrets = await get_tool_secrets(db)
        if not secrets.get(tool.api_key_setting):
            return {"name": tool_name, "available": False, "reason": f"{tool.api_key_setting} not configured"}

    return {"name": tool_name, "available": True}


# ---------------------------------------------------------------------------
# OpenAlex search tool
# ---------------------------------------------------------------------------

class OpenAlexSearchTool(MCPTool):
    name = "openalex_search"
    description = (
        "Search OpenAlex for academic paper metadata. "
        "OpenAlex is a free, open catalog of the global research system. "
        "Returns titles, authors, venue, year, citation count, and DOI."
    )
    requires_api_key = False
    api_key_setting = ""

    def get_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query – paper title, author name, or keywords",
                        },
                        "per_page": {
                            "type": "integer",
                            "description": "Number of results to return (1-50, default 10). Use higher values for author bibliography.",
                            "minimum": 1,
                            "maximum": 50,
                        },
                    },
                    "required": ["query"],
                },
            },
        }

    async def execute(self, **kwargs) -> dict:
        query = kwargs.get("query", "")
        if not query:
            return {"error": "query is required"}

        import httpx

        url = "https://api.openalex.org/works"
        per_page = kwargs.get("per_page", 10)
        try:
            per_page = max(1, min(50, int(per_page)))
        except Exception:
            per_page = 10

        params = {
            "search": query,
            "per_page": per_page,
            "mailto": "ai4research@example.com",
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = []
        for work in data.get("results", [])[:per_page]:
            authors = [
                a.get("author", {}).get("display_name", "")
                for a in work.get("authorships", [])
            ]
            # primary location for venue
            primary = work.get("primary_location") or {}
            source = primary.get("source") or {}
            venue = source.get("display_name", "")

            results.append({
                "title": work.get("display_name", ""),
                "authors": authors,
                "venue": venue,
                "year": work.get("publication_year"),
                "cited_by_count": work.get("cited_by_count", 0),
                "doi": work.get("doi", ""),
            })

        return {"results": results, "total": data.get("meta", {}).get("count", 0)}


# ---------------------------------------------------------------------------
# SearXNG search tool
# ---------------------------------------------------------------------------

class SearXNGSearchTool(MCPTool):
    name = "searxng_search"
    description = (
        "Search the web using SearXNG meta-search engine. "
        "SearXNG aggregates results from multiple search engines (Google, Bing, DuckDuckGo, etc.). "
        "Returns comprehensive search results with titles, URLs, and content snippets. "
        "Use this for finding author homepages, Google Scholar profiles, and general web information."
    )
    requires_api_key = True
    api_key_setting = "searxng_url"

    def get_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query",
                        }
                    },
                    "required": ["query"],
                },
            },
        }

    async def execute(self, **kwargs) -> dict:
        query = kwargs.get("query", "")
        searxng_url = kwargs.get("_api_key", "")
        if not query:
            return {"error": "query is required"}
        if not searxng_url:
            return {"error": "SearXNG URL not configured. Set searxng_url in Settings."}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{searxng_url}/search",
                    params={"q": query, "format": "json"},
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning(f"SearXNG request failed: {e}")
            return {"error": f"SearXNG request failed: {e}"}

        results = []
        for item in data.get("results", [])[:10]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "content": item.get("content", "")[:300],
            })

        return {"results": results, "total": len(results)}


# ---------------------------------------------------------------------------
# Serper.dev search tool
# ---------------------------------------------------------------------------

class WebFetchTool(MCPTool):
    name = "web_fetch"
    description = (
        "Fetch and extract content from a web page URL. "
        "Returns the main text content of the page (HTML stripped). "
        "Use this to get detailed information from author homepages, Google Scholar profiles, "
        "or any URL found in search results. Essential for extracting publication lists, "
        "research interests, and biographical information."
    )
    requires_api_key = False

    def get_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "The URL to fetch content from",
                        }
                    },
                    "required": ["url"],
                },
            },
        }

    async def execute(self, **kwargs) -> dict:
        url = kwargs.get("url", "")
        if not url:
            return {"error": "url is required"}

        # Retry mechanism: 2 retries with increased timeout
        max_retries = 2
        timeout_seconds = 60

        for attempt in range(max_retries + 1):
            try:
                # Disable SSL verification for compatibility
                async with httpx.AsyncClient(
                    timeout=timeout_seconds,
                    follow_redirects=True,
                    verify=False  # Disable SSL verification
                ) as client:
                    resp = await client.get(url, headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    })
                    resp.raise_for_status()

                    # Simple HTML stripping - extract text content
                    from html.parser import HTMLParser

                    class TextExtractor(HTMLParser):
                        def __init__(self):
                            super().__init__()
                            self.text = []

                        def handle_data(self, data):
                            if data.strip():
                                self.text.append(data.strip())

                    parser = TextExtractor()
                    parser.feed(resp.text)
                    content = " ".join(parser.text)

                    # Limit to first 5000 characters to avoid token overflow
                    if len(content) > 5000:
                        content = content[:5000] + "... (truncated)"

                    return {
                        "url": url,
                        "content": content,
                        "length": len(content)
                    }
            except httpx.TimeoutException as e:
                if attempt < max_retries:
                    logger.warning(f"Web fetch timeout for {url} (attempt {attempt + 1}/{max_retries + 1}), retrying...")
                    continue
                else:
                    logger.error(f"Web fetch failed after {max_retries + 1} attempts for {url}: timeout")
                    return {"error": f"Timeout after {max_retries + 1} attempts: {str(e)}"}
            except Exception as e:
                if attempt < max_retries:
                    logger.warning(f"Web fetch error for {url} (attempt {attempt + 1}/{max_retries + 1}): {e}, retrying...")
                    continue
                else:
                    logger.error(f"Web fetch failed after {max_retries + 1} attempts for {url}: {e}")
                    return {"error": f"Failed after {max_retries + 1} attempts: {str(e)}"}


class SerperSearchTool(MCPTool):
    name = "serper_search"
    description = (
        "Search the web using Serper.dev (Google results API). "
        "Returns titles, URLs, and snippets from Google search results. "
        "Use this when SearXNG results are limited or unavailable."
    )
    requires_api_key = True
    api_key_setting = "serper_api_key"

    def get_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query",
                        }
                    },
                    "required": ["query"],
                },
            },
        }

    async def execute(self, **kwargs) -> dict:
        query = kwargs.get("query", "")
        api_key = kwargs.get("_api_key", "")
        if not query:
            return {"error": "query is required"}
        if not api_key:
            return {"error": "Serper API key not configured. Set serper_api_key in Settings."}

        url = "https://google.serper.dev/search"
        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json",
        }
        body = {"q": query}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(url, headers=headers, json=body)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning(f"Serper request failed: {e}")
            return {"error": f"Serper request failed: {e}"}

        results = []
        for item in data.get("organic", [])[:10]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("link", ""),
                "content": item.get("snippet", "")[:300],
            })

        return {"results": results, "total": len(results)}


# ---------------------------------------------------------------------------
# PageIndex search tool
# ---------------------------------------------------------------------------

class PageIndexSearchTool(MCPTool):
    name = "pageindex_search"
    description = (
        "Search within the current paper using PageIndex hierarchical document structure. "
        "This tool performs intelligent two-stage retrieval: first selects relevant sections "
        "from the paper's structure, then generates a comprehensive answer based on those sections. "
        "Use this when you need to answer specific questions about the paper's content, "
        "such as methodology, contributions, results, or any detailed information. "
        "The paper context is automatically provided - you only need to specify your query. "
        "Requires the paper to have a pre-generated PageIndex."
    )
    requires_api_key = False
    api_key_setting = ""

    def get_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The question or query about the paper's content",
                        },
                        "max_nodes": {
                            "type": "integer",
                            "description": "Maximum number of sections to retrieve (1-5, default 3)",
                            "minimum": 1,
                            "maximum": 5,
                        },
                    },
                    "required": ["query"],
                },
            },
        }

    async def execute(self, **kwargs) -> dict:
        paper_id = kwargs.get("paper_id")
        query = kwargs.get("query", "")
        max_nodes = kwargs.get("max_nodes", 3)

        if not paper_id:
            return {"error": "paper_id is required"}
        if not query:
            return {"error": "query is required"}

        try:
            paper_id = int(paper_id)
            max_nodes = max(1, min(5, int(max_nodes)))
        except Exception:
            return {"error": "Invalid paper_id or max_nodes"}

        # Import here to avoid circular dependency
        from services.pageindex_service import (
            search_content, check_index_exists, generate_index, PageIndexError
        )
        from database import async_session
        from models import Paper

        async with async_session() as db:
            paper = await db.get(Paper, paper_id)
            if not paper:
                return {"error": f"Paper {paper_id} not found"}

            # Check if paper has markdown
            if not paper.has_markdown:
                return {"error": f"Paper {paper_id} does not have markdown file. Please convert PDF first."}

            # Get provider config from kwargs (injected by execute_tool)
            provider_config = kwargs.get("_provider_config")
            if not provider_config:
                return {"error": "AI provider configuration not available"}

            # Check if index exists, auto-generate if not
            if not check_index_exists(paper_id, paper.title):
                logger.info(f"PageIndex not found for paper {paper_id}, auto-generating...")

                try:
                    # Auto-generate index
                    index_path = await generate_index(
                        paper_id=paper_id,
                        title=paper.title,
                        model="gpt-4o-2024-11-20",  # Default model
                        provider_config=provider_config,
                        timeout=600
                    )
                    logger.info(f"PageIndex auto-generated successfully: {index_path}")

                    # Return a message indicating index was generated
                    return {
                        "paper_id": paper_id,
                        "message": f"PageIndex was automatically generated for paper {paper_id}. You can now search again.",
                        "index_generated": True
                    }

                except PageIndexError as e:
                    logger.error(f"Failed to auto-generate PageIndex for paper {paper_id}: {e}")
                    return {"error": f"Failed to generate PageIndex: {str(e)}. Please ensure the paper has a valid markdown file."}
                except Exception as e:
                    logger.error(f"Unexpected error generating PageIndex for paper {paper_id}: {e}", exc_info=True)
                    return {"error": f"Failed to generate PageIndex: {str(e)}"}

            # Index exists, execute search
            try:
                answer = await search_content(
                    paper_id=paper_id,
                    query=query,
                    title=paper.title,
                    provider_config=provider_config,
                    max_nodes=max_nodes
                )

                return {
                    "paper_id": paper_id,
                    "query": query,
                    "answer": answer
                }

            except PageIndexError as e:
                logger.error(f"PageIndex search failed: {e}")
                return {"error": str(e)}


# ---------------------------------------------------------------------------
# Auto-register built-in tools
# ---------------------------------------------------------------------------

MCPToolRegistry.register(DBLPSearchTool())
MCPToolRegistry.register(TavilySearchTool())
MCPToolRegistry.register(OpenAlexSearchTool())
MCPToolRegistry.register(SearXNGSearchTool())
MCPToolRegistry.register(SerperSearchTool())
MCPToolRegistry.register(WebFetchTool())
MCPToolRegistry.register(PageIndexSearchTool())
