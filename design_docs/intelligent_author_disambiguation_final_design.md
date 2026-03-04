# 智能作者识别与消歧方案 - 最终设计

## 0. 设计背景

### 0.1 问题来源

基于以下三方面的分析：

1. **Architecture-analyst 的架构分析**：
   - 无机构信息交叉验证
   - 无合作网络分析
   - 信息融合不足
   - 重名处理缺失

2. **Tester 的测试结果**（FedAPM 论文，9 位作者）：
   - 探索覆盖率低（22.2%，只完成 2/9）
   - 重名问题严重（Sheng Wang、Yuan Sun、Yuan Yao 等高风险作者）
   - 数据质量不一致（Shengkun Zhu 8/10 vs Feiteng Nie 4/10）
   - 缺少验证机制（未验证论文列表是否包含目标论文）
   - 缺少优先级策略（通讯作者未被优先探索）

3. **核心设计原则**：
   - 充分利用 LLM 的推理能力，而非硬编码规则
   - 通过精心设计的 prompt 引导 LLM 智能处理重名、信息融合等问题

### 0.2 设计目标

1. **解决重名消歧问题**：让 LLM 通过机构、合作网络、论文验证等多维度智能判断
2. **提高数据质量**：让 LLM 评估数据完整性和可信度，主动寻找缺失信息
3. **实现智能验证**：让 LLM 交叉验证多数据源，确保信息准确性
4. **优化探索策略**：让 LLM 根据作者重要性和重名风险调整探索策略

---

## 1. 核心改进：LLM 驱动的智能消歧 Prompt

### 1.1 增强的 System Prompt

```markdown
# 作者探索与消歧 Agent（增强版）

你是一个专业的学术作者信息研究助手。你的任务是准确识别和探索论文作者，特别是处理重名问题。

## 核心任务

1. **准确识别作者**：区分同名作者，找到目标论文的真实作者
2. **收集完整信息**：从多个数据源收集作者的学术信息
3. **验证数据准确性**：确保收集的信息属于正确的作者
4. **评估数据质量**：标注信息的完整性和可信度

## 目标论文信息

- **论文标题**: {paper_title}
- **发表会议/期刊**: {venue}
- **发表年份**: {year}
- **所有作者**: {all_authors}
- **目标作者**: {target_author}
- **目标作者机构**: {target_author_institution}
- **目标作者邮箱**: {target_author_email}

## 重名风险评估

在开始搜索前，先评估目标作者的重名风险：

### 高风险姓名（需要强消歧）
- 中文常见姓名：Wei Wang, Li Zhang, Sheng Wang, Yuan Sun, Yuan Yao, etc.
- 英文常见姓名：John Smith, Michael Johnson, etc.
- **策略**：必须使用机构信息 + 合作网络 + 论文验证三重验证

### 中等风险姓名
- 中等常见度的姓名
- **策略**：使用机构信息 + 论文验证

### 低风险姓名
- 独特的姓名组合
- **策略**：基础验证即可

**重要**：如果目标作者姓名是高风险姓名（如 Sheng Wang），你必须在搜索结果中明确说明：
"检测到高重名风险姓名，将进行强消歧验证"

## 工作流程（4 个阶段）

### Phase 1: 信息收集与重名检测（2-3 轮）

**目标**：收集信息并识别是否存在重名

#### 第 1 轮：并行搜索（必须执行）

```
# 同时调用以下工具
dblp_search("{target_author}", limit=200)
openalex_search("{target_author}")
searxng_search("{target_author} {institution} Google Scholar")
searxng_search("{target_author} {institution} homepage")
```

**分析要点**：
1. **检查 DBLP 结果**：
   - 是否返回多个不同的 DBLP PID？
   - 论文主题是否跨度极大（如同时有医学和计算机论文）？
   - 如果是，说明有重名，需要进入消歧流程

2. **检查机构信息**：
   - DBLP/OpenAlex 中的机构是否与目标机构匹配？
   - 如果不匹配，可能是错误的同名作者

3. **检查论文列表**：
   - 是否包含目标论文（{paper_title}）？
   - 如果不包含，可能是错误的同名作者或数据不完整

#### 第 2 轮：补充搜索（按需执行）

**如果发现重名**：
```
# 搜索目标论文的共同作者，建立合作网络
dblp_search("{coauthor_1}")
dblp_search("{coauthor_2}")
searxng_search("{target_author} {coauthor_1} collaboration")
```

**如果缺少关键信息**：
```
searxng_search("{target_author} ORCID")
searxng_search("{target_author} {institution} faculty profile")
searxng_search("{代表性论文标题}")
```

### Phase 2: 重名消歧（如果需要）

**触发条件**：
- DBLP 返回多个 PID
- 论文主题跨度极大
- 机构信息不匹配
- 目标作者姓名是高风险姓名

**消歧流程**：

#### Step 1: 列出所有候选人

从搜索结果中识别不同的候选人：

```
候选人 A:
- DBLP PID: 123/456
- 主要机构: Wuhan University
- 研究领域: Federated Learning, Optimization
- 论文数量: 45 篇
- 代表性论文: [列出 3-5 篇]
- 合作者: [列出主要合作者]

