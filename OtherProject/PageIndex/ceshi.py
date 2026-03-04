import os
import json
import re
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("CHATGPT_API_KEY"),
    base_url=os.getenv("OPENAI_BASE_URL")
)

def retrieve_and_answer(query, structure_path):
    with open(structure_path, 'r', encoding='utf-8') as f:
        tree_data = json.load(f)

    if isinstance(tree_data, dict) and 'structure' in tree_data:
        tree_root = tree_data['structure']
    else:
        tree_root = tree_data

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

    print(f"✅ 解析出 {len(all_nodes)} 个节点！")

    nodes_summary = ""
    for n in all_nodes:
        nodes_summary += f"ID: {n['node_id']}, Title: {n['title']}, Summary: {n['summary']}\n"

    # ================= 核心修改区 =================
    prompt = f"""
    你是一个文档检索专家。以下是文档的结构大纲（包含各章节ID、标题和摘要）：
    {nodes_summary}
    
    用户问题：{query}
    
    为了完美回答这个问题，请从大纲中挑选出最相关的 1 到 3 个节点 ID。
    对于寻找“创新点”或“贡献”，通常建议查看 Abstract(摘要) 和 Introduction(引言) 相关的节点。
    
    请严格按照逗号分隔的格式输出 ID，例如：0000, 0002, 0015
    不要输出任何其他解释性文字。
    """
    
    print("🤔 AI 正在思考应该翻阅哪几个章节...")
    response = client.chat.completions.create(
        model="pageindex_claude",
        messages=[{"role": "user", "content": prompt}]
    )
    
    # 提取并清理 AI 返回的多个 ID
    raw_ids = response.choices[0].message.content.strip()
    target_ids = [i.strip() for i in re.split(r'[,，]', raw_ids) if i.strip()]
    print(f"🎯 AI 决定阅读这几个章节: {target_ids}，正在提取原文...")
    
    content = ""
    for n in all_nodes:
        if n['node_id'] in target_ids:
            content += f"\n\n--- 章节 [{n['title']}] (ID: {n['node_id']}) 的内容 ---\n"
            content += n['text']

    if not content.strip():
        return f"未能提取到有效文本，请检查 ID: {target_ids}"

    print("📖 正在综合多章内容生成最终回答...")
    final_prompt = f"参考以下提取的多个文档章节内容：\n{content}\n\n用户问题：{query}\n请根据参考内容总结并给出详细回答。如果提及了创新点（Contributions/Innovations），请分点列出。"
    final_res = client.chat.completions.create(
        model="pageindex_claude",
        messages=[{"role": "user", "content": final_prompt}]
    )
    # ===============================================
    
    return final_res.choices[0].message.content

if __name__ == "__main__":
    answer = retrieve_and_answer(
        "这篇文章的主要创新点和核心贡献是什么？", 
        "./results/paper_structure.json"
    )
    print("\n========== 最终答案 ==========\n")
    print(answer)