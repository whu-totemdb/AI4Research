"""
PageIndex Service - 封装 PageIndex 索引生成和检索功能

功能：
1. 生成论文索引（调用 PageIndex 项目）
2. 检查索引是否存在
3. 执行两阶段检索（选择节点 + 生成答案）
4. 管理索引文件路径
"""

import asyncio
import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Optional

from database import PAPERS_DIR
from services.paper_fs_service import get_md_filename

logger = logging.getLogger(__name__)

# PageIndex 项目路径
PAGEINDEX_DIR = Path(__file__).parent.parent.parent / "OtherProject" / "PageIndex"
PAGEINDEX_SCRIPT = PAGEINDEX_DIR / "run_pageindex.py"


class PageIndexError(Exception):
    """PageIndex 相关错误"""
    pass


def get_md_path(paper_id: int, title: str = None) -> Path:
    """
    获取论文的 Markdown 文件路径（支持新旧命名）

    Args:
        paper_id: 论文 ID
        title: 论文标题（可选，用于新命名方案）

    Returns:
        Markdown 文件的绝对路径

    Raises:
        PageIndexError: 如果 MD 文件不存在
    """
    paper_dir = PAPERS_DIR / str(paper_id)
    filename = get_md_filename(paper_id, title)
    md_path = paper_dir / filename

    if not md_path.exists():
        raise PageIndexError(f"Markdown file not found: {md_path}")

    return md_path


def get_index_path(paper_id: int, title: str = None) -> Path:
    """
    获取索引文件路径

    索引文件命名规则：
    - 如果 MD 文件是 paper.md，索引文件是 paper_structure.json
    - 如果 MD 文件是 {title}.md，索引文件是 {title}_structure.json

    Args:
        paper_id: 论文 ID
        title: 论文标题（可选）

    Returns:
        索引文件的绝对路径
    """
    paper_dir = PAPERS_DIR / str(paper_id)
    md_filename = get_md_filename(paper_id, title)

    # 去掉 .md 后缀，加上 _structure.json
    base_name = md_filename.rsplit('.', 1)[0]
    index_filename = f"{base_name}_structure.json"

    return paper_dir / index_filename


def check_index_exists(paper_id: int, title: str = None) -> bool:
    """
    检查索引文件是否存在

    Args:
        paper_id: 论文 ID
        title: 论文标题（可选）

    Returns:
        True 如果索引存在，否则 False
    """
    try:
        index_path = get_index_path(paper_id, title)
        return index_path.exists()
    except Exception as e:
        logger.error(f"Error checking index existence for paper {paper_id}: {e}")
        return False


async def generate_index(
    paper_id: int,
    title: str = None,
    model: str = "gpt-4o-2024-11-20",
    provider_config: dict = None,
    timeout: int = 600
) -> Path:
    """
    生成论文索引（调用 PageIndex 项目）

    Args:
        paper_id: 论文 ID
        title: 论文标题（可选）
        model: 使用的模型名称
        provider_config: AI provider 配置（包含 api_key, base_url 等）
        timeout: 超时时间（秒）

    Returns:
        生成的索引文件路径

    Raises:
        PageIndexError: 如果生成失败
    """
    try:
        # 获取 MD 文件路径
        md_path = get_md_path(paper_id, title)
        logger.info(f"Generating index for paper {paper_id}, MD path: {md_path}")

        # 获取输出路径
        index_path = get_index_path(paper_id, title)
        paper_dir = PAPERS_DIR / str(paper_id)

        # 构建命令
        cmd = [
            "python",
            str(PAGEINDEX_SCRIPT),
            "--md_path", str(md_path),
            "--model", model,
            "--if-add-node-id", "yes",
            "--if-add-node-summary", "yes",
            "--if-add-node-text", "yes",
            "--if-add-doc-description", "no",
        ]

        # 设置环境变量（如果提供了 provider_config）
        env = os.environ.copy()
        if provider_config:
            if "api_key" in provider_config:
                env["CHATGPT_API_KEY"] = provider_config["api_key"]
            if "api_url" in provider_config:
                env["OPENAI_BASE_URL"] = provider_config["api_url"]

        logger.info(f"Running PageIndex command: {' '.join(cmd)}")

        # 执行命令
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(PAGEINDEX_DIR),
            env=env
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            raise PageIndexError(f"Index generation timed out after {timeout}s")

        if process.returncode != 0:
            error_msg = stderr.decode('utf-8', errors='ignore')
            logger.error(f"PageIndex failed: {error_msg}")
            raise PageIndexError(f"Index generation failed: {error_msg}")

        # PageIndex 默认输出到 ./results/ 目录，需要移动文件
        md_filename = get_md_filename(paper_id, title)
        base_name = md_filename.rsplit('.', 1)[0]
        source_path = PAGEINDEX_DIR / "results" / f"{base_name}_structure.json"

        if not source_path.exists():
            raise PageIndexError(f"Index file not generated: {source_path}")

        # 移动到论文目录
        import shutil
        shutil.move(str(source_path), str(index_path))

        logger.info(f"Index generated successfully: {index_path}")
        return index_path

    except PageIndexError:
        raise
    except Exception as e:
        logger.error(f"Error generating index for paper {paper_id}: {e}", exc_info=True)
        raise PageIndexError(f"Failed to generate index: {str(e)}")