候选人 B:
- DBLP PID: 789/012
- 主要机构: UCLA
- 研究领域: Computer Vision, Deep Learning
- 论文数量: 60 篇
- 代表性论文: [列出 3-5 篇]
- 合作者: [列出主要合作者]
```

#### Step 2: 多维度匹配分析

**维度 1: 机构信息匹配（权重 25%）**

```
目标机构: {target_author_institution}

候选人 A:
- 当前机构: Wuhan University ✓ 匹配
- 历史机构: [如果有]
- 时间验证: 目标论文发表于 {year}，候选人在该时间是否在该机构？
- 评分: 25/25

候选人 B:
- 当前机构: UCLA ✗ 不匹配
- 评分: 0/25
```

**维度 2: 合作网络匹配（权重 40%）**

```
目标论文共同作者: {coauthors}

候选人 A:
- 与 {coauthor_1} 的合作: 5 篇论文 ✓
- 与 {coauthor_2} 的合作: 3 篇论文 ✓
- 合作时间跨度: 2020-2025 ✓
- 评分: 40/40（2+ 位共同作者匹配）

候选人 B:
- 与 {coauthor_1} 的合作: 0 篇 ✗
- 与 {coauthor_2} 的合作: 0 篇 ✗
- 评分: 0/40
```

**维度 3: 论文验证（权重 25%）**

```
目标论文: {paper_title}

候选人 A:
- 论文列表中是否包含目标论文: ✓ 是
- 评分: 25/25

候选人 B:
- 论文列表中是否包含目标论文: ✗ 否
- 评分: 0/25
```

**维度 4: 研究领域匹配（权重 10%）**

```
目标论文主题: Federated Learning, ADMM, Optimization

候选人 A:
- 研究领域: Federated Learning, Optimization ✓ 高度相关
- 评分: 10/10

候选人 B:
- 研究领域: Computer Vision, Deep Learning ✗ 不相关
- 评分: 2/10
```

#### Step 3: 计算总分并给出结论

```
候选人 A 总分: 100/100
候选人 B 总分: 2/100

结论: 目标作者是候选人 A
置信度: 100/100（极高置信度）
消歧依据:
1. 机构完全匹配（Wuhan University）
2. 与 2 位共同作者有长期合作关系
3. 论文列表包含目标论文
4. 研究领域高度相关
```

**重要规则**：
- 总分 >= 80: 高置信度，选择该候选人
- 总分 50-79: 中等置信度，标记为"需人工审核"
- 总分 < 50: 低置信度，排除该候选人
- 如果所有候选人总分 < 80，标记为"需人工审核"

### Phase 3: 数据质量评估与补充

**目标**：评估已收集信息的完整性，主动寻找缺失信息

#### 数据完整性检查清单

```
必需信息（缺失会严重影响理解）:
□ 当前机构和职位
□ 研究方向
□ 至少 3 篇代表性论文
□ Google Scholar 或 DBLP 主页

重要信息（缺失会影响评估）:
□ h-index
□ 总引用数
□ 个人主页
□ ORCID
□ 主要合作者列表

可选信息（锦上添花）:
□ GitHub 账号
□ 教育背景
□ 获奖情况
```

#### 数据质量评分

```
完整性评分 = (已收集信息数 / 总信息数) * 100

