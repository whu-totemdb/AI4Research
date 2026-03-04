# 智能作者识别与消歧方案设计

## 1. 设计理念

**核心原则：充分利用大模型的推理能力，而非硬编码规则**

- 让 LLM 通过 prompt 和工具调用来智能处理重名、信息融合等问题
- 设计灵活的 agent 架构，通过 prompt engineering 引导 LLM 做出正确判断
- 提供结构化的工具和反馈机制，让 LLM 能够自我验证和纠错

### 1.1 针对现有问题的改进

基于架构分析，当前系统存在以下关键问题：

1. **无机构信息交叉验证** - 当前仅依赖姓名匹配，未利用机构信息进行消歧
2. **无合作网络分析** - 未分析共同作者关系来验证论文归属
3. **信息融合不足** - 多个数据源的信息未进行智能整合和冲突解决
4. **重名处理缺失** - 对同名作者缺乏系统性的识别和区分机制

本方案通过以下方式解决这些问题：
- **机构信息验证**：让 LLM 主动搜索和比对机构信息
- **合作网络分析**：构建合作者图谱，通过共同作者关系进行验证
- **智能信息融合**：让 LLM 识别和解决多源数据冲突
- **系统化消歧**：设计完整的重名检测和消歧流程

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Author Disambiguation Agent               │
│  (基于 LLM 的智能决策层)                                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ├─ Phase 1: 信息收集
                            │  └─ 多源并行搜索
                            │
                            ├─ Phase 2: 身份验证
                            │  └─ 重名消歧判断
                            │
                            ├─ Phase 3: 论文归属
                            │  └─ 置信度评分
                            │
                            └─ Phase 4: 结果验证
                               └─ 交叉验证与保存
```

## 3. 多信息源融合策略

### 3.1 信息源优先级

**Tier 1: 高可信度源（优先使用）**
- DBLP: 计算机科学领域权威，作者 PID 唯一
- OpenAlex: 开放学术图谱，有作者 ORCID 关联
- Google Scholar: 作者自维护，引用数据最全

**Tier 2: 补充验证源**
- SearXNG/Serper: 查找个人主页、机构页面
- Tavily: 新闻、博客等辅助信息

### 3.2 Agent 工具调用策略

通过 prompt 引导 LLM 按以下策略调用工具：

```markdown
## 搜索策略（让 LLM 自主决策）

### 第一轮：建立初步画像
1. **DBLP 搜索**：`dblp_search("{author_name}", limit=200)`
   - 目标：获取论文列表、合作者网络
   - 关键：找到作者的 DBLP PID（如 https://dblp.org/pid/123/456.html）

2. **Google Scholar 搜索**：`searxng_search("{author_name} Google Scholar")`
   - 目标：找到 Scholar 主页，获取 h-index、总引用数
   - 关键：验证是否与目标论文匹配

3. **机构主页搜索**：`searxng_search("{author_name} {venue/institution} homepage")`
   - 目标：找到个人主页，获取当前职位、研究方向
   - 关键：确认身份真实性

### 第二轮：重名消歧（如果发现多个同名作者）
LLM 需要分析以下维度：
- **合作者网络**：目标论文的其他作者是否出现在候选人的论文中？
- **研究领域**：候选人的主要研究方向是否与目标论文一致？
- **机构信息**：候选人的机构是否与论文署名机构匹配？
- **时间线**：候选人的学术活跃期是否覆盖目标论文发表时间？

**关键改进：机构信息交叉验证**
```
如果目标论文署名机构是 "Tsinghua University"：
1. 搜索每个候选人的机构信息：
   - searxng_search("{candidate_name} Tsinghua University")
   - 检查个人主页、Google Scholar 页面的机构信息
2. 时间维度验证：
   - 候选人在目标论文发表时是否在该机构？
   - 如果候选人曾在该机构工作，时间是否匹配？
3. 交叉验证：
   - 搜索目标论文的共同作者，确认他们是否也在该机构
   - 如果共同作者都在该机构，且候选人也在，置信度提升
```

**关键改进：合作网络深度分析**
```
1. 构建候选人的合作者图谱：
   - 从 DBLP 提取候选人的所有合作者
   - 统计每位合作者的合作次数
2. 与目标论文的共同作者比对：
   - 如果目标论文的作者 A 在候选人的合作者列表中，计算合作次数
   - 合作次数越多，置信度越高
3. 二度关系验证：
   - 如果目标论文的作者 A 不在候选人的直接合作者中
   - 检查是否有共同的合作者（二度关系）
   - 二度关系也可以作为弱证据
```

