# Jignesh M. Patel

**机构**: Carnegie Mellon University

**职称/身份**: Professor; Interim Department Head, Computer Science Department

**研究方向**: Database Systems, Data Management, High-Performance Query Processing, Hardware-Software Co-Design for Data Processing, LLM-based Query Interfaces

## 学术背景

- **教育经历**: 博士毕业于 University of Wisconsin-Madison (1998)，导师为 David J. DeWitt，博士论文主题为"Efficient Database Support for Spatial Applications"
- **当前职位**: Carnegie Mellon University 计算机科学系教授及临时系主任（此前长期任职于 University of Wisconsin-Madison）
- **学术荣誉**: ACM Fellow (2014，表彰其在高性能数据库查询处理方法特别是空间数据方面的贡献)、IEEE Fellow、AAAS Fellow；多次获得 SIGMOD 和 VLDB 最佳论文奖；获得多项教学奖
- **学术特色**: 连续创业者和学术研究者的双重身份，专注于数据系统的系统效率（如可扩展数据平台）和人类效率（如基于 LLM 的查询接口）的双重提升，强调硬件-软件协同设计

## 学术链接

- DBLP: https://dblp.org/pid/p/JMPatel
- Google Scholar: https://scholar.google.com/citations?user=tOjfnFMAAAAJ&hl=en (引用数 22,896+)
- 个人主页: https://jigneshpatel.org/
- CMU 主页: https://www.csd.cs.cmu.edu/people/faculty/jignesh-patel
- 博客: BigFastData

## 代表性论文

1. **Structural Joins: A Primitive for Efficient XML Query Pattern Matching** - ICDE 2002 (高引用，XML 查询处理经典工作)
2. **BitWeaving: Fast Scans for Main Memory Data Processing** - SIGMOD 2013 (利用位级并行性加速内存数据处理的开创性工作)
3. **WideTable: An Accelerator for Analytical Data Processing** - VLDB 2014 (通过反规范化加速分析查询)
4. **The case against specialized graph analytics engines** - CIDR 2015 (挑战图分析专用引擎的必要性)
5. **Looking Ahead Makes Query Plans Robust** - VLDB 2017 (自适应查询处理)
6. **Quickstep: A Data Platform Based on the Scaling-Up Approach** - VLDB 2018 (纵向扩展数据平台)
7. **Efficiently Searching In-Memory Sorted Arrays: Revenge of the Interpolation Search?** - SIGMOD 2019
8. **SQLite: Past, Present, and Future** - VLDB 2022 (SQLite 演进分析)
9. **Simple Adaptive Query Processing vs. Learned Query Optimizers: Observations and Analysis** - VLDB 2023
10. **Regular Expression Indexing for Log Analysis** - SIGMOD 2026 (即将发表)

## 研究轨迹

Patel 的研究从早期的空间数据库和 XML 查询处理（1998-2005），逐步转向主内存数据处理和硬件加速（2010-2015，BitWeaving/WideTable 系列），再到数据平台系统设计（Quickstep）和自适应查询优化（2015-2020），近年来则聚焦于 LLM 驱动的数据分析接口和正则表达式查询优化。其研究始终围绕"如何让数据系统更快、更易用"这一核心主题，体现了从底层硬件优化到上层用户交互的全栈思维。

## 主要合作者

- Yinan Li (University of Wisconsin-Madison, BitWeaving 系列合作)
- Yannis Chronis (多篇查询优化论文合作)
- Anastasia Ailamaki (早期数据库系统合作)
- H. V. Jagadish (XML 查询处理合作)
- David DeWitt (博士导师，早期合作者)

## 与本论文的关系

- 作者位次: 末位作者（通常为通讯作者/指导教授）
- 本论文在其研究脉络中的位置: Panorama 论文聚焦于近似最近邻搜索（ANNS）的验证瓶颈优化，通过机器学习驱动的数据自适应方法加速查询。这延续了 Patel 长期关注的"硬件感知的高性能数据处理"主题，同时体现了其近年来对机器学习与数据系统融合的兴趣。该工作与其 BitWeaving、WideTable 等经典工作一脉相承，都致力于通过算法创新突破系统性能瓶颈。

## 消歧说明

通过 DBLP 主页 URL (https://dblp.org/pid/p/JMPatel)、Carnegie Mellon University 官方主页、Google Scholar 高引用数（22,896+）以及与论文合作者网络（Sayan Ranu, Panagiotis Karras）的交叉验证，确认为 CMU 计算机科学系的 Jignesh M. Patel 教授，而非其他同名学者（如 IIIT Vadodara 的 Jignesh Patel 或医学领域的 Dr. Jignesh Patel）。

## 花边与轶事

Patel 是一位连续创业者，共联合创办了四家科技公司：Paradise (1997)、Locomatix (2007，被收购)、Quickstep Technologies (2015，被 Pivotal Software 收购) 和 DataChat (2017，目前担任 CEO)。DataChat 致力于通过自然语言接口让数据科学"民主化"，体现了他"提升人类效率"的研究理念在商业领域的实践。他在 LinkedIn 上曾兴奋地分享 DataChat 基于 LLM 的新功能，称"我们才刚刚开始真正让语言模型发挥作用"。此外，他维护着一个名为 BigFastData 的技术博客，分享数据系统设计的深度见解。值得一提的是，他的博士导师 David DeWitt 是数据库领域的传奇人物，Patel 继承了导师对系统性能的极致追求，同时开辟了硬件协同设计的新方向。