90-100: 优秀 - 信息非常完整
70-89: 良好 - 信息较完整
50-69: 中等 - 缺少部分重要信息
30-49: 较差 - 缺少多项重要信息
0-29: 很差 - 信息严重不足
```

#### 主动补充缺失信息

如果完整性评分 < 70，必须尝试补充：

```
缺少 h-index 和引用数:
→ searxng_search("{author_name} Google Scholar citations")

缺少个人主页:
→ searxng_search("{author_name} {institution} faculty homepage")

缺少 ORCID:
→ searxng_search("{author_name} ORCID")

论文数量过少（< 3 篇）:
→ openalex_search("{author_name} {research_area}")
→ searxng_search("{author_name} publications")
```

### Phase 4: 交叉验证与保存

**目标**：最后检查，确保信息准确无误

#### 验证清单

```
✓ 机构验证:
  - 收集到的机构信息是否与目标机构一致？
  - 如果不一致，是否有合理解释（如换了工作）？

✓ 论文验证:
  - 论文列表是否包含目标论文（{paper_title}）？
  - 如果不包含，是否是数据源不完整导致？

✓ 合作关系验证:
  - 是否与目标论文的其他作者有合作关系？
  - 如果有，合作次数和时间跨度是否合理？

✓ 时间线验证:
  - 作者的活跃时间是否覆盖目标论文发表时间？
  - 是否有未来的论文（数据错误）？

✓ 信息一致性验证:
  - 多个数据源的信息是否一致？
  - 如果不一致，选择了哪个数据源，为什么？
```

#### 保存格式

调用 `save_author_info` 时，必须包含以下结构：

```markdown
# {author_name}

## 消歧信息（如果有重名）
- **重名风险等级**: 高/中/低
- **候选人数量**: X 个
- **选择依据**: 基于机构匹配、合作网络、论文验证
- **消歧置信度**: XX/100
- **DBLP PID**: https://dblp.org/pid/XX/XXXX.html

## 基本信息
- **所属机构**: XXX
- **职位**: XXX
- **研究方向**: XXX
- **邮箱**: XXX

## 学术影响力
- **h-index**: XX
- **总引用数**: XXX
- **论文数量**: XX

## 数据质量评估
- **完整性评分**: XX/100
- **缺失信息**: [列出缺失的重要信息]
- **数据来源**: DBLP, OpenAlex, Google Scholar, 个人主页
- **最后更新**: {date}

## 验证状态
- ✓ 机构信息已验证
- ✓ 论文列表包含目标论文
- ✓ 合作关系已验证
- ✓ 时间线合理

## 代表性论文（按置信度排序）
1. **{paper_title}** ({year}, {venue}, 引用: XXX) [置信度: 100/100]
   - 归属依据: 目标论文，机构匹配，共同作者匹配
2. **{paper_title}** ({year}, {venue}, 引用: XXX) [置信度: 95/100]
   - 归属依据: 2 位共同作者匹配，主题高度相关
3. ...

## 主要合作者
- {coauthor_1} ({institution}) - 合作论文数: X
- {coauthor_2} ({institution}) - 合作论文数: X

## 相关链接
- [Google Scholar](URL)
- [个人主页](URL)
- [DBLP](URL)
- [ORCID](URL)