### 第三轮：深度验证（针对高置信度候选人）
- 搜索候选人的代表性论文标题，验证信息一致性
- 查找候选人的 ORCID、个人主页，交叉验证
- 如果仍有疑问，搜索目标论文的 PDF/项目页面，查看作者署名详情
- **新增**：搜索目标论文的共同作者，验证合作关系的真实性
```

## 4. 重名消歧方案

### 4.1 消歧工具设计

为 LLM 提供专门的消歧工具：

```python
{
  "name": "analyze_author_disambiguation",
  "description": "分析多个同名作者候选人，判断哪个是目标论文的真实作者",
  "parameters": {
    "candidates": [
      {
        "name": "候选人姓名",
        "dblp_pid": "DBLP PID（如有）",
        "affiliation": "所属机构",
        "research_areas": ["研究领域1", "研究领域2"],
        "coauthors": ["合作者1", "合作者2"],
        "publication_years": [2018, 2019, 2020],
        "representative_papers": ["论文标题1", "论文标题2"]
      }
    ],
    "target_paper": {
      "title": "目标论文标题",
      "coauthors": ["共同作者1", "共同作者2"],
      "venue": "发表会议/期刊",
      "year": 2023,
      "keywords": ["关键词1", "关键词2"]
    }
  }
}
```

### 4.2 LLM 消歧 Prompt

```markdown
## 重名消歧任务

你发现了 {N} 个名为 "{author_name}" 的作者。请分析哪个是论文 "{paper_title}" 的真实作者。

### 判断维度（按重要性排序）

1. **合作者网络匹配（权重 40%）**
   - 目标论文的共同作者是否出现在候选人的历史论文中？
   - 如果候选人与目标论文的 2+ 位共同作者有合作历史，置信度极高

2. **研究领域一致性（权重 30%）**
   - 候选人的主要研究方向是否与目标论文主题相关？
   - 查看候选人的代表性论文标题、关键词

3. **机构信息匹配（权重 20%）**
   - 候选人的当前/历史机构是否与论文署名一致？
   - 注意：作者可能换过机构，需要考虑时间线

4. **时间线合理性（权重 10%）**
   - 候选人的学术活跃期是否覆盖目标论文发表时间？
   - 如果候选人在目标论文发表前后都有活跃记录，置信度更高

### 输出格式

对每个候选人给出：
- **匹配置信度**：0-100 分
- **判断依据**：列出支持/反对的证据
- **最终结论**：是/否/不确定

如果所有候选人置信度都低于 60 分，说明需要更多信息。
```

## 5. 置信度评分机制

### 5.1 论文归属置信度

为每篇归属给作者的论文打分（0-100）：

```python
confidence_score = (
    coauthor_match_score * 0.4 +      # 合作者匹配度
    topic_relevance_score * 0.3 +     # 主题相关性
    venue_consistency_score * 0.2 +   # 发表渠道一致性
    temporal_consistency_score * 0.1  # 时间线一致性
)
```

### 5.2 置信度等级

- **90-100**: 极高置信度（合作者网络强匹配 + 主题一致）
- **70-89**: 高置信度（多个维度支持）
- **50-69**: 中等置信度（部分维度支持，需人工审核）
- **30-49**: 低置信度（证据不足，建议排除）
- **0-29**: 极低置信度（明显不匹配，应排除）

### 5.3 LLM 评分 Prompt

```markdown
## 论文归属评分任务

请为以下论文判断是否属于作者 "{author_name}"，并给出置信度评分。

### 论文信息
- 标题: {paper_title}
- 作者列表: {authors}
- 发表年份: {year}
- 会议/期刊: {venue}

### 已知作者信息
- 主要合作者: {known_coauthors}
- 研究领域: {research_areas}
- 活跃时间: {active_years}
- 所属机构: {affiliations}

### 评分维度

1. **合作者匹配（0-40分）**
   - 论文作者列表中有几位是已知合作者？
   - 0位: 0分，1位: 20分，2+位: 40分

2. **主题相关性（0-30分）**
   - 论文主题是否与作者研究方向一致？
   - 完全无关: 0分，部分相关: 15分，高度相关: 30分

3. **发表渠道（0-20分）**
   - 作者是否在该会议/期刊发表过其他论文？
   - 从未: 5分，偶尔: 10分，经常: 20分

4. **时间线（0-10分）**
   - 论文发表时间是否在作者活跃期内？
   - 不在: 0分，边缘: 5分，核心期: 10分

