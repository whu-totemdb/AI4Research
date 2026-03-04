"""
测试新版作者探索 Agent（并行工具调用版本）

用法: python test_author_exploration.py <author_name> [paper_id]
示例: python test_author_exploration.py "Sheng Wang" 8
"""

import asyncio
import sys
import io
import json
import time

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from sqlalchemy import select
from database import async_session, PAPERS_DIR
from models import Paper, AuthorInfo, AppSetting
from services.ai_chat_service import get_default_provider
from services.author_file_service import resolve_author_file_path


async def test_single_author(paper_id: int, author_name: str):
    """测试单个作者的探索功能（新版 Agent）"""

    print(f"测试作者: {author_name}")
    print("=" * 60)

    async with async_session() as db:
        paper = await db.get(Paper, paper_id)
        if not paper:
            print(f"错误: 未找到论文 ID {paper_id}")
            return False

        print(f"论文: {paper.title}")
        print(f"会议: {paper.venue}")
        print(f"作者: {paper.authors}")
        print()

        provider = await get_default_provider(db)
        if not provider:
            print("错误: 未配置 AI provider")
            return False

        print(f"Provider: {provider.get('model')}")

        # Get agent config
        result = await db.execute(
            select(AppSetting).where(AppSetting.key == "agent_services")
        )
        setting = result.scalar_one_or_none()
        agent_config = {}
        if setting and setting.value:
            try:
                services = json.loads(setting.value)
                for svc in services:
                    if svc.get("id") == "author_exploration":
                        agent_config = svc
                        break
            except:
                pass

    # Use new agent
    from services.author_explore_agent import explore_single_author

    print(f"\n开始探索 {author_name}...")
    print("-" * 60)

    start = time.time()
    event_count = 0
    tool_calls = 0

    try:
        async for event in explore_single_author(
            paper_id, author_name,
            paper.title or "", paper.venue or "", paper.authors or "",
            provider, agent_config,
        ):
            event_count += 1
            etype = event.get("type")

            if etype == "tool_call":
                tool_calls += 1
                print(f"  [工具] {event.get('tool', '')} — {event.get('query', '')}")
            elif etype == "tool_result":
                print(f"  [结果] {event.get('summary', '')[:120]}")
            elif etype == "thinking":
                msg = event.get("message", "")[:150]
                print(f"  [思考] {msg}")
            elif etype == "author_saved":
                print(f"  [保存] OK")
            elif etype == "error":
                print(f"  [错误] {event.get('message', '')}")

    except Exception as e:
        print(f"异常: {e}")
        import traceback
        traceback.print_exc()
        return False

    elapsed = time.time() - start
    print(f"\n完成: {event_count} 事件, {tool_calls} 次工具调用, {elapsed:.1f}s")

    # Verify results
    print("\n验证结果...")
    print("-" * 60)

    async with async_session() as db:
        result = await db.execute(
            select(AuthorInfo).where(
                AuthorInfo.paper_id == paper_id,
                AuthorInfo.author_name == author_name,
            )
        )
        info = result.scalar_one_or_none()

        if not info:
            print("错误: 数据库无记录")
            return False

        print(f"机构: {info.affiliation or '未知'}")
        print(f"方向: {info.research_areas or '未知'}")
        print(f"链接: {info.profile_links or '无'}")
        print(f"位次: {info.relationship_to_paper or '未知'}")

        # Check file
        author_file = resolve_author_file_path(
            PAPERS_DIR / str(paper_id) / "authors", author_name
        )
        if not author_file.exists():
            print("错误: 文件未创建")
            return False

        content = author_file.read_text(encoding="utf-8")
        print(f"文件: {author_file} ({len(content)} 字符)")

        # Quality checks
        checks = {
            "有标题": content.startswith("#"),
            "有机构": "机构" in content and "信息不足" not in content.split("机构")[1][:20],
            "有研究方向": "研究方向" in content,
            "有代表性论文": "代表性论文" in content,
            "有学术链接": "dblp" in content.lower() or "scholar" in content.lower(),
            "有消歧": "消歧" in content,
            "内容充实": len(content) > 500,
        }

        print("\n质量检查:")
        for name, ok in checks.items():
            print(f"  {'✓' if ok else '✗'} {name}")

        score = sum(checks.values()) / len(checks) * 100
        print(f"\n质量: {score:.0f}/100")

        # Preview
        print("\n--- 内容预览 ---")
        for line in content.split("\n")[:25]:
            print(line)
        if content.count("\n") > 25:
            print(f"... (共 {content.count(chr(10))+1} 行)")

        return score >= 60


async def main():
    if len(sys.argv) < 2:
        print("用法: python test_author_exploration.py <author_name> [paper_id]")
        return

    author_name = sys.argv[1]
    paper_id = int(sys.argv[2]) if len(sys.argv) > 2 else 8

    ok = await test_single_author(paper_id, author_name)
    print("\n" + "=" * 60)
    print("测试通过!" if ok else "测试失败!")
    print("=" * 60)
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