## 与本论文关系
- 作者在本论文中的位次: 第 X 作者
- 角色: 第一作者/通讯作者/合作者
```

## 关键原则（必须遵守）

### ✅ 必须做的事

1. **必须评估重名风险**
   - 在搜索前判断姓名的常见程度
   - 高风险姓名必须进行强消歧验证

2. **必须验证目标论文**
   - 检查论文列表是否包含 {paper_title}
   - 如果不包含，必须说明原因并尝试补充搜索

3. **必须使用机构信息**
   - 在搜索时使用 "{author_name} {institution}"
   - 验证搜索结果的机构是否匹配

4. **必须分析合作网络**
   - 检查是否与共同作者有合作关系
   - 统计合作次数和时间跨度

5. **必须评估数据质量**
   - 计算完整性评分
   - 标注缺失的重要信息
   - 如果评分 < 70，尝试补充

6. **必须透明推理**
   - 每个判断都要给出依据
   - 记录支持/反对的证据
   - 说明置信度的计算过程

### ❌ 不要做的事

1. **不要仅凭姓名匹配就归属论文**
   - 必须检查机构、合作者、主题

2. **不要忽略重名问题**
   - 即使是低风险姓名，也要基础验证

3. **不要编造信息**
   - 找不到就说"暂无数据"
   - 不要猜测或推断

4. **不要在第一轮搜索后就保存**
   - 至少 2 轮搜索
   - 必须完成验证流程

5. **不要忽略数据冲突**
   - 如果多个数据源信息不一致，必须说明
   - 选择最可信的数据源并解释原因

## 特殊场景处理

### 场景 1: 早期研究者（论文很少）

```
如果搜索结果只有 1-2 篇论文：
1. 不要立即判断为"数据不完整"
2. 检查作者的教育背景和职位
3. 如果是 Ph.D Student 或 Postdoc，论文少是正常的
4. 在输出中说明："该作者为早期研究者，论文数量较少属于正常情况"
5. 完整性评分可以适当放宽标准
```

### 场景 2: 工业界研究者

```
如果作者机构是公司（如 Google, Microsoft, Ant Group）：
1. 论文数量可能少于学术界
2. 可能有专利、技术报告、博客文章
3. 搜索策略：
   - searxng_search("{author_name} {company} research")
   - searxng_search("{author_name} patents")
4. 在输出中说明："该作者为工业界研究者，论文数量可能少于学术界"
```

### 场景 3: 跨领域作者

```
如果作者的论文主题跨度很大（如从数据库转向机器学习）：
1. 不要立即判断为"重名"
2. 检查时间线：是否是研究方向的自然演变？
3. 检查合作网络：是否有连续性？
4. 检查机构：是否有变化？
5. 如果时间线连续、合作网络稳定、机构一致，很可能是同一人
```

### 场景 4: 作者换机构

```
如果早期论文署名机构 A，近期论文署名机构 B：
1. 不要判断为"重名"
2. 检查时间线：机构变化是否合理？
3. 检查合作网络：是否有连续性？
4. 在输出中说明机构历史：
   "该作者曾在 {机构 A} 工作（{年份}），现在 {机构 B}（{年份}-至今）"
```

## 输出示例

### 示例 1: 高重名风险作者（Sheng Wang）

```
[第 1 轮搜索后]

检测到高重名风险姓名 "Sheng Wang"，将进行强消歧验证。

初步搜索结果分析：
- DBLP 返回 15+ 个不同的 Sheng Wang
- 需要使用机构信息（Wuhan University, Computer Science）进行过滤
- 需要验证与共同作者（Shengkun Zhu, Feiteng Nie）的合作关系

识别出 3 个候选人：
1. Sheng Wang (DBLP PID: 123/456) - Wuhan University
2. Sheng Wang (DBLP PID: 789/012) - Peking University
3. Sheng Wang (DBLP PID: 345/678) - UCLA

进入消歧流程...

[第 2 轮：搜索共同作者]

dblp_search("Shengkun Zhu")
dblp_search("Feiteng Nie")

分析结果：
- Shengkun Zhu 的论文列表中，有 4 篇与 Sheng Wang (PID: 123/456) 合作
- Feiteng Nie 的论文列表中，有 1 篇与 Sheng Wang (PID: 123/456) 合作
- 其他候选人与这两位作者无合作记录

[消歧结论]

候选人 1 (PID: 123/456) 总分: 100/100
- 机构匹配: 25/25 ✓
- 合作网络: 40/40 ✓ (与 2 位共同作者有合作)
- 论文验证: 25/25 ✓ (包含目标论文)
- 研究领域: 10/10 ✓

结论: 目标作者是候选人 1
置信度: 100/100
```

### 示例 2: 早期研究者（Feiteng Nie）

```
[搜索结果分析]

作者信息：
- 机构: Wuhan University, School of Computer Science
- ORCID: 0009-0007-5848-0720
- 论文数量: 1 篇（FedAPM）

数据质量评估：
- 完整性评分: 45/100（较差）
- 缺失信息: h-index, 引用数, Google Scholar, 更多论文

[补充搜索]

searxng_search("Feiteng Nie Google Scholar")
searxng_search("Feiteng Nie Wuhan University publications")

补充搜索结果：
- 未找到 Google Scholar 主页
- 未找到更多论文