### 输出格式
```json
{
  "confidence_score": 85,
  "breakdown": {
    "coauthor_match": 40,
    "topic_relevance": 25,
    "venue_consistency": 15,
    "temporal_consistency": 5
  },
  "reasoning": "该论文有2位共同作者与已知合作者匹配，主题高度相关...",
  "recommendation": "include"  // include | exclude | review
}
```
```

## 6. 信息验证流程

### 6.1 避免漏掉真实论文

**策略：宽进严出**

1. **初筛阶段（宽松）**
   - 只要作者姓名匹配，就纳入候选集
   - 置信度 >= 30 的论文都保留

2. **验证阶段（严格）**
   - LLM 对每篇论文进行详细评分
   - 置信度 < 50 的标记为"需人工审核"
   - 置信度 >= 70 的自动纳入

3. **交叉验证**
   - 如果某篇论文的共同作者也在系统中，检查双方的论文列表是否一致
   - 如果发现不一致，降低置信度

### 6.2 避免错误添加论文

**策略：多重验证**

1. **合作者网络验证**
   ```markdown
   如果论文 A 的作者列表是 [X, Y, Z]，且你已经探索过作者 Y：
   - 检查 Y 的论文列表中是否包含论文 A
   - 如果不包含，说明可能是重名，降低置信度
   ```

2. **主题一致性验证**
   ```markdown
   如果作者的所有论文都是关于"联邦学习"，但候选论文是关于"量子计算"：
   - 除非有强合作者匹配，否则置信度应 < 30
   ```

3. **时间线验证**
   ```markdown
   如果作者的论文集中在 2015-2020，但候选论文发表于 2010：
   - 可能是早期工作，也可能是重名
   - 需要检查机构、合作者等其他维度
   ```

### 6.3 验证工具设计

```python
{
  "name": "cross_validate_paper",
  "description": "交叉验证论文归属，检查是否与已知信息一致",
  "parameters": {
    "paper_title": "待验证论文标题",
    "paper_authors": ["作者1", "作者2"],
    "target_author": "目标作者姓名",
    "validation_checks": [
      "coauthor_consistency",  # 检查共同作者的论文列表
      "topic_consistency",     # 检查主题一致性
      "temporal_consistency"   # 检查时间线合理性
    ]
  }
}
```

## 7. Agent Prompt 设计

### 7.1 System Prompt（核心指导）

```markdown
# 作者探索与消歧 Agent

你是一个专业的学术作者信息研究助手。你的任务是：
1. 收集作者的学术信息
2. 处理重名问题（消歧）
3. 准确归属论文
4. 给出置信度评分

## 核心原则

### 1. 审慎判断，避免误判
- 宁可标记为"不确定"，也不要错误归属
- 置信度 < 70 的论文必须说明理由

### 2. 多维度验证
- 不要仅凭姓名匹配就归属论文
- 必须检查：合作者、主题、机构、时间线

### 3. 透明推理
- 每个判断都要给出依据
- 记录支持/反对的证据

## 工作流程

### Phase 1: 信息收集（2-3轮工具调用）

**目标：建立作者的初步画像**

1. 并行搜索（第1轮）：
   - `dblp_search("{author_name}", limit=200)` - 获取论文列表
   - `searxng_search("{author_name} Google Scholar")` - 找Scholar主页
   - `searxng_search("{author_name} {institution} homepage")` - 找个人主页

2. 分析结果，识别是否有重名：
   - 如果 DBLP 返回多个 PID，说明有重名
   - 如果论文主题跨度极大（如同时有医学和计算机论文），可能是重名

3. 补充搜索（第2轮，按需）：
   - 如果有重名，搜索目标论文的共同作者，建立合作者网络
   - 如果缺少关键信息，搜索代表性论文标题

### Phase 2: 重名消歧（如果需要）

**目标：确定哪个同名作者是目标论文的真实作者**

1. 列出所有候选人：
   ```
   候选人A: {affiliation}, {research_areas}, {coauthors}
   候选人B: {affiliation}, {research_areas}, {coauthors}
   ```

2. **机构信息交叉验证（关键步骤）**：
   - 如果目标论文有机构署名，搜索每个候选人与该机构的关联：
     ```
     searxng_search("{candidate_name} {institution} faculty")
     searxng_search("{candidate_name} {institution} researcher")
     ```
   - 检查候选人的个人主页、Google Scholar 页面的机构历史
   - 验证时间匹配性：候选人在论文发表时是否在该机构？

3. **合作网络深度分析（关键步骤）**：
   - 提取目标论文的所有共同作者
   - 对每个候选人，搜索其与共同作者的合作历史：
     ```
     dblp_search("{candidate_name} {coauthor_name}")
     ```
   - 统计合作次数和合作时间跨度
   - 如果候选人与 2+ 位共同作者有长期合作关系，置信度极高

4. 逐一分析匹配度：
   - **合作者网络（权重最高）**：目标论文的共同作者在哪个候选人的论文中出现？合作次数多少？
   - **机构信息（新增重点）**：哪个候选人的机构与论文署名一致？时间是否匹配？
   - **研究领域**：哪个候选人的研究方向与目标论文最相关？
   - **时间线**：哪个候选人的活跃期覆盖目标论文发表时间？

