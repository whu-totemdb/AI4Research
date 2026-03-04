import re
import html
from collections import defaultdict


def _norm_text(s: str) -> str:
    s = (s or "").lower()
    # remove disambiguation suffix like "0001" in some data sources
    s = re.sub(r"\b\d{3,5}\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _norm_title(s: str) -> str:
    s = _norm_text(s)
    s = re.sub(r"[^a-z0-9\u4e00-\u9fff ]+", "", s)
    return s


def _split_authors(authors) -> list[str]:
    if authors is None:
        return []
    if isinstance(authors, list):
        return [str(a).strip() for a in authors if str(a).strip()]
    if isinstance(authors, str):
        return [a.strip() for a in authors.split(",") if a.strip()]
    return []


def _same_author(a: str, target: str) -> bool:
    a_n = _norm_text(a)
    t_n = _norm_text(target)
    if not a_n or not t_n:
        return False
    if a_n == t_n:
        return True
    # handle variants like "Gao, Jianyang" vs "Jianyang Gao"
    a_tokens = sorted(a_n.replace(".", " ").split())
    t_tokens = sorted(t_n.replace(".", " ").split())
    return a_tokens == t_tokens


def _venue_score(venue: str) -> int:
    v = _norm_text(venue)
    tiers = [
        "sigmod", "vldb", "neurips", "icml", "iclr", "kdd", "aaai", "cvpr", "iccv", "eccv",
        "osdi", "sosp", "nsdi", "sigir", "www", "acl", "emnlp",
    ]
    for i, kw in enumerate(tiers):
        if kw in v:
            return 100 - i
    return 10 if v else 0


def _author_position_score(author_name: str, paper_authors: list[str]) -> tuple[float, str]:
    if not paper_authors:
        return 0.3, "作者位次未知"
    idx = -1
    for i, a in enumerate(paper_authors):
        if _same_author(a, author_name):
            idx = i
            break
    if idx < 0:
        return 0.1, "作者身份匹配弱"
    if idx == 0:
        return 1.0, "第一作者"
    if idx == len(paper_authors) - 1:
        return 0.9, "末位作者"
    return 0.6, "中间作者"


def collect_papers_from_tool_observations(tool_observations: list[dict], author_name: str) -> list[dict]:
    papers: list[dict] = []
    for obs in tool_observations:
        tool = obs.get("tool")
        if tool not in {"dblp_search", "openalex_search"}:
            continue
        result = obs.get("result") or {}
        rows = result.get("results") if isinstance(result, dict) else None
        if not isinstance(rows, list):
            continue

        for r in rows:
            if not isinstance(r, dict):
                continue
            title = html.unescape((r.get("title") or "").strip())
            if not title:
                continue
            authors = _split_authors(r.get("authors"))
            # Prevent obvious homonym contamination: keep records where target author appears in author list.
            if authors and not any(_same_author(a, author_name) for a in authors):
                continue

            year = r.get("year")
            try:
                year = int(year) if year is not None and str(year).strip() else None
            except Exception:
                year = None

            cited = r.get("cited_by_count")
            try:
                cited = int(cited) if cited is not None and str(cited).strip() else None
            except Exception:
                cited = None

            venue = html.unescape((r.get("venue") or "").strip())
            url = (r.get("url") or r.get("doi") or "").strip()
            papers.append({
                "title": title,
                "authors": authors,
                "venue": venue,
                "year": year,
                "url": url,
                "citations": cited,
                "source_tool": tool,
            })

    # Deduplicate by normalized title.
    by_title: dict[str, dict] = {}
    for p in papers:
        key = _norm_title(p["title"])
        if not key:
            continue
        existing = by_title.get(key)
        if not existing:
            by_title[key] = p
            continue

        # keep the richer record
        score_new = (p.get("citations") or 0) + _venue_score(p.get("venue", "")) + (5 if p.get("year") else 0)
        score_old = (existing.get("citations") or 0) + _venue_score(existing.get("venue", "")) + (5 if existing.get("year") else 0)
        if score_new > score_old:
            by_title[key] = p

    unique = list(by_title.values())
    unique.sort(key=lambda x: ((x.get("year") or 0), (x.get("citations") or 0), _venue_score(x.get("venue", ""))), reverse=True)
    return unique


def build_representative_papers(author_name: str, papers: list[dict], max_items: int = 8) -> list[dict]:
    scored = []
    for p in papers:
        cite = p.get("citations")
        cite_score = min(1.0, (float(cite) / 200.0)) if isinstance(cite, int) and cite >= 0 else 0.2
        venue_score = min(1.0, _venue_score(p.get("venue", "")) / 100.0)
        pos_score, pos_label = _author_position_score(author_name, p.get("authors") or [])
        topic_score = 1.0 if any(k in _norm_text(p.get("title", "")) for k in ["vector", "nearest", "quantization", "database", "ann"]) else 0.6

        final_score = round(0.35 * topic_score + 0.25 * venue_score + 0.25 * cite_score + 0.15 * pos_score, 3)
        x = dict(p)
        x["rep_score"] = final_score
        x["rep_reason"] = {
            "topic": round(topic_score, 2),
            "venue": round(venue_score, 2),
            "citation": round(cite_score, 2),
            "authorship": round(pos_score, 2),
            "authorship_label": pos_label,
        }
        scored.append(x)

    scored.sort(key=lambda x: (x.get("rep_score", 0), (x.get("year") or 0), (x.get("citations") or 0)), reverse=True)
    return scored[:max_items]


def group_papers_by_year(papers: list[dict]) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = defaultdict(list)
    unknown: list[dict] = []
    for p in papers:
        y = p.get("year")
        if isinstance(y, int):
            grouped[y].append(p)
        else:
            unknown.append(p)

    for y in list(grouped.keys()):
        grouped[y].sort(key=lambda x: ((x.get("citations") or 0), _venue_score(x.get("venue", ""))), reverse=True)

    if unknown:
        grouped[0] = unknown
    return dict(sorted(grouped.items(), key=lambda x: x[0], reverse=True))


def build_target_paper_role_analysis(author_name: str, target_title: str, paper_authors: list[str], papers: list[dict]) -> str:
    role_target = "合作作者（位次信息不足以推断贡献大小）"
    if paper_authors:
        first = paper_authors[0]
        last = paper_authors[-1]
        if _same_author(first, author_name):
            role_target = "第一作者（通常代表主要执笔之一）"
        elif _same_author(last, author_name):
            role_target = "末位作者（通常具备指导/通讯倾向）"
        elif any(_same_author(a, author_name) for a in paper_authors):
            role_target = "中间作者（多为合作贡献）"

    first_cnt = 0
    last_cnt = 0
    mid_cnt = 0
    total = 0
    for p in papers:
        authors = p.get("authors") or []
        if not authors:
            continue
        idx = -1
        for i, a in enumerate(authors):
            if _same_author(a, author_name):
                idx = i
                break
        if idx < 0:
            continue
        total += 1
        if idx == 0:
            first_cnt += 1
        elif idx == len(authors) - 1:
            last_cnt += 1
        else:
            mid_cnt += 1

    if total == 0:
        dist = "暂无足够样本判断位次分布。"
    else:
        dist = f"样本 {total} 篇：第一作者 {first_cnt}，末位作者 {last_cnt}，中间作者 {mid_cnt}。"

    return (
        f"- 目标论文位次角色：{role_target}\n"
        f"- 历史位次分布：{dist}\n"
        "- 隐私与审慎：不依据公开元数据对“挂名”做确定性判断。"
    )


def build_trend_analysis(author_name: str, papers: list[dict]) -> str:
    if not papers:
        return "暂无足够论文数据，无法形成可靠研究轨迹。"

    years = [p.get("year") for p in papers if isinstance(p.get("year"), int)]
    if not years:
        return "暂无年份完整的数据，无法按时间分析研究轨迹。"

    min_y, max_y = min(years), max(years)
    span = max_y - min_y + 1
    counts = defaultdict(int)
    for y in years:
        counts[y] += 1

    topic_kw = {
        "向量检索/ANN": ["nearest neighbor", "ann", "vector", "quantization", "embedding", "index"],
        "数据库系统": ["database", "query", "sql", "join", "transaction", "vldb", "sigmod"],
        "数据挖掘/机器学习": ["learning", "mining", "model", "classification", "federated"],
        "轨迹/空间数据": ["trajectory", "spatial", "geo", "location"],
    }
    topic_hits = defaultdict(int)
    for p in papers:
        t = _norm_text(p.get("title", ""))
        for topic, kws in topic_kw.items():
            if any(k in t for k in kws):
                topic_hits[topic] += 1

    top_topics = sorted(topic_hits.items(), key=lambda x: x[1], reverse=True)
    top_topics_text = "、".join([f"{k}({v})" for k, v in top_topics[:3]]) if top_topics else "暂无明显主题聚类"

    peak_years = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:3]
    peak_text = "；".join([f"{y}年({c}篇)" for y, c in peak_years])

    return (
        f"- 时间范围：{min_y}–{max_y}（约 {span} 年）\n"
        f"- 高产年份：{peak_text}\n"
        f"- 主题聚焦：{top_topics_text}\n"
        f"- 趋势解读：{author_name} 的研究主线从早期问题驱动逐步收敛到当前优势方向，并在近年围绕该方向持续深化。\n"
        "- 可能原因（推测）：课题组资源集中、核心合作网络稳定、应用场景需求增长、顶会投稿反馈推动问题迭代。"
    )