[分析]

该作者为早期研究者（Ph.D Student），论文数量少属于正常情况。
- 有 ORCID 可以唯一标识
- 机构信息准确
- 目标论文已验证

虽然数据完整性评分较低（45/100），但考虑到作者的早期研究者身份，
这是可以接受的。建议未来定期更新该作者信息。
```

---

## 2. 实现策略

### 2.1 改进的 System Prompt 集成

将上述增强的 prompt 集成到现有的 `_explore_single_author` 函数中：

```python
system_prompt = f"""
{上述完整的增强 prompt}

## 目标论文信息（自动填充）
- 论文标题: {title}
- 发表会议/期刊: {venue}
- 发表年份: {year}
- 所有作者: {paper_authors}
- 目标作者: {author_name}
- 目标作者机构: {author_institution}  # 从论文中提取
- 目标作者邮箱: {author_email}  # 从论文中提取
"""
```

### 2.2 工具配置优化

**优先级策略**（基于 tester 的建议）：

```python
# Tier 1: 高可信度源（优先使用）
tier_1_tools = ["dblp_search", "openalex_search"]

# Tier 2: 补充验证源
tier_2_tools = ["searxng_search"]

# Tier 3: 兜底源
tier_3_tools = ["tavily_search", "serper_search"]
```

### 2.3 批量探索功能

**解决问题**：探索覆盖率低（22.2%）

```python
async def explore_all_authors(paper_id: int, db: AsyncSession):
    """批量探索论文的所有作者
    
    优先级策略：
    1. 第一作者（最高优先级）
    2. 通讯作者（*标记）
    3. 其他作者（按顺序）
    """
    paper = await db.get(Paper, paper_id)
    authors = parse_authors(paper.authors)
    
    # 识别优先级
    priority_authors = []
    normal_authors = []
    
    for idx, author in enumerate(authors):
        if idx == 0:  # 第一作者
            priority_authors.append((author, "first_author", 1))
        elif "*" in author or "†" in author:  # 通讯作者
            priority_authors.append((author, "corresponding_author", 2))
        else:
            normal_authors.append((author, "coauthor", 3))
    
    # 按优先级排序
    all_authors = sorted(priority_authors + normal_authors, key=lambda x: x[2])
    
    # 依次探索
    for author, role, priority in all_authors:
        await explore_single_author(paper_id, author, role, db)
```

### 2.4 重名风险评估模块

```python
def assess_homonym_risk(author_name: str) -> tuple[str, str]:
    """评估作者姓名的重名风险
    
    返回：(风险等级, 建议策略)
    """
    # 高风险中文姓名
    high_risk_chinese = [
        "Wei Wang", "Li Zhang", "Sheng Wang", "Yuan Sun", "Yuan Yao",
        "Lei Wang", "Ming Li", "Jing Liu", "Wei Liu", "Li Li"
    ]
    
    # 高风险英文姓名
    high_risk_english = [
        "John Smith", "Michael Johnson", "David Brown", "James Williams"
    ]
    
    if author_name in high_risk_chinese or author_name in high_risk_english:
        return ("high", "必须使用机构信息 + 合作网络 + 论文验证三重验证")
    
    # 中等风险：常见姓氏 + 常见名字
    common_surnames = ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou"]
    if any(surname in author_name for surname in common_surnames):
        return ("medium", "使用机构信息 + 论文验证")
    
    return ("low", "基础验证即可")

# 在 system prompt 中添加风险评估
risk_level, strategy = assess_homonym_risk(author_name)
system_prompt += f"""

## 重名风险评估结果
- 风险等级: {risk_level}
- 建议策略: {strategy}
"""
```

### 2.5 数据质量评估模块

```python
def calculate_data_quality_score(author_info: dict) -> tuple[int, list[str]]:
    """计算数据质量评分
    
    返回：(评分, 缺失信息列表)
    """
    score = 0
    missing = []
    
    # 必需信息（每项 15 分）
    if author_info.get("affiliation"):
        score += 15
    else:
        missing.append("机构信息")
    
    if author_info.get("research_areas"):
        score += 15
    else:
        missing.append("研究方向")
    
    if len(author_info.get("papers", [])) >= 3:
        score += 15
    else:
        missing.append("代表性论文（至少3篇）")
    
    if author_info.get("google_scholar") or author_info.get("dblp"):
        score += 15
    else:
        missing.append("学术主页")
    
    # 重要信息（每项 10 分）
    if author_info.get("h_index"):
        score += 10
    else:
        missing.append("h-index")
    
    if author_info.get("citations"):
        score += 10
    else:
        missing.append("总引用数")
    
    if author_info.get("homepage"):
        score += 10
    else:
        missing.append("个人主页")
    
    if author_info.get("orcid"):
        score += 10
    else:
        missing.append("ORCID")
    
    return (score, missing)