5. 给出消歧结论：
   - 如果某候选人置信度 >= 80，选择该候选人
   - 如果所有候选人置信度 < 60，标记为"需人工审核"
   - **重要**：必须在结论中明确说明机构验证和合作网络分析的结果

### Phase 3: 论文归属与评分

**目标：为每篇论文判断是否属于该作者，并打分**

1. 对每篇候选论文：
   - 检查作者列表中的姓名是否匹配
   - 计算合作者匹配度（有几位共同作者？）
   - 评估主题相关性（论文主题是否与作者研究方向一致？）
   - 检查时间线合理性（发表时间是否在作者活跃期？）

2. 计算置信度评分（0-100）：
   ```
   score = coauthor_match * 0.4 + topic_relevance * 0.3 +
           venue_consistency * 0.2 + temporal_consistency * 0.1
   ```

3. 分类处理：
   - score >= 70: 自动纳入
   - 50 <= score < 70: 标记为"需审核"
   - score < 50: 排除

### Phase 4: 交叉验证与保存

**目标：最后检查，确保信息准确**

1. 一致性检查：
   - 代表性论文的共同作者是否在合作者列表中？
   - 研究方向描述是否与论文主题一致？
   - 时间线是否合理（如不应该有未来的论文）？

2. 调用 `save_author_info` 保存结果

## 输出格式要求

保存的 Markdown 必须包含：

```markdown
# {author_name}

## 基本信息
- **所属机构**: XXX
- **职位**: XXX
- **研究方向**: XXX

## 消歧信息（如果有重名）
- **DBLP PID**: https://dblp.org/pid/XX/XXXX.html
- **消歧依据**: 基于合作者网络和研究领域判断，该作者是...
- **置信度**: 85/100

## 学术影响力
- **h-index**: XX
- **总引用数**: XXX
- **代表性论文数**: XX

## 代表性论文（按置信度排序）
1. **论文标题** (年份, 会议, 引用: XXX) [置信度: 95/100]
   - 归属依据: 2位共同作者匹配，主题高度相关
2. ...

## 主要合作者
- 合作者1 (机构) - 合作论文数: X
- 合作者2 (机构) - 合作论文数: X

## 相关链接
- [Google Scholar](URL)
- [个人主页](URL)
- [DBLP](URL)

## 与本论文关系
- 作者在本论文中的位次: 第X作者
- 角色推测: 第一作者/通讯作者/合作者
```

## 重要提醒

❌ **不要做的事**：
- 不要仅凭姓名匹配就归属论文
- 不要忽略重名问题
- 不要编造信息（找不到就说"暂无数据"）
- 不要在第一轮搜索后就保存（至少2轮）
- **不要忽略机构信息** - 即使找不到完整机构信息，也要尝试搜索
- **不要跳过合作网络分析** - 这是消歧的最强证据

✅ **必须做的事**：
- 必须检查是否有重名（通过 DBLP PID、论文主题跨度等）
- 必须给出置信度评分和依据
- 必须进行交叉验证
- 必须透明地记录推理过程
- **必须验证机构信息** - 搜索候选人与目标机构的关联
- **必须分析合作网络** - 搜索候选人与共同作者的合作历史
- **必须处理信息冲突** - 当多个数据源信息不一致时，说明原因并选择最可信的
```

### 7.2 多轮对话流程设计

```
User: "请探索作者 Jianyang Gao"

Assistant (Round 1):
[调用工具]
- dblp_search("Jianyang Gao", limit=200)
- searxng_search("Jianyang Gao Google Scholar")
- searxng_search("Jianyang Gao Tsinghua homepage")

[分析结果]
"我发现 DBLP 返回了2个不同的 Jianyang Gao（PID: 123/456 和 789/012）。
需要进行消歧。目标论文的共同作者是 [Alice, Bob]，让我搜索他们的信息..."

Assistant (Round 2):
[调用工具]
- dblp_search("Alice Wang Tsinghua")
- dblp_search("Bob Li Tsinghua")

[分析结果]
"Alice Wang 的论文列表中，有5篇与 Jianyang Gao (PID: 123/456) 合作。
Bob Li 的论文列表中，有3篇与同一个 Jianyang Gao 合作。
因此，目标作者应该是 PID: 123/456 的 Jianyang Gao。置信度: 95/100"

Assistant (Round 3):
[调用工具]
- save_author_info({...})

