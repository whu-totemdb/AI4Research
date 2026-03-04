import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from services.mcp_tools import MCPToolRegistry, check_tool_status, execute_tool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp-tools", tags=["mcp-tools"])


@router.get("")
async def list_tools(db: AsyncSession = Depends(get_db)):
    """List all registered MCP tools with their availability status."""
    tools = MCPToolRegistry.list_tools()
    results = []
    for t in tools:
        status = await check_tool_status(t["name"], db)
        results.append({**t, **status})
    return results


@router.post("/{tool_name}/test")
async def test_tool(tool_name: str, db: AsyncSession = Depends(get_db)):
    """Test whether a specific tool is available and working."""
    status = await check_tool_status(tool_name, db)
    if not status.get("available"):
        return {
            "success": False,
            "message": status.get("reason", "Tool not available")
        }

    # Run a quick smoke test
    try:
        if tool_name == "dblp_search":
            result = await execute_tool(tool_name, {"query": "attention is all you need"}, db)
        elif tool_name == "tavily_search":
            result = await execute_tool(tool_name, {"query": "transformer neural network"}, db)
        elif tool_name == "openalex_search":
            result = await execute_tool(tool_name, {"query": "attention is all you need"}, db)
        elif tool_name == "searxng_search":
            result = await execute_tool(tool_name, {"query": "test search"}, db)
        elif tool_name == "serper_search":
            result = await execute_tool(tool_name, {"query": "test search"}, db)
        elif tool_name == "web_fetch":
            result = await execute_tool(tool_name, {"url": "https://www.example.com"}, db)
        else:
            result = await execute_tool(tool_name, {"query": "test"}, db)

        has_error = "error" in result
        if has_error:
            return {
                "success": False,
                "message": result.get("error", "Unknown error")
            }
        else:
            # Success - return result summary
            total = result.get("total", 0)
            length = result.get("length", 0)
            if total > 0:
                return {
                    "success": True,
                    "message": f"测试通过，找到 {total} 个结果"
                }
            elif length > 0:
                return {
                    "success": True,
                    "message": f"测试通过，抓取 {length} 字符"
                }
            else:
                return {
                    "success": True,
                    "message": "测试通过"
                }
    except Exception as e:
        logger.error(f"Tool test failed for {tool_name}: {e}", exc_info=True)
        return {
            "success": False,
            "message": str(e)
        }
