# Jianyang Gao

**机构**: ETH Zürich (Scalable Parallel Computing Laboratory)

**职称/身份**: Postdoctoral Researcher

**研究方向**: 高维向量量化、近似最近邻搜索、向量数据库系统、机器学习系统、大语言模型算法优化

## 学术背景

- **教育经历**: 本科北京师范大学数学系（2021），博士新加坡南洋理工大学（2025，导师 Cheng Long 教授）
- **当前职位**: ETH Zürich 博士后研究员（2025至今，合作导师 Torsten Hoefler 教授）
- **学术荣誉**: 
  - 南洋理工大学 CCDS 杰出博士论文奖（2025年，仅两位获奖者之一）
  - ICPC 2019 世界总决赛第62名（代表北京师范大学 Faraway 队）
  - SIGMOD 2024 差旅资助
- **学术特色**: 专注于为向量数据库和机器学习系统设计具有严格理论保证的高效算法，其 RaBitQ 系列工作在高维向量量化领域产生重要影响

## 学术链接

- DBLP: https://dblp.org/pid/342/8325.html
- Google Scholar: https://scholar.google.com/citations?user=p880HHcAAAAJ
- 个人主页: https://gaoj0017.github.io/
- GitHub: https://github.com/gaoj0017

## 代表性论文

1. **Practical and Asymptotically Optimal Quantization of High-Dimensional Vectors in Euclidean Space for Approximate Nearest Neighbor Search** - SIGMOD 2025 (第一作者)

2. **RaBitQ: Quantizing High-Dimensional Vectors with a Theoretical Error Bound for Approximate Nearest Neighbor Search** - SIGMOD 2024 (第一作者)

3. **High-Dimensional Vector Quantization: General Framework, Recent Advances, and Future Directions** - IEEE Data Engineering Bulletin 2024 (第一作者，综述文章)

4. **SymphonyQG: towards Symphonious Integration of Quantization and Graph for Approximate Nearest Neighbor Search** - SIGMOD 2025 (共同第一作者，与 Yutong Gou)

5. **iRangeGraph: Improvising Range-dedicated Graphs for Range-filtering Nearest Neighbor Search** - SIGMOD 2025 (共同第一作者，与 Yuexuan Xu)

6. **High-Dimensional Approximate Nearest Neighbor Search: with Reliable and Efficient Distance Comparison Operations** - SIGMOD 2023 (第一作者)

7. **DEG: Efficient Hybrid Vector Search Using the Dynamic Edge Navigation Graph** - SIGMOD 2025 (合作者)

8. **GPU-Native Approximate Nearest Neighbor Search with IVF-RaBitQ: Fast Index Build and Search** - Preprint 2026 (合作者)

## 研究轨迹

Jianyang Gao 的研究始于 2023 年对高维向量近似最近邻搜索中距离比较可靠性的探索，随后在 2024 年提出了具有理论误差界的 RaBitQ 量化方法，成为其标志性工作。2025 年进一步将该方法扩展为渐近最优的量化框架，并与图���引、范围过滤等技术深度融合。其研究从纯理论保证逐步延伸到 GPU 加速、后训练量化等系统实现层面，形成了从理论到工程的完整研究链条。

## 主要合作者

- Cheng Long (南洋理工大学，博士导师，合作论文 7+ 篇)
- Raymond Chi-Wing Wong (香港科技大学，合作论文 4 篇)
- Yutong Gou (南洋理工大学，共同第一作者合作 2 篇)
- Yuexuan Xu (南洋理工大学，共同第一作者合作 2 篇)
- Yongyi Yang (合作论文 3 篇)
- Torsten Hoefler (ETH Zürich，博士后合作导师)

## 与本论文的关系

- 作者位次: 第一作者
- 本论文在其研究脉络中的位置: 这是 Jianyang Gao 的 RaBitQ 系列工作的集大成之作，将 2024 年 SIGMOD 提出的 RaBitQ 方法扩展为渐近最优的理论框架，并提供了实用的工程实现。该论文标志着其博士研究的高峰，也是其获得 CCDS 杰出博士论文奖的核心成果。论文同时开源了 RaBitQ Library，在学术界和工业界产生广泛影响。

## 消歧说明

通过 DBLP 主页 URL (https://dblp.org/pid/342/8325.html)、个人主页 (https://gaoj0017.github.io/) 以及与合作者网络（Cheng Long、Raymond Chi-Wing Wong）的交叉验证确认身份。该作者与其他同名学者（如北京师范大学地理学院的 Jianbo Gao 教授）明确区分。

## 花边与轶事

- **竞赛经历**: Jianyang Gao 在本科期间是活跃的算法竞赛选手，Codeforces 账号为 MisakaKuma，曾代表北京师范大学 Faraway 队（队员：Hechuan Guo, Jianyang Gao, Ke Sun）参加 2019 年 ICPC 世界总决赛并获得第 62 名，这段经历为其后续的算法研究奠定了扎实基础
- **开源贡献**: 维护 RaBitQ Library 和 Extended-RaBitQ 等开源项目（GitHub 组织 VectorDB-NTU），其中 Extended-RaBitQ 项目获得 61 stars
- **学术服务**: 担任多个顶会的审稿人（SIGMOD, VLDB, ICDE, ICML 等）和期刊审稿人（TKDE, WWWJ, TC），2027 年起担任 SIGMOD Light-Load Fast-Response (LLFR) Reviewers
- **学术演讲**: 在工业界有广泛影响力，曾受邀在 Ant Group、Zilliz、Microsoft、Meta、ByteDance、Huawei 等公司进行技术分享，并在 FOCS 2025 ANNS Workshop 和 Bangalore System Meetups 等学术会议上做报告
- **博客写作**: 在个人主页维护技术博客，撰写了《Quantization in The Counterintuitive High-Dimensional Space》和《Extended RaBitQ: an Optimized Scalar Quantization Method》等深度技术文章
- **研究风格**: 从数学背景转向计算机科学，其研究兼具理论深度和工程实用性，特别强调"具有严格理论保证的实用算法"（algorithms with rigorous theoretical guarantees）