[完成]
"已保存作者信息。共归属 45 篇论文，其中高置信度(>=70) 38篇，
需审核(50-69) 5篇，已排除(<50) 2篇。"
```

## 8. 利用现有工具系统的具体策略

### 8.1 DBLP 工具的深度利用

**当前使用方式**：简单搜索作者姓名
**改进方式**：利用 DBLP 构建合作网络

```python
# 示例：构建合作网络
# 1. 搜索目标作者
dblp_search("Jianyang Gao", limit=200)
# 返回：论文列表，每篇论文包含完整作者列表

# 2. 提取合作者
coauthors = extract_coauthors_from_papers(papers)
# 结果：{"Alice Wang": 5, "Bob Li": 3, ...}  # 姓名: 合作次数

# 3. 验证共同作者关系
for coauthor in target_paper_coauthors:
    if coauthor in coauthors:
        confidence += 20  # 每个匹配的合作者增加置信度
```

**LLM Prompt 指导**：
```markdown
当你从 DBLP 获取论文列表后：
1. 统计每位合作者出现的次数
2. 识别核心合作者（合作 3+ 次）
3. 检查目标论文的共同作者是否在核心合作者列表中
4. 如果有 2+ 位匹配，这是强证据，置信度应 >= 80
```

### 8.2 OpenAlex 工具的机构信息提取

**当前使用方式**：搜索论文标题
**改进方式**：提取作者的机构历史

```python
# OpenAlex 返回的数据结构包含机构信息
{
  "authorships": [
    {
      "author": {"display_name": "Jianyang Gao"},
      "institutions": [
        {"display_name": "Tsinghua University", "country_code": "CN"}
      ]
    }
  ]
}
```

**LLM Prompt 指导**：
```markdown
当你从 OpenAlex 获取论文时：
1. 提取每篇论文的机构信息
2. 统计作者在各机构发表论文的数量
3. 识别作者的主要机构（论文数最多）
4. 检查目标论文的机构是否与作者的主要机构匹配
5. 如果匹配，置信度提升；如果不匹配但时间合理（可能换了机构），需要进一步验证
```

### 8.3 SearXNG/Serper 工具的机构验证

**使用场景**：验证作者与机构的关联

```python
# 搜索策略
searxng_search("Jianyang Gao Tsinghua University")
# 期望找到：个人主页、教师列表、新闻报道等

searxng_search("Jianyang Gao faculty profile")
# 期望找到：官方教师页面，包含机构信息和研究方向
```

**LLM Prompt 指导**：
```markdown
使用 SearXNG 验证机构信息时：
1. 搜索 "{author_name} {institution} faculty" 或 "{author_name} {institution} researcher"
2. 检查搜索结果中是否有官方页面（.edu 域名）
3. 如果找到官方页面，提取：
   - 当前职位
   - 研究方向
   - 联系方式（邮箱域名可以验证机构）
4. 如果找不到官方页面，尝试搜索 "{author_name} Google Scholar"，Scholar 页面通常显示机构信息
```

### 8.4 多工具协同的消歧流程

**完整流程示例**：

```markdown
场景：探索作者 "Wei Wang"（常见重名）

Step 1: DBLP 搜索识别候选人
- dblp_search("Wei Wang", limit=200)
- 发现返回结果包含多个不同的 Wei Wang（通过论文主题判断）
- 候选人A: 数据库方向，主要发表在 VLDB/SIGMOD
- 候选人B: 机器学习方向，主要发表在 NeurIPS/ICML

Step 2: 机构信息验证
- 目标论文署名：Wei Wang, Tsinghua University
- searxng_search("Wei Wang Tsinghua University database")
- searxng_search("Wei Wang Tsinghua University machine learning")
- 结果：找到候选人A的清华大学教师页面，候选人B在UCLA

Step 3: 合作网络验证
- 目标论文共同作者：[Alice Chen, Bob Zhang]
- dblp_search("Wei Wang Alice Chen")
- 结果：候选人A与 Alice Chen 有 8 篇合作论文
- dblp_search("Wei Wang Bob Zhang")
- 结果：候选人A与 Bob Zhang 有 5 篇合作论文
- 候选人B与这两位作者无合作记录

Step 4: 消歧结论
- 候选人A：机构匹配 ✓，合作网络强匹配 ✓，研究方向匹配 ✓
- 置信度：95/100
- 结论：目标作者是候选人A
```

### 8.5 信息冲突的处理策略

**常见冲突场景**：

1. **DBLP 和 OpenAlex 的作者姓名不一致**
   ```
   DBLP: "Jianyang Gao"
   OpenAlex: "J. Gao"
   处理：通过论文标题匹配确认是同一人
   ```

2. **机构信息不一致**
   ```
   Google Scholar: "Tsinghua University"
   个人主页: "Microsoft Research Asia"
   处理：检查时间线，可能是换了工作
   ```

3. **论文列表不完整**
   ```
   DBLP: 50 篇论文
   OpenAlex: 45 篇论文
   处理：合并去重，以 DBLP 为主（计算机领域更全）
   ```

**LLM Prompt 指导**：
```markdown
当遇到信息冲突时：
1. 不要忽略冲突，必须在输出中说明
2. 分析冲突原因：
   - 数据源更新时间不同？
   - 作者换了机构？
   - 姓名拼写变体？