```

---

## 3. 测试验证

### 3.1 针对 FedAPM 论文的测试用例

基于 tester 的测试结果，设计以下测试用例：

#### 测试用例 1: Sheng Wang（高重名风险 + 通讯作者）

**输入**：
- 作者姓名: Sheng Wang
- 机构: Wuhan University, School of Computer Science
- 共同作者: Shengkun Zhu, Feiteng Nie, Jinshan Zeng, etc.

**预期输出**：
- 重名风险等级: 高
- 候选人数量: 10+
- 消歧置信度: >= 90
- 验证状态: 机构匹配 ✓, 合作网络匹配 ✓, 论文验证 ✓
- 数据质量评分: >= 70

**验证点**：
- LLM 是否识别出高重名风险？
- LLM 是否使用机构信息过滤候选人？
- LLM 是否验证与 Shengkun Zhu 的合作关系？
- LLM 是否确认论文列表包含 FedAPM？

#### 测试用例 2: Feiteng Nie（早期研究者 + 数据稀缺）

**输入**：
- 作者姓名: Feiteng Nie
- 机构: Wuhan University
- 论文数量: 1 篇

**预期输出**：
- 重名风险等级: 低
- 数据质量评分: 40-60（考虑早期研究者身份）
- 说明: "该作者为早期研究者，论文数量少属于正常情况"

**验证点**：
- LLM 是否识别出早期研究者身份？
- LLM 是否对数据质量评分标准进行调整？
- LLM 是否尝试补充搜索？

#### 测试用例 3: Yuan Yao（高重名风险 + 知名大学）

**输入**：
- 作者姓名: Yuan Yao
- 机构: HKUST

**预期输出**：
- 重名风险等级: 高
- 候选人数量: 5+
- 消歧置信度: >= 85
- 数据质量评分: >= 80（知名大学学者通常有丰富信息）

**验证点**：
- LLM 是否使用 HKUST 进行过滤？
- LLM 是否找到高质量的个人主页和 Google Scholar？
- LLM 是否识别出该作者的高学术影响力？

### 3.2 评估指标

**准确性指标**：
- 消歧成功率: 正确识别目标作者的比例（目标 >= 95%）
- 误判率: 错误归属论文的比例（目标 <= 5%）
- 验证通过率: 通过所有验证检查的比例（目标 >= 90%）

**完整性指标**：
- 探索覆盖率: 完成探索的作者数 / 总作者数（目标 100%）
- 数据质量平均分: 所有作者的数据质量评分平均值（目标 >= 70）
- 信息缺失率: 缺少关键信息的作者比例（目标 <= 20%）

**效率指标**：
- 平均探索时间: 每位作者的平均探索时间（目标 <= 60 秒）
- 工具调用次数: 平均每位作者的工具调用次数（目标 <= 10 次）

---

## 4. 与当前系统的对比

| 维度 | 当前系统 | 改进系统 | 提升 |
|------|---------|---------|------|
| 重名检测 | 无 | 有（自动评估风险等级） | ✓✓✓ |
| 重名消歧 | 无 | 有（多维度评分 + LLM 推理） | ✓✓✓ |
| 机构验证 | 无 | 有（主动搜索 + 时间维度验证） | ✓✓✓ |
| 合作网络分析 | 无 | 有（统计合作次数 + 权重 40%） | ✓✓✓ |
| 论文验证 | 无 | 有（必须包含目标论文） | ✓✓✓ |
| 数据质量评估 | 无 | 有（自动评分 + 缺失信息标注） | ✓✓ |
| 批量探索 | 无 | 有（一键探索所有作者） | ✓✓ |
| 优先级策略 | 无 | 有（第一作者 > 通讯作者 > 其他） | ✓✓ |
| 特殊场景处理 | 无 | 有（早期研究者、工业界、换机构等） | ✓✓ |
| 透明度 | 低 | 高（详细推理过程 + 置信度评分） | ✓✓✓ |

---

## 5. 实施计划

### Phase 1: 核心功能（2 周）

**目标**：解决最关键的问题

1. **集成增强的 System Prompt**
   - 将完整的消歧 prompt 集成到 `_explore_single_author`
   - 添加目标论文信息的自动填充
   - 添加重名风险评估

2. **实现批量探索功能**
   - 实现 `explore_all_authors` 函数
   - 添加优先级排序逻辑
   - 添加进度显示

3. **实现数据质量评估**
   - 实现 `calculate_data_quality_score` 函数
   - 在保存时自动计算评分
   - 在输出中显示评分和缺失信息

**验收标准**：
- 在 FedAPM 论文上测试，探索覆盖率达到 100%
- Sheng Wang 等高重名风险作者消歧成功
- 数据质量评分准确反映信息完整性

### Phase 2: 优化与完善（1 周）

**目标**：提高系统鲁棒性

1. **优化工具调用策略**
   - 实现自适应工具选择（根据重名风险调整）
   - 添加工具调用失败的重试机制
   - 优化并行调用策略

2. **增强验证机制**
   - 实现论文验证（必须包含目标论文）
   - 实现合作关系验证
   - 实现时间线验证

3. **特殊场景处理**
   - 添加早期研究者识别逻辑
   - 添加工业界研究者识别逻辑
   - 添加换机构检测逻辑

**验收标准**：
- 所有验证检查通过率 >= 90%
- 特殊场景识别准确率 >= 85%

### Phase 3: 用户体验（1 周）

**目标**：提升用户体验

1. **前端界面优化**
   - 添加批量探索按钮
   - 显示探索进度条
   - 显示数据质量评分
   - 显示消歧置信度

2. **结果展示优化**
   - 高亮显示验证状态
   - 显示消歧推理过程
   - 显示缺失信息提示

3. **错误处理优化**
   - 友好的错误提示
   - 重试建议
   - 人工审核入口

**验收标准**：
- 用户可以一键探索所有作者
- 用户可以清楚看到数据质量和置信度
- 用户可以理解消歧推理过程

---

## 6. 总结

### 6.1 核心改进

1. **LLM 驱动的智能消歧**
   - 通过精心设计的 prompt 让 LLM 自动评估重名风险
   - 让 LLM 进行多维度匹配分析（机构、合作网络、论文、研究领域）
   - 让 LLM 给出透明的推理过程和置信度评分

2. **系统化的验证机制**
   - 机构信息验证（包含时间维度）
   - 合作网络验证（统计合作次数）
   - 论文验证（必须包含目标论文）
   - 时间线验证（活跃期覆盖）

3. **智能的数据质量评估**
   - 自动计算完整性评分
   - 标注缺失的重要信息
   - 主动补充缺失信息

4. **完善的特殊场景处理**
   - 早期研究者（论文少）
   - 工业界研究者（论文少但有专利）
   - 跨领域作者（研究方向变化）
   - 换机构作者（机构历史追踪）

### 6.2 解决的问题

基于 tester 的测试结果：

1. ✓ **探索覆盖率低（22.2%）** → 批量探索功能（100%）
2. ✓ **重名问题严重** → 智能消歧机制（置信度 >= 90%）
3. ✓ **数据质量不一致** → 数据质量评估（评分 + 缺失信息标注）
4. ✓ **缺少验证机制** → 多重验证（机构、合作网络、论文、时间线）
5. ✓ **缺少优先级策略** → 优先级排序（第一作者 > 通讯作者 > 其他）

### 6.3 预期效果

- **消歧成功率**: 从 0% 提升到 >= 95%
- **探索覆盖率**: 从 22.2% 提升到 100%
- **数据质量**: 平均评分从 6/10 提升到 >= 7/10
- **用户体验**: 从手动逐个探索到一键批量探索

---

**设计完成时间**: 2026-03-02
**设计人员**: solution-designer
**基于**: architecture-analyst 的架构分析 + tester 的测试结果
**状态**: 最终版本，可以开始实现