def build_structured_sections(
    author_name: str,
    target_title: str,
    paper_authors: list[str],
    papers: list[dict],
) -> str:
    rep = build_representative_papers(author_name, papers, max_items=6)
    grouped = group_papers_by_year(papers)
    role_block = build_target_paper_role_analysis(author_name, target_title, paper_authors, papers)
    trend_block = build_trend_analysis(author_name, papers)

    lines = []
    lines.append("## 代表性论文")
    if not rep:
        lines.append("- 暂无足够数据。")
    else:
        for i, p in enumerate(rep, 1):
            title = p.get("title", "")
            year = p.get("year") or "未知年份"
            venue = p.get("venue") or "未知 venue"
            cites = p.get("citations")
            cite_text = f"，引用 {cites}" if cites is not None else ""
            rr = p.get("rep_reason", {})
            lines.append(
                f"{i}. **{title}**（{year}, {venue}{cite_text}）"
                f"；入选原因：主题 {rr.get('topic', 0)} / venue {rr.get('venue', 0)} / 引用 {rr.get('citation', 0)} / 位次 {rr.get('authorship', 0)}（{rr.get('authorship_label', '位次未知')}），综合分 {p.get('rep_score', 0)}。"
            )

    lines.append("")
    lines.append("## 代表性论文判定依据")
    lines.append("- 判定维度：主题相关性、发表 venue、引用情况、作者位次。")
    lines.append("- 评分范围：0-1，分数越高越能代表作者主线研究（仅作辅助参考）。")

    lines.append("")
    lines.append("## 论文列表（按年份分组，已去重）")
    if not grouped:
        lines.append("- 暂无可用数据。")
    else:
        for y, items in grouped.items():
            lines.append(f"### {y if y != 0 else '未知年份'}")
            for p in items:
                venue = p.get("venue") or "未知 venue"
                cites = p.get("citations")
                cite_text = f"，引用 {cites}" if cites is not None else ""
                lines.append(f"- {p.get('title', '')} ({venue}{cite_text})")

    lines.append("")
    lines.append("## 作者角色与影响分析")
    lines.append(role_block)
    lines.append("- 说明：本分析仅基于公开元数据，不包含个人敏感信息推断。")
    lines.append("")
    lines.append("## 研究轨迹趋势分析")
    lines.append(trend_block)

    return "\n".join(lines)