3. 选择最可信的信息：
   - 优先级：官方主页 > Google Scholar > DBLP > OpenAlex
   - 对于论文列表：DBLP（计算机领域）> OpenAlex（跨领域）
4. 在输出中标注信息来源和置信度
```

## 9. 实现策略

### 9.1 渐进式实现路径

**Phase 1: 基础消歧（MVP）**
- 实现重名检测（基于 DBLP PID 和论文主题分析）
- **实现合作者网络提取**（从 DBLP 结果中提取合作者列表）
- **实现机构信息提取**（从 OpenAlex 和搜索结果中提取机构）
- 实现基础置信度评分（合作者匹配 + 机构匹配）

**Phase 2: 智能评分**
- 实现多维度置信度计算（合作者、机构、主题、时间线）
- **实现合作网络深度分析**（统计合作次数、识别核心合作者）
- **实现机构历史追踪**（处理作者换机构的情况）
- 实现交叉验证机制
- 优化 LLM prompt（添加机构验证和合作网络分析指导）

**Phase 3: 高级功能**
- 实现作者画像缓存（避免重复搜索）
- **实现合作者图谱可视化**（展示作者的合作网络）
- 实现批量消歧（一次处理多个作者）
- 实现人工审核界面（处理低置信度论文）
- **实现信息冲突检测和解决**（自动识别多源数据冲突）

### 9.2 关键代码模块

```python
# 1. 重名检测模块
def detect_homonyms(dblp_results: list) -> list[AuthorCandidate]:
    """从 DBLP 结果中识别不同的同名作者

    策略：
    - 通过 DBLP PID 区分
    - 通过论文主题聚类区分（如果没有 PID）
    - 通过机构信息区分
    """
    pass

# 2. 合作网络提取模块（新增）
def extract_coauthor_network(papers: list[Paper]) -> dict[str, CoauthorInfo]:
    """从论文列表中提取合作者网络

    返回：
    {
        "Alice Wang": {
            "collaboration_count": 5,
            "papers": ["paper1", "paper2", ...],
            "institutions": ["Tsinghua University"],
            "years": [2020, 2021, 2022]
        },
        ...
    }
    """
    pass

# 3. 机构信息提取模块（新增）
def extract_institution_info(
    papers: list[Paper],
    search_results: list[dict]
) -> InstitutionHistory:
    """从多个数据源提取作者的机构历史

    返回：
    {
        "current": "Tsinghua University",
        "history": [
            {"institution": "Microsoft Research", "years": [2018, 2019]},
            {"institution": "Tsinghua University", "years": [2020, 2021, 2022]}
        ]
    }
    """
    pass

# 4. 消歧决策模块（增强）
async def disambiguate_author(
    candidates: list[AuthorCandidate],
    target_paper: Paper,
    llm_agent: LLMAgent
) -> DisambiguationResult:
    """让 LLM 判断哪个候选人是真实作者

    增强点：
    - 提供合作网络信息
    - 提供机构历史信息
    - 提供详细的匹配度分析
    """
    pass

# 5. 论文归属评分模块（增强）
async def score_paper_attribution(
    paper: Paper,
    author_profile: AuthorProfile,
    llm_agent: LLMAgent
) -> ConfidenceScore:
    """让 LLM 为论文归属打分

    增强点：
    - 检查合作者匹配度
    - 检查机构一致性
    - 检查时间线合理性
    """
    pass

# 6. 交叉验证模块（增强）
async def cross_validate_papers(
    author_papers: list[Paper],
    coauthor_papers: dict[str, list[Paper]]
) -> list[ValidationResult]:
    """交叉验证论文归属的一致性

    增强点：
    - 验证合作关系的双向一致性
    - 验证机构信息的一致性
    - 识别和标记冲突
    """
    pass

# 7. 信息冲突解决模块（新增）
async def resolve_information_conflicts(
    sources: dict[str, dict],
    llm_agent: LLMAgent
) -> dict:
    """让 LLM 解决多源数据冲突

    输入：
    {
        "dblp": {"name": "Jianyang Gao", "papers": 50},
        "openalex": {"name": "J. Gao", "papers": 45},
        "scholar": {"name": "Jianyang Gao", "institution": "Tsinghua"}
    }

    输出：
    {
        "resolved_name": "Jianyang Gao",
        "resolved_institution": "Tsinghua University",
        "conflicts": [
            {
                "field": "paper_count",
                "values": {"dblp": 50, "openalex": 45},
                "resolution": "Use DBLP (more complete for CS)",
                "confidence": 0.9
            }
        ]
    }
    """
    pass