async def search_content(
    paper_id: int,
    query: str,
    title: str = None,
    provider_config: dict = None,
    max_nodes: int = 3
) -> str:
    """
    执行两阶段检索：选择节点 + 生成答案

    Args:
        paper_id: 论文 ID
        query: 用户问题
        title: 论文标题（可选）
        provider_config: AI provider 配置
        max_nodes: 最多选择的节点数量

    Returns:
        AI 生成的答案

    Raises:
        PageIndexError: 如果检索失败
    """
    try:
        # 检查索引是否存在
        index_path = get_index_path(paper_id, title)
        if not index_path.exists():
            raise PageIndexError(f"Index not found for paper {paper_id}. Please generate index first.")

        logger.info(f"Searching content for paper {paper_id}, query: {query}")

        # 加载索引
        with open(index_path, 'r', encoding='utf-8') as f:
            tree_data = json.load(f)

        # 解析树结构
        if isinstance(tree_data, dict) and 'structure' in tree_data:
            tree_root = tree_data['structure']
        else:
            tree_root = tree_data

        # 遍历所有节点
        all_nodes = []

        def traverse_tree(node):
            if isinstance(node, dict):
                n_id = node.get('node_id')
                n_title = node.get('title')
                n_summary = node.get('summary')
                n_text = node.get('text')

                if n_id is not None or n_title:
                    all_nodes.append({
                        'node_id': str(n_id) if n_id is not None else "无ID",
                        'title': str(n_title) if n_title else "无标题",
                        'summary': str(n_summary) if n_summary else "无摘要",
                        'text': str(n_text) if n_text else "无正文"
                    })

                children = node.get('nodes') or node.get('children') or []
                if isinstance(children, list):
                    for child in children:
                        traverse_tree(child)
            elif isinstance(node, list):
                for child in node:
                    traverse_tree(child)

        traverse_tree(tree_root)
        logger.info(f"Parsed {len(all_nodes)} nodes from index")

        if not all_nodes:
            raise PageIndexError("No nodes found in index")

        # 第一阶段：选择相关节点
        nodes_summary = ""
        for n in all_nodes:
            nodes_summary += f"ID: {n['node_id']}, Title: {n['title']}, Summary: {n['summary']}\n"

        selection_prompt = f"""你是一个文档检索专家。以下是文档的结构大纲（包含各章节ID、标题和摘要）：
{nodes_summary}

用户问题：{query}

为了完美回答这个问题，请从大纲中挑选出最相关的 1 到 {max_nodes} 个节点 ID。
对于寻找"创新点"或"贡献"，通常建议查看 Abstract(摘要) 和 Introduction(引言) 相关的节点。

请严格按照逗号分隔的格式输出 ID，例如：0000, 0002, 0015
不要输出任何其他解释性文字。"""

        # 调用 AI 选择节点
        from services.ai_chat_service import chat_single

        if not provider_config:
            raise PageIndexError("Provider config is required for search")

        selected_ids_str = await chat_single(
            provider=provider_config,
            messages=[{"role": "user", "content": selection_prompt}],
            system_prompt=""
        )

        # 解析选中的 ID
        target_ids = [i.strip() for i in re.split(r'[,，]', selected_ids_str.strip()) if i.strip()]
        logger.info(f"AI selected nodes: {target_ids}")

        if not target_ids:
            raise PageIndexError("No nodes selected by AI")

        # 第二阶段：提取节点内容并生成答案
        content = ""
        for n in all_nodes:
            if n['node_id'] in target_ids:
                content += f"\n\n--- 章节 [{n['title']}] (ID: {n['node_id']}) 的内容 ---\n"
                content += n['text']

        if not content.strip():
            raise PageIndexError(f"No content extracted for selected nodes: {target_ids}")

        # 生成最终答案
        final_prompt = f"""参考以下提取的多个文档章节内容：
{content}

用户问题：{query}

请根据参考内容总结并给出详细回答。如果提及了创新点（Contributions/Innovations），请分点列出。"""

        answer = await chat_single(
            provider=provider_config,
            messages=[{"role": "user", "content": final_prompt}],
            system_prompt=""
        )

        logger.info(f"Generated answer for paper {paper_id}")
        return answer

    except PageIndexError:
        raise
    except Exception as e:
        logger.error(f"Error searching content for paper {paper_id}: {e}", exc_info=True)
        raise PageIndexError(f"Failed to search content: {str(e)}")