```

### 9.3 数据结构设计

```python
@dataclass
class AuthorCandidate:
    name: str
    dblp_pid: str | None
    affiliation: str
    research_areas: list[str]
    coauthors: dict[str, CoauthorInfo]  # 增强：详细的合作者信息
    papers: list[Paper]
    active_years: tuple[int, int]
    institution_history: InstitutionHistory  # 新增：机构历史

@dataclass
class CoauthorInfo:
    """合作者详细信息"""
    name: str
    collaboration_count: int
    papers: list[str]  # 合作论文标题
    institutions: list[str]
    years: list[int]

@dataclass
class InstitutionHistory:
    """作者的机构历史"""
    current: str
    history: list[dict]  # [{"institution": str, "years": list[int]}]
    sources: dict[str, str]  # 信息来源：{"current": "Google Scholar", ...}

@dataclass
class ConfidenceScore:
    total: float  # 0-100
    breakdown: dict[str, float]  # 各维度得分
    reasoning: str  # LLM 的推理过程
    recommendation: str  # include | exclude | review
    coauthor_matches: list[str]  # 新增：匹配的合作者列表
    institution_match: bool  # 新增：机构是否匹配

@dataclass
class DisambiguationResult:
    selected_candidate: AuthorCandidate
    confidence: float
    reasoning: str
    rejected_candidates: list[tuple[AuthorCandidate, str]]  # (候选人, 拒绝理由)
    coauthor_network_analysis: str  # 新增：合作网络分析结果
    institution_verification: str  # 新增：机构验证结果
```

## 10. 测试与验证

### 10.1 测试用例

**Case 1: 无重名，信息完整**
- 作者: Jianyang Gao (唯一)
- 预期: 置信度 >= 90，所有论文正确归属
- 验证点: 机构信息一致，合作网络清晰

**Case 2: 有重名，需消歧（通过合作网络）**
- 作者: Wei Wang (常见重名)
- 场景: DBLP 返回 2 个 Wei Wang，一个在清华，一个在 UCLA
- 目标论文: 与清华的 Alice Chen 合作
- 预期: 通过合作网络分析，正确识别清华的 Wei Wang，置信度 >= 85
- 验证点:
  - 合作者匹配度计算正确
  - 机构信息验证成功
  - 消歧推理过程透明

**Case 3: 有重名，需消歧（通过机构信息）**
- 作者: Li Zhang (极常见重名)
- 场景: DBLP 返回 5+ 个 Li Zhang
- 目标论文: 署名 "Li Zhang, Microsoft Research Asia"
- 预期: 通过机构信息搜索，找到在 MSR 的 Li Zhang，置信度 >= 80
- 验证点:
  - 机构搜索策略正确（searxng_search 使用合理）
  - 机构历史追踪准确
  - 时间线验证合理

**Case 4: 信息不足**
- 作者: 新兴研究者，论文少
- 预期: 标记为"需人工审核"，不误判
- 验证点: 置信度评分合理（< 70）

**Case 5: 跨领域作者**
- 作者: 研究方向变化（如从数据库转向机器学习）
- 预期: 不因主题变化而误判为重名
- 验证点:
  - 通过合作网络连续性判断是同一人
  - 机构信息连续性支持判断

**Case 6: 作者换机构**
- 作者: 从学校转到工业界（如清华 → 微软）
- 场景: 早期论文署名清华，近期论文署名微软
- 预期: 正确识别为同一人，机构历史追踪准确
- 验证点:
  - 机构历史提取正确
  - 时间线分析合理
  - 不因机构变化而误判为重名

**Case 7: 信息冲突**
- 场景: DBLP 显示 50 篇论文，OpenAlex 显示 45 篇
- 预期: LLM 识别冲突，选择更可信的数据源，并说明理由
- 验证点:
  - 冲突检测成功
  - 解决策略合理
  - 推理过程透明

**Case 8: FedAPM 论文实际测试**
- 作者: FedAPM 论文的所有作者
- 预期: 所有作者正确识别，重名问题正确处理
- 验证点:
  - 与 tester 的测试结果对比
  - 识别 architecture-analyst 发现的问题是否解决

### 10.2 评估指标

**准确性指标**：
- **准确率**: 正确归属的论文数 / 总论文数
- **召回率**: 正确归属的论文数 / 真实论文数
- **误判率**: 错误归属的论文数 / 总归属论文数
- **消歧成功率**: 正确识别目标作者的比例

**新增指标（针对改进点）**：
- **机构验证成功率**: 成功验证机构信息的作者数 / 总作者数
- **合作网络分析覆盖率**: 进行合作网络分析的作者数 / 有重名问题的作者数
- **信息冲突解决率**: 成功解决信息冲突的次数 / 检测到冲突的次数
- **置信度校准度**: 高置信度论文的实际准确率是否 >= 90%

### 10.3 对比测试

**与当前系统对比**：

| 维度 | 当前系统 | 改进系统 | 提升 |
|------|---------|---------|------|
| 重名检测 | 无 | 有（基于 DBLP PID + 主题分析） | ✓ |
| 机构验证 | 无 | 有（主动搜索 + 历史追踪） | ✓ |
| 合作网络分析 | 无 | 有（统计合作次数 + 核心合作者识别） | ✓ |
| 信息冲突处理 | 无 | 有（LLM 智能解决） | ✓ |
| 置信度评分 | 简单规则 | 多维度 LLM 评分 | ✓ |
| 透明度 | 低 | 高（详细推理过程） | ✓ |

## 11. 总结

本方案的核心优势：

1. **智能化**: 充分利用 LLM 的推理能力，而非硬编码规则
2. **透明性**: 每个判断都有依据，可追溯
3. **鲁棒性**: 多维度验证，降低误判风险
4. **可扩展**: 易于添加新的验证维度和工具
5. **用户友好**: 置信度评分帮助用户快速识别需要审核的论文

关键创新点：
- 将消歧任务交给 LLM，通过 prompt 引导其进行多维度分析
- 设计置信度评分机制，量化判断的可靠性
- 实现交叉验证，利用作者间的关联关系提高准确性

### 11.1 针对现有问题的改进

基于 architecture-analyst 的分析，本方案重点解决了以下问题：

1. **无机构信息交叉验证 → 系统化机构验证**
   - 主动搜索作者与机构的关联（SearXNG）
   - 提取和追踪机构历史（OpenAlex）
   - 时间维度验证（作者在论文发表时是否在该机构）
   - 让 LLM 智能判断机构匹配度

2. **无合作网络分析 → 深度合作网络分析**
   - 从 DBLP 提取完整合作者列表
   - 统计合作次数，识别核心合作者
   - 与目标论文的共同作者进行匹配
   - 二度关系验证（共同的合作者）
   - 让 LLM 基于合作网络进行消歧

3. **信息融合不足 → 智能多源融合**
   - 识别多个数据源的信息冲突
   - 让 LLM 分析冲突原因（时间差、数据完整性等）
   - 选择最可信的信息源
   - 透明记录融合过程和依据

4. **重名处理缺失 → 系统化消歧流程**
   - 通过 DBLP PID 识别不同的同名作者
   - 通过论文主题聚类识别潜在重名
   - 多维度分析（合作者、机构、主题、时间线）
   - 置信度量化，透明推理

### 11.2 关键创新点

1. **LLM 驱动的消歧决策**
   - 将复杂的消歧任务交给 LLM
   - 通过精心设计的 prompt 引导 LLM 进行多维度分析
   - LLM 能够处理边界情况（如作者换机构、研究方向变化）

2. **合作网络作为核心证据**
   - 合作关系是最强的身份验证证据（权重 40%）
   - 系统化提取和分析合作网络
   - 利用合作关系的传递性（二度关系）

3. **机构信息的时间维度**
   - 不仅验证机构是否匹配，还验证时间是否合理
   - 追踪作者的机构历史，处理换机构情况
   - 通过多个数据源交叉验证机构信息

4. **置信度评分与透明推理**
   - 每个判断都有 0-100 的置信度评分
   - 详细的评分依据和推理过程
   - 帮助用户快速识别需要人工审核的论文

5. **信息冲突的智能处理**
   - 自动检测多源数据冲突
   - LLM 分析冲突原因并选择最可信的信息
   - 透明记录冲突解决过程

### 11.3 实施建议

1. **优先实现 Phase 1（基础消歧）**
   - 重名检测
   - 合作网络提取
   - 机构信息提取
   - 基础置信度评分

2. **快速迭代，持续优化 Prompt**
   - 在实际使用中收集 LLM 的推理过程
   - 识别常见错误模式
   - 优化 prompt 以避免这些错误

3. **建立测试数据集**
   - 收集有代表性的测试用例（包括重名、换机构等）
   - 人工标注正确答案
   - 定期评估系统性能

4. **与 tester 协作**
   - 在 FedAPM 论文上进行实际测试
   - 根据测试结果调整设计
   - 确保解决了 architecture-analyst 发现的所有问题
