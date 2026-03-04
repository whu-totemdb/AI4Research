# PANORAMA: FAST-TRACK NEAREST NEIGHBORS

Vansh Ramani1,2,3\*Alexis Schlomer2,4\* Akash Nayar2,4\*Panagiotis Karras3   
Sayan Ranu1 Jignesh M.Patel²   
1Indian Institute of Technology Delhi, India 2Carnegie Mellon University, USA   
3University of Copenhagen, Denmark 4Databricks, USA

{cs5230804,sayan}@cse.iitd.ac.in {aschlome,akashnay,jigneshp}@cs.cmu.edu piekarras@gmail.com\*

# ABSTRACT

Approximate Nearest-Neighbor Search (ANNS） efficiently finds data items whose embeddings are close to that of a given query in a high-dimensional space, aiming to balance accuracy with speed. Used in recommendation systems, image and video retrieval, natural language processing, and retrieval-augmented generation (RAG), ANNS algorithms such as IVFPQ, HNSW graphs, Annoy, and MRPT utilize graph, tree,clustering，and quantization techniques to navigate large vector spaces.Despite this progress,ANNS systems spend up to $9 9 \%$ of query time to compute distances in their final refinement phase. In this paper, we present PANORAMA,a machine learning-driven approach that tackles the ANNS verification bottleneck through data-adaptive learned orthogonal transforms that facilitate the accretive refinement of distance bounds. Such transforms compact over $90 \%$ of signal energy into the first half of dimensions,enabling early candidate pruning with partial distance computations. We integrate PANORAMA into SotA ANNS methods, namely IVFPQ/Flat, HNSW, MRPT,and Annoy,without index modification, using level-major memory layouts, SIMD-vectorized partial distance computations,and cache-aware access patterns. Experiments across diverse datasets—from image-based CIFAR-10 and GIST to modern embedding spaces including OpenAI's Ada 2 and Large 3—demonstrate that PANORAMA affords a $2 \mathrm { - } 3 0 \mathrm { x }$ end-to-end speedup with no recall loss.

# 1INTRODUCTION AND RELATED WORK

The proliferation of large-scale neural embeddings has transformed machine learning applications, from computer vision and recommendation systems (Lowe,2O04; Koren et al., 2009) to bioinformatics (Altschul et al.,1990) and modern retrieval-augmented generation (RAG) systems (Lewis et al., 2020; Gao et al.,2023). As embedding models evolve from hundreds to thousands of dimensions— exemplified by OpenAI's text-embedding-3-large (Neelakantan et al.,2022)—the demand for efficient and scalable real-time Approximate Nearest-Neighbor Search (ANNS) intensifies.

![](images/4d81d27f623f9f3892d92a1acd01c295ee799839d1ab4ddbedeae55e9f7b558c.jpg)  
Figure 1: Common ANNS operations on vector databases.

Current ANNS methods fall into four major categories: graph-based, clustering-based, treebased,and hash-based. Graph-based methods,such as HNsW (Malkov & Yashunin, 2020) and

DiskANN (Subramanya et al., 2019), build a navigable connectivity_structure that supports logarithmic search. Clustering and quantization-based methods, e.g., IVFPQ (Jégou et al.,2011; 2008） and ScaNN (Guo et al., 2O2O)， partition the space into regions and compress representations within them. Tree-based methods,including kd-trees (Bentley,1975) and FLANN (Muja & Lowe,2O14),recursively divide the space but degrade in high dimensions due to the curse of dimensionality.Finally, hash-based methods,such as LSH (Indyk & Motwani,1998;Andoni & Indyk,2006) and multi-probe LSH (Lv et al., 2O07), map points into buckets so that similar points are likely to collide. Despite this diversity,all such methods operate in two phases (Babenko & Lempitsky, 2016): fltering and refinement (or verification). Figure 1 depicts this pipeline. Filtering reduces the set of candidate nearest neighbors to those qualifying a set of criteria and refinement operates on these candidates to compute the query answer set. Prior work has overwhelmingly targeted the filtering phase,assuming that refinement is fast and inconsequential.

This assumption held reasonably well in the pre-deep learning era, when embeddings were relatively low-dimensional. However,neural embeddings have fundamentally altered the landscape,shifting workloads toward much higher dimensionality and engendering a striking result shown in Figure 2: refinement now accounts for a dominant $7 5 { - } 9 9 \%$ share of query latency， and generally grows with dimensionality. Some works sought to alleviate this bottleneck by probabilistically estimating distances through partial random (Gao & Long,2O23) and PCA projections (Yang et al.,

![](images/341a43184b54326d6f3092b47ac07159ca882568ceddd622b8bcd87d9b6a3b86.jpg)  
Figure 2: Time share for refinement.

2025)and refining them on demand. However, such probabilistic estimation methods forgo exact distances and, when using random sampling, preclude any memory-locality benefits.This predicament calls for innovation towards efficient and exact refinement in ANNS for neural embeddings. In this paper, we address this gap with the following contributions.

· Cumulative distance computation. We introduce PANORAMA,an accretive ANNS refinement framework that complements existing ANNS schemes (graph-based, tree-based, clustering, and hashing) to render them effective on modern workloads. PANORAMA incrementally accumulates $L _ { 2 }$ distance terms over an orthogonal transform and refines lower/upper bounds on the fly, promptly pruning candidates whose lower distance bound exceeds the running threshold.

· Learned orthogonal transforms. We introduce a data-adaptive Cayley transform on the Stiefel manifold that concentrates energy in leading dimensions, enabling tight Cauchy-Schwarz distance bounds for early pruning. Unlike closed-form transforms,this learned transform adapts to arbitrary vector spaces,ranging from classical descriptors like SIFT to modern neural embeddings.

· Algorithm-systems co-design. We carefully co-design system aspects with specialized variants for contiguous and non-contiguous memory layouts,leveraging SIMD vectorization, cache-aware layouts,and batching, and also provide theoretical guarantees alongside practical performance.

·Integrability. We fold PANORAMA into five key ANNS indexes (IVFPQ, IVFFlat, HNSW, MRPT, Annoy) to gain speedups without loss of recall and showcase its efficaciousness through experimentation across datasets, hyperparameters,and out-of-distribution queries.

# 2PANORAMA: DISTANCE COMPUTATION

Problem 1 ( $k \mathrm { N N }$ refinement). Given a query vector $\textbf { q } \in \mathbb { R } ^ { d }$ and a candidate set $\begin{array} { r l } { \mathcal { C } } & { { } = } \end{array}$ $\left\{ \mathbf { x } _ { 1 } , \ldots , \mathbf { x } _ { N ^ { \prime } } \right\}$ find the set ${ \mathcal { S } } \subseteq { \mathcal { C } }$ such that $| S | = k$ and $\forall \mathbf { s } \in S , \mathbf { x } \in \mathcal { C } \setminus S : \| \mathbf { q } - \mathbf { s } \| _ { 2 } \leq \| \mathbf { q } - \mathbf { x } \| _ { 2 }$ Problem 2 (ANN index). $A n$ approximate nearest neighbor index is a function $\mathcal { T } : \mathbb { R } ^ { d } \times \mathbb { D }  2 ^ { | \mathbb { D } | }$ that maps a query q and a set of vectors in a database $\mathbb { D }$ to a candidate set $\mathcal { C } = \mathcal { I } ( \mathbf { q } , \mathbb { D } ) \subset \mathbb { D } _ { \mathbf { \lambda } }$ where $\mathcal { C }$ contains the true $k$ -nearest neighbors with high probability.1

Problem 1 poses a computational bottleneck: given $N ^ { \prime }$ candidates, naive refinement computes $\| \mathbf { q } - \mathbf { \partial }$ $\begin{array} { r } { \mathbf { x } _ { i } \| _ { 2 } ^ { 2 } = \sum _ { j = 1 } ^ { d } ( \mathbf { q } _ { j } - \mathbf { x } _ { i , j } ) ^ { 2 } } \end{array}$ for each $\mathbf { x } _ { i } \in \mathcal { C }$ , requiring $\Theta ( N ^ { \prime } \cdot d )$ operations.

Kashyap & Karras (2O11) introduced STEPWISE $k \mathbf { N N }$ search, which incrementally incorporates features (i.e., dimensions)and refines lower (LB) and upper (UB) bounds for each candidate's distance from the query. This accretive refinement eventually yields exact distances. In addition, STEPWISE keeps track of the $k ^ { \mathrm { t h } }$ upper bound $d _ { k }$ in each iteration, and prunes candidates having $\mathsf { L B } > d _ { k }$ When no more than $k$ candidates remain, these form the exact $k \mathbf { N N }$ result. We derive distance bounds using a norm-preserving transform $T : \mathbb { R } ^ { d }  \mathbb { R } ^ { d }$ along the lines of (Kashyap $\&$ Karras, 2011), by decomposing the squared Euclidean distance as in:

$$
\| \mathbf { q } - \mathbf { x } \| ^ { 2 } = \| T ( \mathbf { q } ) \| ^ { 2 } + \| T ( \mathbf { x } ) \| ^ { 2 } - 2 \langle T ( \mathbf { q } ) , T ( \mathbf { x } ) \rangle
$$

Using thresholds $0 = m _ { 0 } < m _ { 1 } < \cdot \cdot \cdot < m _ { L } = d$ partitioning vectors into $L$ levels $\ell _ { 1 } , \ell _ { 2 } , \dots , \ell _ { L }$ ， we define partial inner products and tail (residual) energies:

$$
p ^ { ( \ell _ { 1 } , \ell _ { 2 } ) } ( \mathbf { q } , \mathbf { x } ) = \sum _ { j = m _ { \ell _ { 1 } } + 1 } ^ { m _ { \ell _ { 2 } } } T ( \mathbf { q } ) _ { j } T ( \mathbf { x } ) _ { j } , \quad R _ { T ( \mathbf { q } ) } ^ { ( \ell _ { 1 } , \ell _ { 2 } ) } = \sum _ { j = m _ { \ell _ { 1 } } + 1 } ^ { m _ { \ell _ { 2 } } } T ( \mathbf { q } ) _ { j } ^ { 2 } , \quad R _ { T ( \mathbf { x } ) } ^ { ( \ell _ { 1 } , \ell _ { 2 } ) } = \sum _ { j = m _ { \ell _ { 1 } } + 1 } ^ { m _ { \ell _ { 2 } } } T ( \mathbf { x } ) _ { j } ^ { 2 }
$$

The inner product terms from level $m _ { \ell }$ to the last dimension $d$ satisfy the Cauchy-Schwarz inequality(Hom &Jonso012) $\begin{array} { r } { \left| \sum _ { j = m _ { \ell } + 1 } ^ { d } T ( \mathbf { q } ) _ { j } T ( \mathbf { x } ) _ { j } \right| \leq \sqrt { R _ { T ( \mathbf { q } ) } ^ { ( \ell , d ) } R _ { T ( \mathbf { x } ) } ^ { ( \ell , d ) } } } \end{array}$ hence h ounds

$$
\begin{array} { r l } & { \mathsf { L B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) = R _ { T ( \mathbf { q } ) } ^ { ( 0 , d ) } + R _ { T ( \mathbf { x } ) } ^ { ( 0 , d ) } - 2 \left( p ^ { ( 0 , \ell ) } ( \mathbf { q } , \mathbf { x } ) + \sqrt { R _ { T ( \mathbf { q } ) } ^ { ( \ell , d ) } R _ { T ( \mathbf { x } ) } ^ { ( \ell , d ) } } \right) \le \| \mathbf { q } - \mathbf { x } \| ^ { 2 } } \\ & { \mathsf { U B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) = R _ { T ( \mathbf { q } ) } ^ { ( 0 , d ) } + R _ { T ( \mathbf { x } ) } ^ { ( 0 , d ) } - 2 \left( p ^ { ( 0 , \ell ) } ( \mathbf { q } , \mathbf { x } ) - \sqrt { R _ { T ( \mathbf { q } ) } ^ { ( \ell , d ) } R _ { T ( \mathbf { x } ) } ^ { ( \ell , d ) } } \right) \le \| \mathbf { q } - \mathbf { x } \| ^ { 2 } } \end{array}
$$

PANORAMA,outlined in Algorithm 1,maintains a heap $H$ of the exact $k \mathbf { N N }$ distances among processed candidates,initialized with the $k$ first read candidates,and the $k ^ { \mathrm { t h } }$ smallest distance $d _ { k }$ from the query (Algorithm 4). For subsequent candidates,it monotonically tightens the lower bound as $\begin{array} { r } { \mathsf { L B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) \le } \end{array}$ $\mathsf { L B } ^ { \ell + 1 } ( \mathbf { q } , \mathbf { x } ) \le \| \mathbf { q } - \mathbf { x } \| ^ { 2 }$ ,and prunes the candidate once that lower bound exceeds the $d _ { k }$ threshold (Algorithm 4)， enabling early termination at dimension $m _ { \ell } < d$ (Algorithm 4); otherwise,it reaches the exact distance and updates $H$ accordingly (Lines 12-14). Thanks to

# Algorithm 1 PANORAMA: Iterative Distance Refinement

1:Input: Query q,candidate set $\mathcal { C } = \{ \mathbf { x } _ { 1 } , \dots , \mathbf { x } _ { N ^ { \prime } } \}$ , transform $_ T$ ， $k$ , batch size $B$   
2:Precompute: $T ( \mathbf { q } )$ , $\| T ( \mathbf { q } ) \| ^ { 2 }$ ,and tail energies $R _ { q } ^ { ( \ell , d ) }$ for all $\ell$   
3: Initialize: Global exact distance heap $H$ (size $k$ ),global threshold $d _ { k } \gets + \infty$   
4:Compute exact distances of frst $k$ candidates, initialize $H$ and $d _ { k }$   
5: for each batch $B \subset { \mathcal { C } }$ of size $B$ dowhen $| B | = 1$ the following reduces to each   
"for each candidate $\mathbf { x } \in { \mathcal { C } } ^ { \ }$   
$^ 6$ for $\ell = 1$ to $L$ do   
for each candidate $\mathbf { x } \in B$ do   
if $\mathsf { L B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) > d _ { k }$ then Update LB bound   
9: Mark $\mathbf { x }$ as pruned If threshold exceeded, prune candidate   
10: continue   
11: if $\pi = 1$ then   
12: Compute $\mathsf { U B } ^ { \ell } ( \mathbf { q } , \mathbf { x } )$ Compute upper bound   
13: i $\mathsf { f } \mathsf { U B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) < d _ { k }$ then   
14: Push $( \mathsf { U B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) , \mathbf { x } )$ to $H$ as UB entry   
15: Update $d _ { k } = k ^ { \mathrm { t h } }$ distance in $H ; \mathbf { C r o p } \ H$   
16: if $\pi = 0$ then   
17: for each unpruned candidate $\mathbf { x } \in B$ do   
18: Push $( \mathsf { L } \mathsf { \bar { B } } ^ { L } ( \mathbf { q } , \mathbf { x } ) , \mathbf { x } )$ to $H$ as exact entry $\mathsf { D } \mathsf { L B } ^ { L } ( \mathbf { q } , \mathbf { x } )$ is ED as $\ell = L$   
19: if $d < d _ { k }$ then   
20: Update $d _ { k } = k ^ { \mathrm { t h } }$ distance in $H$ ; Crop $H$   
21:return Candidates in $H$ (top $k$ with possible ties at $k ^ { \mathrm { t h } }$ position)

the correctness of lower bounds and the fact that $d _ { k }$ holds the $\overline { { k ^ { \mathrm { t h } } } }$ distance among processed candidates,candidates that belong in the $k \mathbf { N N }$ result are not pruned. Algorithm 1 encapsulates a general procedure for several execution modes of PANORAMA． Appendix C provides further details on those modes. Notably, STEPWISE assumes a monolithic contiguous storage scheme, which does not accommodate the multifarious layouts used in popular ANNS indexes. We decouple the pruning strategy from memory layout with a batch processing framework that prescribes three execution modes using two parameters: a batch size $B$ and an upper bound policy $\bar { \pi } \in \{ 0 , 1 \}$ ：

1.Point-centric $( B = 1 , \pi = 0 )$ , which processes candidates individually with early abandoning, hence suits graph- and tree-based indexes that store candidates in non-contiguous layouts.

2.Batch-noUB $( B > 1 , \pi = 0 )$ ,which defers heap updates to reduce overhead and enhance throughput,appropriate for indexes organizing vectors in small batches.

3.Batch-UB $( B \gg 1 , \pi = 1 )$ ， which amortizes system costs across large batches and uses upper bounds for fine-tuned pruning within each batch.

When using batches, we compute distances for candidates within a batch in tandem. Batch sizes are designed to fit in L1 cache and the additional cost is negligible. Section 5 provides more details.

Thte $\mathbf { x } _ { i }$ $\mathbf { x } _ { i }$ $\rho _ { i } \in \{ m _ { 0 } , . . . , m _ { L } \}$ $\begin{array} { r } { C = \sum _ { i = 1 } ^ { N ^ { \prime } } \rho _ { i } } \end{array}$ expected cost $\mathbb { E } [ C ] = N ^ { \prime } \mathbb { E } [ \rho ]$ Defining $\begin{array} { r } { \phi = \frac { \mathbb { E } [ \rho ] } { d } } \end{array}$ as theaverageftiofdimesiosproced per candidate, the expected cost becomes $\mathbb { E } [ C o s t ] = \phi \cdot d \cdot N ^ { \prime }$

PANORAMA relies on two design choices: first, a transform $T$ that concentrates energy in the leading dimensions, enabling tight bounds, which we achieve through learned transforms (Section 4) yielding exponential energy decay； second, level thresholds $m _ { \ell }$ that strike a balance between the computational overhead level-wise processing incurs and the pruning granularity it provides.

# 3THEORETICAL GUARANTEES

Here,we establish that, under a set of reasonable assumptions,the expected computational cost of PANORAMA significantly supersedes the brute-force approach. Our analysis is built on the pruning mechanism,the data distribution,and the properties of energy compaction, motivating our development of learned orthogonal transforms in Section 4. The complete proofs are in Appendix A.

Notation. We use asymptotic equivalence notation: for functions $f ( n )$ and $g ( n )$ ，we write $f ( n ) \sim c \cdot g ( n )$ if $\mathrm { l i m } _ { n \to \infty } { \bar { f } } ( n ) { \bar { / } } g ( n ) = c$ for some constant $c > 0$ . PANORAMA maintains a pruning threshold $d _ { k }$ as the squared distance of the $k ^ { \mathrm { t h } }$ nearest neighbor among candidates processed so far. Candidates whose lower bound on distance exceeds this threshold are pruned. The pruning effectiveness depends on the margin $\Delta$ between a candidate's real distance and the threshold $d _ { k }$ . Larger margins allow for earlier pruning. Our theoretical analysis relies on the following key assumptions:

A1. Energy compaction: we use an orthogonal transform $T$ that achieves exponential energy decay. The energy of vector $\mathbf { x }$ after the first $m$ dimensions is bounded by $R _ { \mathbf { x } } ^ { ( m , d ) } \approx \lVert \mathbf { x } \rVert ^ { 2 } e ^ { - \frac { \alpha \dot { m } } { d } }$ ， where $\alpha > 1$ is an energy compaction parameter.   
A2. Level structure: we use levels of a single dimension each, $m _ { \ell } = \ell$ , at the finest granularity.   
A3. Gausian distance distribution: the squared Euclidean distances of vectors from a given query q, $\| \mathbf { q } - \mathbf { x } \| ^ { 2 }$ , follow a Gaussian distribution.   
A4.Bounded norms: all vectors have norms bounded by a constant $R$

From these assumptions, we aggregate the cost of pruning over allcandidates,analyzing the behavior of the margin $\Delta$ to derive the overall complexity. The full derivation in Appendix A provides a highprobability bound on the cost.

Theorem 2 (Complexity). By assumptions A1-A4, the expected computational cost to process a candidate set of size $N$ is:

$$
\mathbb { E } [ C o s t ] \sim \frac { C \cdot N d } { \alpha }
$$

where $C$ is a constant that approaches $^ { l }$ as $N \to \infty$ under normalization.

This result shows that any effective energy-compacting transform with $\alpha > 1$ strictly supersedes the naive complexity of $N d$ (for which $C = 1$ )，while the compaction parameter $\alpha$ determines the speedup.Since $C \approx 1$ in practice (as confirmed by the empirical validation in Section 6.2), PANORAMA achieves an approximately $\alpha$ -fold speedup. In effect, a larger $\alpha$ renders PANORAMA more efcient. We show that the analysis extends to the scenario of out-of-distribution (OOD) queries that do not compact as effectively as the database vectors:

Theorem 3 (Robustness to Out-of-Distribution Queries). Assume the query vector has energy compaction $\alpha _ { q }$ and database vectors have compaction $\alpha _ { x }$ . Under assumptions A1-A4, the expected cost adheres to effective compaction $\alpha _ { e f f } = ( \alpha _ { q } + \alpha _ { x } ) / 2$ ：

$$
\mathbb { E } [ C o s t ] \sim \frac { C \cdot N d } { \alpha _ { e f f } } \sim \frac { 2 C \cdot N d } { \alpha _ { q } + \alpha _ { x } }
$$

This result, shown in Section 6, demonstrates PANORAMA's robustness. Even if a query is fully OOD $( \alpha _ { q } = 0 )$ ), the algorithm's complexity becomes $2 C \cdot N d / \alpha _ { x }$ , and still achieves a significant speedup provided the database is wel-compacted, ensuring graceful performance degradation for challenging queries. In the following,we develop methods to learn data-driven orthogonal transforms that enhance energy compaction.

# 4LEARNING ORTHOGONAL TRANSFORMS

Several linear orthogonal transforms,such as the Discrete Cosine Transform (DCT) and Discrete Haar Wavelet Transform (DHWT) Mallat (1999); Thomakos (2015), exploit local self-similarity properties in data arising from physical processes such as images and audio. However, these assumptions fail in modern high-dimensional machine learning datasets, e.g., word embeddings and document-term matrices. In these setings,classic transforms achieve limited energy compaction and no permutation invariance. To address_this deficiency， we propose learning a tailored linear orthogonal transform for ANNS purposes. Formally, we seek a matrix $T \in \mathbb { R } ^ { d \times \smile }$ ,with $T ^ { \top } T = I$ ， such that the transform ${ \bf z } = T { \bf x }$ of a signal $\mathbf { x }$ attains energy compaction, i.e. concentrates most energy in its leading dimensions while preserving norms by orthogonality, i.e., $\| \mathbf { z } \| _ { 2 } = \| \mathbf { x } \| _ { 2 }$

# 4.1PARAMETERIZATION

We view the set of orthogonal matrices, $\mathcal { O } ( d ) = \{ T \in \mathbb { R } ^ { d \times d } : T ^ { \top } T = I \}$ ， as the Stiefel manifold (Edelman et al.,1998),a smooth Riemannian manifold where geodesics (i.e., straight paths on the manifold's surface) correspond to continuous rotations. The Cayley transform (Hadjidimos & Tzoumas,2009;Absil et al.,2007) maps any $d { \times } d$ real skew-symmetric (antisymmetric) matrix A— i.e. an element of the Lie algebra ${ \mathfrak { s o } } ( d )$ of the special orthogonal group $\mathrm { S O } ( d )$ ,with $\mathbf { A } ^ { \top } = - \mathbf { A }$ ， hence having $\dim = d ( d - 1 ) / 2$ independent entries (Hall,2013)—to an orthogonal matrix in $\mathrm { S O } ( d )$ (excluding rotations with $- 1$ eigenvalues). The resulting matrix lies on a subset of the Stiefel manifold,and the mapping serves as_a smooth retraction, providing a first-order approximation of a geodesic at its starting point (Absil et al.,2OO7) while avoiding repeated projections:

$$
\begin{array} { r } { T ( \mathbf { A } ) = \big ( I - \frac { \gamma } { 2 } \mathbf { A } \big ) ^ { - 1 } \big ( I + \frac { \gamma } { 2 } \mathbf { A } \big ) . } \end{array}
$$

The parameter $\gamma$ controls the step size of the rotation on the Stiefel manifold: smaller $\gamma$ values yield smaller steps,while larger values allow more aggressive rotations but may risk numerical instability. Contrary to other parameterizations for orthogonal transform operators,such as updates via Householder reflections Householder (1958) and Givens rotations Givens (1958), which apply a non-parallelizable sequence of simple rank-one or planar rotations, the Cayley map yields a fullmatrix rotation in a single update step, enabling eficient learning on GPUs without ordering bias. Unlike structured fast transforms (Cooley & Tukey,1965) (e.g.,DCT), which rely on sparse, rigidly defined matrices crafted for specific data types,the learned transform is dense and fully determined by the data, naturally adapting to any dataset. Further, the Cayley map enables learning from a rich and continuous family of rotations； although it excludes rotations with $- 1$ as an eigenvalue, which express a half-turn in some plane (Hall,2O13), it still allows gradient-based optimization using standard batched linear-algebra primitives,which confer numerical stability, paralelizability, and suitability for GPU acceleration.

# 4.2ENERGY COMPACTION LOSS

As discussed, we prefer a transform that compacts the signal's energy into the leading dimensions and lets residual energies $R ^ { ( \ell , d ) }$ (Section 2) decay exponentially. The residual energy of asignal $\mathbf { x }$ by an orthogonaltrastorm $T$ followigh srst $\ell$ coefeientsis $\begin{array} { r } { R _ { T \mathbf { x } } ^ { ( \ell , d ) } = \sum _ { j = \ell } ^ { d - 1 } ( T \mathbf { x } ) _ { j } ^ { 2 } } \end{array}$ We formuate a loss function that penalizes deviations of normalized residuals from exponential decay,on each dimension and for all vectors ina dataset $\mathcal { D }$ , explicitly depending on the parameter matrix A:

$$
\begin{array} { r } { \mathcal { L } ( T ( \mathbf { A } ) ; \mathcal { D } ) = \frac { 1 } { N } \displaystyle \sum _ { \mathbf { x } \in \mathcal { D } } \frac { 1 } { d } \displaystyle \sum _ { \ell = 0 } ^ { d - 1 } \left( \frac { R _ { T ( \mathbf { A } ) \mathbf { x } } ^ { ( \ell , d ) } } { R _ { T ( \mathbf { A } ) \mathbf { x } } ^ { ( 0 , d ) } } - e ^ { - \frac { \alpha \ell } { d } } \right) ^ { 2 } , \quad \alpha > 0 . } \end{array}
$$

The learning objective is thus to find the optimal skew-symmetric matrix $\mathbf { A } ^ { * }$

$$
\mathbf { A } ^ { * } = \underset { \mathbf { A } \in \mathfrak { s o } ( d ) } { \operatorname { a r g m i n } } \mathcal { L } ( T ( \mathbf { A } ) ; \mathcal { D } ) .
$$

We target this objective by gradient descent, updating $\mathbf { A }$ at iteration $t$ as:

$$
\begin{array} { r } { \mathbf { A } ^ { ( t + 1 ) } = \mathbf { A } ^ { ( t ) } - \eta \nabla _ { \mathbf { A } } \mathcal { L } \big ( T ( \mathbf { A } ^ { ( t ) } ) ; \mathcal { D } \big ) , } \end{array}
$$

where $\eta$ is the learning rate, parameterizing only upper-triangular values of $\mathbf { A }$ to ensure it remains   
skew-symmetric. The process drives $\mathbf { A }$ in the skew-symmetric space so that the learned Cayley $\bar { T } ( \mathbf { A } ^ { ( t ) } )$ $R _ { T ( \mathbf { A } ^ { ( t ) } ) \mathbf { x } } ^ { ( \ell , d ) }$ x to decay quasi-exponentially. We set A° = O(dxd),   
hence $T ( \mathbf { A } ^ { 0 } ) = I$ ， and warm-start by composing it with the orthogonal PCA basis $T ^ { \prime }$ ，which   
projects energy to leading dimensions (Yang et al., 2O25). The initial transform is thus $T ^ { \prime }$ ，and   
subsequent gradient updates of $\mathbf { A }$ adapt the composed orthogonal operator $T ( \mathbf { A } ) T ^ { \prime }$ to the data.

# 5INTEGRATION WITH STATE-OF-THE-ART INDEXES

State-of-the-art ANNS indexes fall into two categories of memory layout: contiguous, which store vectors (or codes) consecutively in memory,and non-contiguous, which scatter vectors across nonconsecutive locations (Han et al., 2023).On contiguous layouts,which exploit spatial locality and SIMD parallelism，we rearrange the contiguous storage to a level-major format to facilitate PANORAMA's level-wise refinement and bulk pruning in cache-efficient fashion. On non-contiguous layouts, PANoRAMA still curtails redundant distance computations, despite the poor locality. Here, we discuss how we integrate PANORAMA in the refinement step of both categories.

# 5.1CONTIGUOUS-LAYOUT INDEXES

L2Flat and IVFFlat. L2Flat (Douze et al., 2O24) (Faiss's naive $k \mathbf { N N }$ implementation） performs a brute-force $k \mathbf { N N }$ search over the entire dataset. IVFFlat (Jégou et al., 2OO8) implements inverted file indexing: it partitions the dataset into $n _ { \mathrm { { i s t } } }$ clusters by $k$ -means and performs a brute-force $k \mathbf { N N }$ over the points falling within the nearest $n _ { \mathrm { p r o b e } }$ clusters to the query point. Nonetheless, their native storage layout does not suit PANORAMA for two reasons:

1. Processor cache locality and prefetching: By PANORAMA refinement, we reload query slices for each vector, preventing stride-based prefetching and causing frequent processor cache misses.

2.Branch misprediction: While processing a single vector, the algorithm makes up to nlevels decisions on whether to prune it,each introducing a branch, which renders control flow irregular, defeats branch predictors,and stalls the instruction pipeline.

To address these concerns, we integrate PANORAMA in Faiss (Douze et al., 2024) with a batched, level-major design,restructuring each cluster's memory layout to support level-wise (i.e., one level at a time) rather than vector-wise refinement. We group vectors into batches and organize each batch in level-major order that generalizes the dimension-major layout of PDX (Kuffo et al., 2025). Each level stores a contiguous group of features for each point in the batch. The algorithm refines distances level-by-level within each batch.At each level, it first computes the distance contributions for all vectors in the batch,and then makes bulk pruning decisions over all vectors.This consolidation of branch checks in $n _ { \mathrm { l e v e l s } }$ synchronized steps regularizes control flow, reduces branch mispredictions,and improves cache utilization (Ailamaki et al.,2Oo1).Figure 3 illustrates the principle.

![](images/f984d0a5bf349c17e2d738564c51c4bf0f4d055b44f44f76b25899d9908c0250.jpg)  
Figure 3: IVFFlat & L2Flat storage.

IVFPQ. (Jégou et al.,2011) combines inverted file indexing with product quantization (PQ) to reduce memory usage. It first assigns a query to acoarse cluster (as in IVFFlat),and then approximates distances within that cluster using PQ-encoded vectors (codes): it divides each $d$ -dimensional vector into $M$ contiguous subvectors of size $d /  M$ ，applies $k$ -means in each subvector space separately to learn $2 ^ { n _ { \mathrm { b i t s } } }$ centroids, and compactly represents each subvector using $n _ { \mathrm { b i t s } }$ bits.However, directly applying the storage layout of Figure 3 to quantization codes introduces an additional challenge:

3. SIMD lane underutilization: When the PQ codes for a given vector are shorter than the SIMD register width, vector-wise processing leaves many lanes idle, underusing compute resources.

Instead of storing PQ codes by vector, we contiguously store code slices of the same quantizer across vectors in a batch as Figure 4 depicts.This layout lets SIMD instructions process lookup-table (LUT) entries for multiple vectors in parallel within the register, fully utilizing compute lanes (Li & Patel, 2013; Feng et al., 2O15),and reduces cache thrashing,as LUT entries of codes for the same query slices remain cache-resident for reuse.We evaluate this effect, along with varying level settings, in Appendix F.

![](images/462e2f4dabbf358f54c91b37a4d907201f98c69c0fa08d32c32eac819bc7bfe3.jpg)  
Figure 4: IVFPQ; codes absorb dimensions.

# 5.2NON-CONTIGUOUS-LAYOUT INDEXES

On index methods that store candidate points in noncontiguous memory,the refinement phase faces a memory-computation tradeof. Fetching candidate vectors incurs frequent processor (L3) cache misses, so the cost of moving data into cache rivals that of arithmetic distance computations, rendering the process memory-bound. Even with SIMD acceleration, poor locality among candidates slows throughput, and by Amdahl's law (1967),enhancing computation alone yields diminishing returns. Lacking a good fix, we do not rearrange the storage layout with these three indexes.

Graph-based (HNsW). HNSW (Malkov & Yashunin, 2O2O) organizes points in a multi-layer graph, reminiscent of a skip list; upper layers provide logarithmic long-range routing while lower layers ensure local connectivity. To navigate this graph eficiently, it prioritizes exploration using a candidate heap and organizes kNN results using a result heap. Unlike other ANNS methods, HNSW conducts no separate verification, as it computes exact distances during traversal. We integrate PANORAMA by modifying how embeddings enter the candidate heap to reduce distance $\frac { \mathsf { L B } ^ { \ell } + \mathsf { U B } ^ { \ell } } { 2 }$ and

Tree-based (Annoy). Tree-based methods recursively partition the vector space into leaf nodes, each containing candidate vectors. Annoy (Bernhardsson,2Ol3)constructs these partitions by splitting along hyperplanes defined by pairs of randomly selected vectors,and repeats this process to build a random forest of $n _ { \mathrm { t r e e s } }$ trees. At query time,it traverses each tree down to the nearest leaf and sends the candidate vectors from al visited leaves to verification, where we integrate PANORAMA.

Locality-based (MRPT). MRPT (Multiple Random Projection Trees） (Hyvonen et al., 2016; Hyvonen et al.,2016; Jäasaari et al.,2O19a) also uses a forest of random trees, like Annoy does, yet splits via median thresholds on random linear projections rather than via hyperplanes. This design ties MRPT to Johnson-Lindenstrauss guarantees,enabling recall tuning,and incorporates voting across trees to filter candidates. We integrate PANORAMA as-is in the refinement phase.

# 5.3MEMORY FOOTPRINT

To apply the Cauchy-Schwarz bound approximation, we precompute tail energies of transformed vectors at each level,with an $O ( n L )$ memory overhead,where $n$ is the dataset size and $L$ the number of levels.For IVFPQ using $M = 4 8 0$ subquantizers on GIST, $n _ { \mathrm { b i t s } } = 8$ bits per code,and $L = 8$ levels at $90 \%$ recall, this results in a $7 . 5 \%$ additional storage overhead. On methods that do not quantize vectors, the overhead is even smaller (e.g., $0 . 9 4 \%$ in IVFFlat). In addition, we incur a small fixed-size overhead to store partial distances in a batch, which we set to fit within Ll cache.

# 6EXPERIMENTAL RESULTS

We comprehensively evaluate PANORAMA's performance in terms of the speedup it yields when integrated into existing ANNS methods,across multiple datasets.2

Datasets. Table 1 lists our datasets. CIFAR-10 contains flattened natural-image pixel intensities. FashionMNIST provides representations of grayscale clothing items.GIST comprises natural scene descriptors.SIFT provides scale-invariant feature transform descriptors extracted from images. DBpedia-Ada (Ada) holds OpenAI's text-embedding-ada-Oo2 representations of DBpedia entities,a widely used semantic-search embedding model,and DBpedia-Large (Large) lists higher-dimensional embeddings of the same corpus by text-embedding-3-large.

Table 1: Data extents.   

<table><tr><td>Data</td><td>n</td><td>d</td></tr><tr><td>SIFT</td><td>10M/100M</td><td>128</td></tr><tr><td>GIST</td><td>1M</td><td>960</td></tr><tr><td>FashionMNIST</td><td>60K</td><td>784</td></tr><tr><td>Ada</td><td>1M</td><td>1536</td></tr><tr><td>Large</td><td>1M</td><td>3072</td></tr><tr><td>CIFAR-10</td><td>50K</td><td>3072</td></tr></table>

Methodology.First, we measure PANORAMA's gains over Faiss’brute-force $k \mathbf { N N }$ implementation to assess the effect of energy-compacting transforms. Second, we gauge the gain of integrating PANORAMA into state-of-the-art ANNS methods. Third, we assess robustness under out-ofdistribution queries of varying dificulty. For each measurement, we run 5 repetitions of 10o 10NN queries randomly selected from the benchmark query set and report averages.

# 6.1FUNDAMENTAL PERFORMANCE ON LINEAR SCAN

Here,we measure speedups on a naive linear scan (Faiss' L2Flat) to assess our approach without integration complexities. We compute speedup by running 5 runs of 10O queries, averaging queries per second (QPS) across runs.Figure 5 plots our results, with speedup defined as $\mathrm { Q P S _ { P a n o r a m a } / Q P S _ { L 2 F l a t } }$ .Each bar shows a speedup value and whiskers indicate standard deviations,estimated by the delta method,assuming independence between the two QPS values: $\sigma _ { S } \approx \sqrt { \sigma _ { X } ^ { 2 } / \mu _ { Y } ^ { 2 } + \mu _ { X } ^ { 2 } \sigma _ { Y } ^ { 2 } / \mu _ { Y } ^ { 4 } }$ ，where $\mu _ { X } , \sigma _ { X }$ are the mean and standard deviation of $\mathrm { Q P S } _ { \mathrm { P a n o r a m a } }$ ,and $\mu _ { Y } , \sigma _ { Y }$ of $\mathrm { Q P S } _ { \mathrm { L 2 F l a t } }$ .Each bar is capped with the value of $\mu _ { X } / \mu _ { Y }$ . PANORAMA achieves substantial acceleration across datasets,while the high-dimensional CIFAR-1O data achieves the highest speedup, validating our predictions.

![](images/397a9f199b021ef0eb8695b8cafd5b0512558dc8bb8c5a3752f5c4020413034f.jpg)  
Figure 5: Speedups on kNN.

# 6.2ENERGY COMPACTION

Table 2: Processed features.   

<table><tr><td>Dataset</td><td>Expected (%)</td><td>Empirical (%)</td></tr><tr><td>Large</td><td>8.96</td><td>8.22</td></tr><tr><td>Ada</td><td>8.06</td><td>8.21</td></tr><tr><td>FashionMNIST</td><td>4.54</td><td>6.75</td></tr><tr><td>GIST</td><td>5.78</td><td>4.28</td></tr><tr><td>CIFAR-10</td><td>3.12</td><td>3.71</td></tr><tr><td>SIFT</td><td>12.54</td><td>12.76</td></tr></table>

We gauge the energy compaction by our learned transforms $T \in { \mathcal { O } } ( d )$ , via normalized tail energies R(l,d)= R(e,d) Rd. An apt transform should gather energy in the leading dimensions, causing $\bar { R } ^ { ( \ell , d ) }$

![](images/c51b3db3f4285f88a1a5967e64eaf0bd1005300f5b6dee147502eaa36ee250ae.jpg)  
Figure 6: Energy compaction.

to decay rapidly.Figure 6 traces this decay across datasets for $p \ = \ \begin{array} { l } { \underline { { \ell } } } \\ { d } \end{array} \ \in$ $\{ 0 , 0 . 1 , 0 . 2 5 , 0 . 5 \}$ .A steep decline indicates energy compaction aligned with the target.“ We also estimate the compaction parameter $\alpha$ from measured energies for $p = \textstyle { \frac { \ell } { d } } \in \{ 0 . 1 , 0 . 2 5 , 0 . 5 \}$ as $\begin{array} { r } { \alpha _ { p } = - \frac { 1 } { p } \ln \frac { R ^ { ( p d , d ) } ) } { R ^ { ( 0 , d ) } } } \end{array}$ and average across $p$ for stability. By Theorem 2,the expected ratio of features processed before pruning a candidate is $\mathbb { E } [ d _ { i } ] \propto d / \alpha$ . Table 2 reports expected ratios (in $\%$ ）alongside average empirical values. Their close match indicates that PANORAMA achieves the expected $\alpha$ -fold speedup,hence $C \approx 1$ in Theorem 2.

# 6.3INTEGRATION WITH ANN INDICES

We now assess PANORAMA's integration with state-of-the-art ANN indices, computing speedups via 5runs of 1OO queries.Figure 7 presents speedup results for all datasets,defined as $\frac { \mathrm { Q P S } _ { \mathrm { I n d e x + P a n o r a m a } } } { \mathrm { Q P S } _ { \mathrm { I n d e x } } }$ ，vs. recall. We collect recall-QPS pairs via a hyperparameter scan on the base index as shown in Figure 17. IVFFlat exhibits dramatic speedups of $2 { - } 4 0 \times$ , thanks to contiguous memory access. IVFPQ shows speedups of $2 { - } 3 0 \times$ ,particularly at high recall levels where large candidate sets admit effective pruning. As product quantization does not preserve norms, the recall of the PANORAMA IVFPQ version applying PQ on transformed data,differs from that of the standard version for the same seting. We thus interpolate recall-QPS curves to compute speedup as the QPS ratio at each recall value. HNsW presents improvements of up to $4 \times$ ,despite the complexity of graph traversal. Tree-based Annoy and MRPT spend les time in verification compared to IVFPQ and IVFFlat as shown in Figure 2, thus offer fewer components for PANORAMA to speed up—yet we still observe gains of up to $6 \times$

![](images/71c26f48a80f0ddef47d66400678c5a9fb0eb11745fcc255dab06a2dfa53dd52.jpg)  
Kecal Figure 7: Speedup Vs. recall. SIFT-10M data with HNSW, Annoy, MRPT; SIFT-100M with others.

# 6.4CONTRIBUTION OF THE TRANSFORM

Here,we study the individual contributions of PANORAMA's bounding methodology and of its learned orthogonal transforms. We apply PANORAMA with all ANNS indices on the GIST1M dataset in two regimes: (i) on original data vectors,and (ii) on vectors transformed by the learned energy-compacting transform. Figure 8 presents the results, plotting speedup over the baseline index vs. recall. While PANORAMA on original data accelerates search thanks to partial-product pruning, the transform consistently boosts these gains,as it tightens the Cauchy-Schwarz bounds.

![](images/c0229c05683f3dbfe6fe34bb834ea561896e0372e58834f9778c52396a1813c3.jpg)

# 6.5OUT-OF-DISTRIBUTION QUERY ANALYSIS

![](images/d7349c279ec05630485c60b9fc15eaf2be2a390f4bb948dac260daf9ae4cc96e.jpg)  
Figure 8: Speedup on GIST1M: PANORAMA on original vs. transformed data.   
Figure 9: Query hardness.

To assessPANORAMA's robustness， we use synthetic out-ofdistribution (OOD) queries crafted by Hephaestus (Ceccarello et al., 2025)，which controls query difficulty by Relative Contrast (RC)— the ratio between the average distance from a query q to points in dataset $S$ and the distance to its $k ^ { \mathrm { t h } }$ nearest neighbor: $R C _ { k } ( { \bf q } ) \ =$ $\begin{array} { r } { \frac { 1 } { | S | } \sum _ { x \in S } d ( \mathbf { q } , x ) \Big / d ( \mathbf { q } , x ^ { ( k ) } ) } \end{array}$ .Smaller RC values indicate harder queries. We experiment with OOD queries of RC values of 1 (easy), 2 (medium), and 3 (hard) on the GIST1M dataset, computed with respect to 1O nearest neighbors. Figure 9 plots PANORAMA's performance under OOD queries. Although OOD queries may exhibit poor energy compaction by the learned transform, PANORAMA atains robust speedup thanks to the structure of Cauchy-Schwarz bounds.By Equation (2),pruning relies on the product of database and query energies, $R _ { T ( \mathbf { x } ) }$ and $R _ { T ( \mathbf { q } ) }$ .Well-compacted database vectors couteract poor query compaction, so the geometric mean $\sqrt { R _ { T ( \mathbf { q } ) } R _ { T ( \mathbf { x } ) } }$ bound remains effective. Theorem 8 supports this conclusion. Observed speedups thus align with theory across RC levels.

# 6.6ADDITIONAL EXPERIMENTS

We conduct comprehensive ablation studies to further validate PANoRAMA's design choices and system implementation. Our ablations demonstrate that PANoRAMA's adaptive pruning significantly outperforms naive dimension truncation approaches,which suffer substantial recall degradation. We compare using PCA and DCT methods against learned Cayley transforms. Systematic analysis reveals that PANORAMA's performance scales favorably and as expected with dataset size, dimensionality and $k$ . We identify optimal configurations for the number of refinement levels and show that measured speedups align with expected performance from our system optimizations. Complete experimental details are provided in Appendix F.

# 7CONCLUSION

We proposed PANORAMA,a theoretically justified fast-track technique for the refinement phase in production ANNS systems, leveraging a data-adaptive learned orthogonal transform that compacts signal energy in the leading dimensions and a bounding scheme that enables candidate pruning with partial distance computations. We integrate PANoRAMA into contiguous-layout and noncontiguous-layout ANNS indexes,crafting tailored memory layouts for the former that allow full SIMD and cache utilization. Our experiments demonstrate PANORAMA to be viable and effective, scalable to millions of vectors,and robust under challenging out-of-distribution queries,attaining consistent speedups while maintaining search quality.

# 8REPRODUCIBILITY STATEMENT

To ensure reproducibility, we provide several resources alongside this paper. Our source code and implementations are publicly available at github.com/fastrack-nn/panorama, including scripts for integrating PANORAMA with baseline indexes and reproducing all results. Appendix A contains full proofs of all theoretical results and assumptions, ensuring clarity in our claims.Appendix B documents the complete experimental setup, including hardware/software specifications, datasets, parameter grids,and training details. Additional implementation notes, integration details,and extended ablations are provided in Appendices C-F.

# REFERENCES

P.-A. Absil,R. Mahony,and R. Sepulchre. Optimization Algorithms on Matrix Manifolds. Princeton University Press, USA,2007. ISBN 0691132984.

Anastassia Ailamaki, David J. DeWitt, Mark D.Hill,and Marios Skounakis. Weaving relations for cache performance. In Proceedings of the 27th International Conference on Very Large Data Bases,VLDB '01, pp.169-180, San Francisco, CA, USA, 2001. Morgan Kaufmann Publishers Inc. ISBN 1558608044.

Stephen F Altschul, Warren Gish, Webb Miller, Eugene W Myers,and David JLipman. Basic local alignment search tool. Journal of molecular biology,215(3):403-410,1990.

Gene M. Amdahl. Validity of the single processor approach to achieving large scale computing capabilities. InAFIPS '67 (Spring): Proceedings of the April 18-20,1967, Spring Joint Computer Conference,pp.483-485,New York,NY, USA,1967.AssociationforComputing achinery. ISBN 9781450378956.

Alexandr Andoni and Piotr Indyk. Near-optimal hashing algorithms for approximate nearest neighbor in high dimensions. In Proceedings of the 47th Annual IEEE Symposium on Foundations of Computer Science (FOCS), pp. 459-468.IEEE,2006.

Martin Aumuller, Erik Bernhardsson, and Alexander Faithfull. Ann-benchmarks: A benchmarking tool for approximate nearest neighbor algorithms. Information Systems, 87:101374, 2020. doi: 10.1016/j.is.2019.02.006.

Artem Babenko and Victor Lempitsky. Efficient indexing of billion-scale datasets of deep descriptors. In Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition (CVPR), pp.2055-2063,2016.

Jon Louis Bentley. Multidimensional binary search trees used for associative searching. Communications of the ACM, 18(9):509-517,1975.

Erik Bernhardsson. Annoy: Approximate nearest neighbors oh yeah, 2013. URL https : // github.com/spotify/annoy.

Matteo Ceccarello, Alexandra Levchenko,Ioana Ileana,and Themis Palpanas. Evaluating and generating query workloads for high dimensional vector similarity search. In Proceedings of the 29th ACM SIGKDD Conference on Knowledge Discovery and Data Mining, KDD'25, pp.5299-5310, New York, NY, USA,2025. Association for Computing Machinery. ISBN 9798400714542. doi: 10.1145/3711896.3737383. URL https: //doi.org/10 .1145/3711896.3737383.

J.W. Cooley and J. W. Tukey.An algorithm for the machine calculation of complex fourier series. Mathematics of Computation,19(90):297-301，1965.doi: 10.1090/ S0025-5718-1965-0178586-1. URL https://web.stanford.edu/class/cme324/ classics/cooley-tukey.pdf.

Matthijs Douze,Alexandr Guzhva，Chengqi Deng， Jeff Johnson，Gergely Szilvasy，PierreEmmanuel Mazaré,Maria Lomeli, Lucas Hosseini, and Hervé Jégou. The faiss library. arXiv preprint arXiv:2401.08281,2024.

Alan Edelman, T.A. Arias,and Steven T. Smith. The geometry of algorithms with orthogonality constraints,1998.URL https://arxiv.org/abs/physics/9806030.

Ziqiang Feng, Eric Lo, Ben Kao,and Wenjian Xu. Byteslice: Pushing the envelop of main memory data processing with a new storage layout. In Proceedings of the 2O15 ACM SIGMOD International Conference on Management of Data, SIGMOD'15, pp. 31-46, New York, NY, USA,2015. Association for Computing Machinery. ISBN 9781450327589. doi: 10.1145/2723372.2747642. URLhttps://doi.0rg/10.1145/2723372.2747642.

Jianyang Gao and Cheng Long. High-dimensional approximate nearest neighbor search: with reliable and effcient distance comparison operations.Proc. ACM Manag. Data,1(2):137:1-137:27, 2023.

Yunfan Gao, Yun Xiong, Xinyu Gao, Kangxiang Jia, Jinliu Pan, Yuxi Bi, Yi Dai, Jiawei Sun, and Haofen Wang. Retrieval-augmented generation for large language models: A survey. arXiv preprint arXiv:2312.10997,2023.

W. Givens. Computation of plane unitary rotations transforming a general matrix to triangular form. Journal of the Society for Industrial and Applied Mathematics,6(1):26-50,1958. doi: 10.1137/0106004.URL https://epubs.siam.org/doi/10.1137/0106004.

Ruiqi Guo, Philip Sun, Erik Lindgren, Quan Geng, David Simcha, Felix Chern, and Sanjiv Kumar. Accelerating large-scale inference with anisotropic vector quantization. Proceedings of the 37th International Conference on Machine Learning (ICML), pp. 3887-3896, 2020.

A.Hadjidimos and M. Tzoumas. On the optimal complex extrapolation of the complex Cayley transform. Linear Algebra and its Applications, 430(2):619-632, 2009. ISSN 0024-3795. doi: https:/doi.org/10.1016/j.laa.2008.08.010.URL https://www.sciencedirect . com/science/article/pii/S0024379508003959.

Brian C. Hall. Lie Groups, Lie Algebras, and Representations, pp. 333-366. Springer New York, New York,NY,2013. ISBN 978-1-4614-7116-5. doi: 10.1007/978-1-4614-7116-5_16. URL https://doi.0rg/10.1007/978-1-4614-7116-5_16.

Yikun Han, Chunjiang Liu, and Pengfei Wang.A comprehensive survey on vector database: Storage and retrieval technique,challnge.ArXiv, abs/2310.11703,2023.URL https : //api.semanticscholar.org/CorpusID:264289073.

Charles R. Harris,K. Jarrod Millman， Stefan J.van der Walt,Ralf Gommers,Pauli Virtanen, David Cournapeau,Eric Wieser, Julian Taylor, Sebastian Berg，Nathaniel J.Smith,Robert Kern,Mati Picus,Stephan Hoyer, Marten H. van Kerkwijk,Matthew Brett，Allan Haldane, Jaime Fernandez del Rio,Mark Wiebe,Pearu Peterson, Pierre Gérard-Marchant, Kevin Sheppard, Tyler Reddy,Warren Weckesser, Hameer Abbasi, Christoph Gohlke,and Travis E. Oliphant. Array programming with NumPy. Nature, 585(7825):357-362, September 2020. doi: 10.1038/ s41586-020-2649-2. URL https://doi.org/10.1038/s41586-020-2649-2.

Roger A. Horn and Charles R. Johnson. Matrix Analysis. Cambridge University Press, 2nd edition, 2012.

A. S.Householder. Unitary triangularization of a nonsymmetric matrix. Journal of the Association for Computing Machinery, 5(4):339-342, 1958. doi: 10.1145/320941.320947. URL https : //doi.0rg/10.1145/320941.320947.

Ville Hyvonen, Temu Pitkänen, Sotiris Tasoulis, Elias Jäasaari, Risto Tuomainen, Liang Wang, Jukka Corander, and Teemu Roos. Fast nearest neighbor search through sparse random projections and voting. In Big Data (Big Data),2O16 IEEE International Conference on, pp.881-888. IEEE,2016.

Ville Hyvonen, Teemu Pitkänen, Sasu Tarkoma,Elias Jaäsaari, Teemu Roos,and Alex Yao. MRPT: Multi-resolution hashing for proximity search. https : //github .com/vioshyvo/mrpt, 2016.

Piotr Indyk and Rajeev Motwani. Approximate nearest neighbors: towards removing the curse of dimensionality. In Proceedings of the Thirtieth Annual ACM Symposium on Theory of Computing (STOC), pp. 604-613.ACM, 1998.

Elias Jaasaari, Ville Hyvonen,and Teemu Roos. Efficient autotuning of hyperparameters in approximate nearest neighbor search. In Pacific-Asia Conference on Knowledge Discovery and Data Mining, pp. In press. Springer, 2019a.

Elias Jäasaari, Ville Hyvonen, and Teemu Roos. Efficient autotuning of hyperparameters in approximate nearest neighbor search. In Pacific-Asia Conference on Knowledge Discovery and Data Mining, pp. In press. Springer, 2019b.

H.Jégou,M. Douze,and C. Schmid. Product quantization for nearest neighbor search． IEEE Transactions on Pattern Analysis and Machine Intelligence,33(1):117-128,2011.

Hervé Jégou, Matthijs Douze,and Cordelia Schmid. Hamming embedding and weak geometric consistency for large scale image search. In European Conference on Computer Vision (ECCV), pp.304-317. Springer, 2008.

Shrikant Kashyap and Panagiotis Karras. Scalable kNN search on vertically stored time series. In Proceedings of the 17th ACM SIGKDD International Conference on Knowledge Discovery and Data Mining, pp. 1334-1342, 2011. ISBN 9781450308137. URL https: //doi.org/10. 1145/2020408.2020607.

Yehuda Koren,Robert Bell,and Chris Volinsky. Matrix factorization techniques for recommender systems. Computer,42(8):30-37,2009.

Leonardo X. Kuffo,Elena Krippner,and Peter A. Boncz. PDX: A data layout for vector similarity search. Proc. ACM Manag. Data,3(3):196:1-196:26,2025. doi: 10.1145/3725333. URL https://doi.org/10.1145/3725333.

Patrick Lewis, Ethan Perez, Aleksandra Piktus, Fabio Petroni, Vladimir Karpukhin, Naman Goyal, Heinrich Küttler,Mike Lewis, Wen-tau Yih,Tim Rocktäschel, et al. Retrieval-augmented generation for knowledge-intensive nlp tasks. Advances in neural information processing systems, 33: 9459-9474, 2020.

Yinan Li and Jignesh M. Patel. Bitweaving: fast scans for main memory data processing. In Proceedings of the 2013 ACM SIGMOD International Conference on Management of Data, SIGMOD‘13,pp. 289-300, New York, NY, USA,2013. Association for Computing Machinery. ISBN 9781450320375. doi: 10.1145/2463676.2465322. URL https : //doi .org/10. 1145/2463676.2465322.

David G Lowe. Distinctive image features from scale-invariant keypoints. International journal of computer vision,60(2):91-110,2004.

Qin Lv, William Josephson, Zhe Wang,Moses Charikar, and Kai Li. Multi-probe LSH: efficient indexing for high-dimensional similarity search. In Proceedings of the 33rd International Conference on Very Large Data Bases (VLDB), pp. 950-961. VLDB Endowment, 2007.

Yu A.Malkov and Dmitry A. Yashunin. Efficient and robust approximate nearest neighbor search using hierarchical navigable small world graphs. IEEE Transactions on Pattern Analysis and Machine Intelligence,42(4):824-836,2020.

Stéphane Mallat. A Wavelet Tour of Signal Processing. Academic Press,2nd edition,1999.

PascalMassart. Thetightconstantinthedvoretzky-kiefer-wolfowitzinequality. TheAnnalsofProbability, 18(3):1269-1283，July1990. doi: 10.1214/aop/1176990746. URL https://projecteuclid. org/journals/annals-of-probability/volume-18/issue-3/ The-Tight-Constant-in-the-Dvoretzky-Kiefer-Wolfowitz-Inequality/ 10.1214/aop/1176990746.full.

Marius Muja and David G.Lowe. Scalable nearest neighbor algorithms for high dimensional data. IEEE Transactions on Pattern Analysis and Machine Intelligence,36(11):2227-2240,2014.

Arvind Neelakantan, Tao Xu, Raul Puri, Alec Radford, Jesse Michael Han, Jerry Tworek, Qiming Yuan, Nikolas Tezak, Jong Wook Kim, Chris Hallacy, Johannes Heidecke,Pranav Shyam, Boris Power, Tyna Eloundou Nekoul, Girish Sastry, Gretchen Krueger, David Schnurr,Felipe Petroski Such,Kenny Hsu,Madeleine Thompson, Tabarak Khan,Toki Sherbakov, Joanne Jang,Peter Welinder, and Lilian Weng. Text and code embeddings by contrastive pre-training, 2O22. URL https://arxiv.org/abs/2201.10005.

Suhas Jayaram Subramanya, Fnu Devvrit, Harsha Vardhan Simhadri, Ravishankar Krishnaswamy, and Rohan Kadekodi. Diskann: Fast accurate billion-point nearest neighbor search on a single node. In Advances in Neural Information Processing Systems (NeurIPS), volume 32, 2019.

Dimitrios Thomakos. Smoothing non-stationary time series using the Discrete Cosine Transform. Journal of Systems Science and Complexity,29,08 2015. doi: 10.1007/s11424-015-4071-7.

# APPENDIX LAYOUT

This appendix complements the main text with detailed proofs,algorithmic insights,implementation notes,and extended experiments.

1.Proofs (Appendix A): Full,formal proofs for all theorems,lemmas,and claims stated in the main text. Each proof is cross-referenced to the corresponding result in the paper, and we include any auxiliary lemmas and technical bounds used in the derivations.   
2. Experimental setup (Appendix B): Complete experimental details necessary for reproducibility, including dataset descriptions, evaluation metrics,hyperparameter grids, indexing parameters (e.g., $n _ { \mathrm { { l i s t } } }$ ， $n _ { \mathrm { p r o b e } }$ ， $e f _ { \mathrm { s e a r c h } } )$ ,hardware/software environment.   
3.Panorama details (Appendix C): Expanded algorithmic description of PANORAMA, with full pseudocode for all variants, implementation notes, complexity discussion, and additional examples illustrating batching,and level-major ordering.   
4.HNSW (Appendix D): Non-trivial integration of PANORAMA with HNSW. Contains the HNSW+Panorama pseudocode, correctness remarks, and heuristics for beam ordering with heterogeneous (partial/exact) distance estimates.   
5.Systems details (Appendix E): Low-level implementation details pertaining to IVFPQ. This section documents our PANoRAMA integration into Faiss, detailing buffering and scanning strategies for efficient SIMD vectorization.   
6.Ablations (Appendix F): Extended ablation studies and plots not included in the main body, including per-dataset and per-index breakdowns, PCA/DCT/Cayley comparisons, scaling with $N , d , k$ ,and comparisons between expected and measured speedups.

# ATHEORETICAL ANALYSIS OF PANORAMA'S COMPLEXITY

This appendix derives the expected computational complexity of the Panorama algorithm. The proof proceeds in six steps,starting with a statistical model of the candidate distances and culminating in a final, simplified complexity expression.

Notation. Throughout this analysis, we use asymptotic equivalence notation: for functions $f ( n )$ and $g ( n )$ , we write $f ( n ) \sim c \cdot { \dot { g ( n ) } }$ if $\mathrm { l i m } _ { n \to \infty } \stackrel { \cdot } { f ( n ) } / g ( n \stackrel { . } { ) } = c$ for some constant $c > 0$ .When $c = 1$ ,we simply write $f ( n ) \sim g ( n )$

# SETUP AND ASSUMPTIONS

Our analysis relies on the following assumptions:

$T$ $\mathbf { v }$ $\begin{array} { r } { R _ { \mathbf { v } } ^ { ( m , d ) } : = \sum _ { j = m + 1 } ^ { d } T _ { j } ( \mathbf { v } ) ^ { 2 } \approx \| \mathbf { v } \| ^ { 2 } e ^ { - \alpha m / d } } \end{array}$ where $\alpha$ is the energy compaction parameter.

· (A2) Level Structure: We use single-dimension levels for the finest pruning granularity: $m _ { \ell } = \ell$ · (A3) Gaussian Approximation of Distance Distribution: The squared Euclidean distances, $\lVert \mathbf { q } -$ $\mathbf { x } _ { i } \Vert ^ { 2 }$ ,are modeled using a Gaussian approximation (e.g., via the central limit theorem for large $d$ ）with mean $\mu$ and standard deviation $\sigma$ . The exact distribution is chi-square-like; we use the Gaussian for tractability.

· (A4) Bounded Norms: Vector norms are uniformly bounded: $\| \mathbf { q } \| , \| \mathbf { x } _ { i } \| \leq R$ for some constant $R$

# STEP 1:MARGIN DEFINITION FROM SAMPLED-SET STATISTICS

The Panorama algorithm(Algorithm 4) maintains a pruning threshold $\tau$ ,which is the squared distance of the $k$ -th nearest neighbor found so far. For analytical tractability,we model $\tau _ { i }$ as the $k$ -th order statistic among $i$ i.i.d. draws from the distance distribution,acknowledging that the algorithm's threshold arises from a mixture of exact and pruned candidates. We begin by deriving a high-probability bound on this threshold after $i$ candidates have been processed.

![](images/00adc578fde9f5077057efa8d01bf4fa9760b205bc92b12cc62b9efe888432db.jpg)  
Figure 1O: Visualization under a Gaussan approximation of the distance distribution. The curve represents the probability density of squared distances from a query q. $\mu$ is the mean distance.For a full dataset of $N$ points, the $k$ -NN distance threshold is $K _ { N }$ ,enclosing $k$ points. When we take a smaller candidate sample of size $i < N$ , the expected $k$ -NN threshold, $K _ { i }$ , is larger than $K _ { N }$ .The margin for a new candidate is its expected distance $( \mu )$ minus this sampled threshold $K _ { i }$

Theorem 4 (High-probability bound for the sampled $\mathbf { k }$ -NN threshold via DKW). Let the squared distances be i.i.d. random variables with CDF $F ( r )$ . For any $\varepsilon \in ( 0 , 1 )$ ，with probability at least $1 - 2 e ^ { - 2 i \varepsilon ^ { 2 } }$ by the Dvoretzky-Kiefer-Wolfowitz inequality Wikipedia contributors (2025); Massart (1990), the $k$ -th order statistic $\tau _ { i }$ satisfies

$$
\begin{array} { r } { F ^ { - 1 } \Big ( \operatorname* { m a x } \Big \{ 0 , \frac { k } { i + 1 } - \varepsilon \Big \} \Big ) \ \leq \ \tau _ { i } \ \leq \ F ^ { - 1 } \Big ( \operatorname* { m i n } \Big \{ 1 , \frac { k } { i + 1 } + \varepsilon \Big \} \Big ) . } \end{array}
$$

Under the Gaussian assumption (A3), where $\begin{array} { r } { F ( r ) = \Phi \bigl ( \frac { r - \mu } { \sigma } \bigr ) } \end{array}$ , this implies in particular the upper bound

$$
\begin{array} { r } { \tau _ { i } \ \leq \ \mu + \sigma \Phi ^ { - 1 } \Bigl ( \frac { k } { i + 1 } + \varepsilon \Bigr ) \quad w i t h \ p r o b a b i l i t y \ a t \ l e a s t \ 1 - 2 e ^ { - 2 i \varepsilon ^ { 2 } } . } \end{array}
$$

Proof. Let $F _ { i }$ be the empirical CDF of the first $i$ distances.The DKW inequality gives $\operatorname* { P r } \big ( \operatorname* { s u p } _ { t } | F _ { i } ( t ) - F ( t ) | > \varepsilon \big ) \leq 2 e ^ { - 2 i \varepsilon ^ { 2 } }$ Massart (1990). On the event $\operatorname* { s u p } _ { t } | F _ { i } - F | \leq \varepsilon$ we have for all $t$ ： $F ( t ) - \varepsilon \leq F _ { i } ( t ) \leq F ( t ) + \varepsilon$ Monotonicity of $F ^ { - 1 }$ implies $F ^ { - 1 } ( u - \varepsilon ) \leq F _ { i } ^ { - 1 } ( u ) \leq$ ${ { F } ^ { - 1 } } ( u + \varepsilon )$ for all $u \in ( 0 , 1 )$ . Taking $u = k / ( i + 1 )$ and recalling that $\tau _ { i } = F _ { i } ^ { - 1 } ( k / ( i + 1 ) )$ yields the two-sided bound. Under (A3), $F ^ { - 1 } ( p ) = \mu + \sigma \Phi ^ { - 1 } ( p )$ , which gives the Gaussian form. □ A new candidate is tested against this threshold $\tau _ { i }$ . Its expected squared distance is $\mu$ .This allows us to define a high-probability margin.

Definition 1 (High-probability Margin $\Delta _ { i }$ ). Fix a choice $\varepsilon _ { i } \in ( 0 , 1 )$ .Define the sampled $k$ -NN threshold upper bound

$$
\begin{array} { r } { K _ { i } : = F ^ { - 1 } \Big ( \frac { k } { i + 1 } + \varepsilon _ { i } \Big ) = \mu + \sigma \Phi ^ { - 1 } \Big ( \frac { k } { i + 1 } + \varepsilon _ { i } \Big ) . } \end{array}
$$

Then define the margin as

$$
\begin{array} { r } { \Delta _ { i } : = \mu - K _ { i } = - \sigma \Phi ^ { - 1 } \Bigl ( \frac { k } { i + 1 } + \varepsilon _ { i } \Bigr ) . } \end{array}
$$

margin at least With probability at least $\Delta _ { i }$ Forisig $1 - 2 e ^ { - 2 i \varepsilon _ { i } ^ { 2 } }$ ， a typical candidate with expected squared distance $\frac { k } { i + 1 } + \varepsilon _ { i } < 0 . 5$ $\mu$ has (equivalently, $\Phi ^ { - 1 } ( \cdot ) < 0 ,$ ). In what follows in this section, interpret $\Delta _ { i }$ as this high-probability margin so that subsequent bounds inherit the same probability guarantee (optionally uniformly over $i$ via a union bound).

Uniform high-probability schedule.Fix a target failure probability $\delta \in ( 0 , 1 )$ and define

$$
\begin{array} { r } { \varepsilon _ { i } : = \sqrt { \frac { 1 } { 2 i } \log \left( \frac { 2 N ^ { \prime } } { \delta } \right) } . } \end{array}
$$

By a union bound over $i \in \{ k + 1 , \ldots , N ^ { \prime } \}$ , the event

$$
\mathcal { E } _ { \delta } : = \bigcap _ { i = k + 1 } ^ { N ^ { \prime } } \Big \{ \tau _ { i } \leq \mu + \sigma \Phi ^ { - 1 } \Big ( \frac { k } { i + 1 } + \varepsilon _ { i } \Big ) \Big \}
$$

holds with probability at least $1 - \delta$ . All bounds below are stated on ${ \mathcal { E } } _ { \delta }$

STEP 2:PRUNING DIMENSION FOR A SINGLE CANDIDATE

A candidate $\mathbf { x } _ { j }$ is pruned at dimension $m$ if its lower bound exceeds the threshold $\tau$ .A sufficient condition for pruning is when the worst-case error of the lower bound is smaller than the margin (for the candidate processed at step $i$ )：

$$
\| \mathbf { q } - \mathbf { x } _ { j } \| ^ { 2 } - \mathbf { L B } ^ { ( m ) } ( \mathbf { q } , \mathbf { x } _ { j } ) < \Delta _ { i }
$$

From the lower bound definition in Equation (3),the error term on the left is bounded by four times the geometric mean of the tail energies in the worst case. Applying assumption (A1) for energy decay and (A4) for bounded norms, we get:

$$
\begin{array} { r } { 4 \sqrt { R _ { \mathbf { q } } ^ { ( m , d ) } R _ { \mathbf { x } _ { j } } ^ { ( m , d ) } } \leq 4 \sqrt { ( \| \mathbf { q } \| ^ { 2 } e ^ { - \alpha m / d } ) ( \| \mathbf { x } _ { j } \| ^ { 2 } e ^ { - \alpha m / d } ) } \leq C _ { 0 } e ^ { - \alpha m / d } } \end{array}
$$

Here and henceforth, let $C _ { 0 } : = 4 R ^ { 2 }$ . The pruning condition thus becomes:

$$
\left. C _ { 0 } e ^ { - \alpha m / d } < \Delta _ { i } \right.
$$

We now solve for $m$ , which we denote the pruning dimension $d _ { j }$ ：

$$
e ^ { - \alpha d _ { j } / d } < \frac { \Delta _ { i } } { C _ { 0 } }
$$

$$
- \frac { \alpha d _ { j } } { d } < \log \left( \frac { \Delta _ { i } } { C _ { 0 } } \right)
$$

$$
\frac { \alpha d _ { j } } { d } > - \log \left( \frac { \Delta _ { i } } { C _ { 0 } } \right) = \log \left( \frac { C _ { 0 } } { \Delta _ { i } } \right)
$$

$$
d _ { j } > \frac { d } { \alpha } \log \left( \frac { C _ { 0 } } { \Delta _ { i } } \right)
$$

Theorem 5 (Pruning dimension $d _ { i }$ ). The expected number of dimensions $d _ { i }$ processed for a candidate at step $i$ is approximately:

$$
d _ { i } \approx \frac { d } { \alpha } \left[ \log \left( \frac { C _ { 0 } } { \Delta _ { i } } \right) \right] _ { + }
$$

where $C _ { 0 } = 4 R ^ { 2 }$ encapsulates the norm-dependent terms and $[ x ] _ { + } : = \operatorname* { m a x } \{ 0 , x \}$

STEP 3:TOTAL COMPUTATIONAL COMPLEXITY

The total computational cost of Panorama is dominated by the sum of the pruning dimensions for all $N ^ { \prime }$ candidates in the candidate set $\mathcal { C }$ .Define the first index at which the high-probability margin becomes positive as

$$
\begin{array} { r } { i _ { 0 } : = \operatorname* { m i n } \left\{ i \geq k + 1 : \frac { k } { i + 1 } + \varepsilon _ { i } < \frac { 1 } { 2 } \right\} . } \end{array}
$$

Then

$$
\mathrm { C o s t } = \sum _ { i = k + 1 } ^ { N ^ { \prime } } d _ { i } \approx \sum _ { i = \operatorname* { m a x } \{ i _ { 0 } , k + 1 \} } ^ { N ^ { \prime } } \frac { d } { \alpha } \left[ \log \left( \frac { C _ { 0 } } { \Delta _ { i } } \right) \right] _ { + }
$$

Let $I _ { C _ { 0 } } : = \{ i \in \{ \operatorname* { m a x } \{ i _ { 0 } , k + 1 \} , \dots , N ^ { \prime } \} : \Delta _ { i } \leq C _ { 0 } \}$ Denote by $N _ { C _ { 0 } } ^ { \prime } : = \operatorname* { m a x } I _ { C _ { 0 } }$ the largest contributing index.Then

$$
\begin{array} { l } { { \displaystyle \sum _ { i = k + 1 } ^ { N ^ { \prime } } \left[ \log \left( \frac { C _ { 0 } } { \Delta _ { i } } \right) \right] _ { + } = \sum _ { i \in I _ { C _ { 0 } } } \left( \log C _ { 0 } - \log \Delta _ { i } \right) } } \\ { { \displaystyle = | I _ { C _ { 0 } } | \log C _ { 0 } - \log \left( \prod _ { i \in I _ { C _ { 0 } } } \Delta _ { i } \right) } } \end{array}
$$

Theorem 6(Complexity via margin product). The total computational cost is given by:

$$
C o s t \approx \frac { d } { \alpha } \left( | I _ { C _ { 0 } } | \log C _ { 0 } - \log \left( \prod _ { i \in I _ { C _ { 0 } } } \Delta _ { i } \right) \right)
$$

STEP 4:ASYMPTOTIC ANALYSIS OF THE MARGIN PRODUCT

To evaluate the complexity, we need to analyze the product of the margins over the contributing indices, $\begin{array} { r } { P = \prod _ { i \in I _ { C _ { 0 } } } \Delta _ { i } } \end{array}$ . We usethe well-known asymptotic for the iverse normal CDFfor small arguments $p  0$ = $\Phi ^ { - 1 } ( p ) \sim - \sqrt { 2 \ln ( 1 / p ) }$ In our case for lange $i$ $\begin{array} { r } { p = \frac { k } { i + 1 } + \varepsilon _ { i } } \end{array}$ is small orvided $\varepsilon _ { i } = o ( 1 )$

$$
\Delta _ { i } = - \sigma \Phi ^ { - 1 } \Big ( \frac { k } { i { + } 1 } + \varepsilon _ { i } \Big ) \approx \sigma \sqrt { 2 \ln \biggl ( \frac { i + 1 } { k + ( i + 1 ) \varepsilon _ { i } } \biggr ) }
$$

The logarithm of the product is the sum of logarithms. Note the sum starts from $i = i _ { 0 }$ (the first index where $\Delta _ { i } > 0$ ), and is further truncated at the largest index $N _ { C _ { 0 } } ^ { \prime }$ for which $\Delta _ { i } \leq C _ { 0 }$

$$
\log ( P ) = \sum _ { i = i _ { 0 } } ^ { N _ { C _ { 0 } } ^ { \prime } } \mathrm { l n } ( \Delta _ { i } ) \approx \sum _ { i = i _ { 0 } } ^ { N _ { C _ { 0 } } ^ { \prime } } \left[ \mathrm { l n } \sigma + \frac { 1 } { 2 } \mathrm { l n } \left( 2 \mathrm { l n } \left( \frac { i } { k + i \varepsilon _ { i } } \right) \right) \right]
$$

For large $N _ { C _ { 0 } } ^ { \prime }$ , the term $\textstyle \ln ( \ln ( { \frac { i } { k + i \varepsilon _ { i } } } ) )$ Changes veryslowly.The followingboundformalizesthis heuristic.

Lemma 1 (Bounding the slowly varying sum). Let $g ( i ) : = \ln \bigl ( \ln ( i / ( k + i \varepsilon _ { i } ) ) \bigr )$ for $i \geq i _ { 0 }$ ，where $\varepsilon _ { i }$ is nonincreasing. Then for any integers $a < b$ ，

$$
\sum _ { i = a } ^ { b } g ( i ) \ \leq \ ( b - a + 1 ) g ( b ) + \int _ { a } ^ { b } \frac { 1 } { x \ln \left( x / ( k + x \varepsilon _ { x } ) \right) } d x .
$$

In particular, taking $a = i _ { 0 }$ and $b = N _ { C _ { 0 } } ^ { \prime }$ and noting that the integral term is bounded by an absolute constant multiple of $\ln \mathrm { l n } \big ( N _ { C _ { 0 } } ^ { \prime } / ( k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } ) \big )$ ， we obtain

$$
\begin{array} { r } { \underset { i = i _ { 0 } } { \overset { N _ { C _ { 0 } } ^ { \prime } } { \sum } } \mathrm { l n } \Big ( \mathrm { l n } \Big ( \frac { i } { k + i \varepsilon _ { i } } \Big ) \Big ) \leq ( N _ { C _ { 0 } } ^ { \prime } - i _ { 0 } + 1 ) \ln \bigg ( \mathrm { l n } \bigg ( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } } \bigg ) \bigg ) + c _ { 0 } \ln \mathrm { l n } \bigg ( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } } \bigg ) } \end{array}
$$

for some absolute constant $c _ { 0 } > 0$

Applying this lemma to $\log ( P )$ yields the explicit bound

$$
\begin{array} { r } { \log ( P ) \ \leq \ ( N _ { C _ { 0 } } ^ { \prime } - i _ { 0 } + 1 ) \left( \ln \sigma + \frac { 1 } { 2 } \ln \left( 2 \ln \left( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } } \right) \right) \right) + c _ { 0 } \ln \ln \left( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } } \right) . } \end{array}
$$

STEP 5:FINAL COMPLEXITY RESULT

Substituting the asymptotic result for the margin product with high-probability margins back into our complexity formula, we arrive at the final statement (holding with probability at least $\begin{array} { r l } { ~ } & { { } 1 - \sum _ { i } 2 e ^ { - 2 i \varepsilon _ { i } ^ { 2 } } } \end{array}$ if a union bound over $i$ is applied).

Theorem 7 (Final complexity of Panorama). The expected computational cost to process a candidate set is:

$$
\mathbb { E } [ C o s t ] \approx \frac { d } { \alpha } \left( | I _ { C _ { 0 } } | \log C _ { 0 } - ( N _ { C _ { 0 } } ^ { \prime } - i _ { 0 } + 1 ) \left[ \ln \sigma + \frac { 1 } { 2 } \ln \left( 2 \ln \left( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } } \right) \right) \right] \right)
$$

STEP 6:FINITE-SAMPLE BOUND

On the event ${ \mathcal { E } } _ { \delta }$ (which holds with probability at least $1 - \delta )$ ,combining Step 5 with the lemma above gives the explicit finite-sample bound

$$
\begin{array} { r } { \natural [ \mathrm { C o s t } ] \ \leq \ \frac { d } { \alpha } \Bigg ( | I _ { C _ { 0 } } | \log C _ { 0 } - ( N _ { C _ { 0 } } ^ { \prime } - i _ { 0 } + 1 ) \Big [ \ln \sigma + \frac { 1 } { 2 } \ln \Big ( 2 \ln \big ( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } } \big ) \Big ) \Big ] \Bigg ) + c _ { 1 } \frac { d } { \alpha } \ln \ln \Big ( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } } \Big ) } \end{array}
$$

for a universal constant $c _ { 1 } > 0$ .Moreover, since the per-candidate work is at most $d$ ,the unconditional expected cost satisfies

$$
\mathbb { E } [ \mathsf { C o s t } ] \le \mathbb { E } [ \mathsf { C o s t } | \mathcal { E } _ { \delta } ] \left( 1 - \delta \right) + \delta N ^ { \prime } d \le \frac { 1 } { 1 - \delta } \mathbb { E } [ \mathsf { C o s t } | \mathcal { E } _ { \delta } ] + \delta N ^ { \prime } d ,
$$

which yields the same bound up to an additive $\delta N ^ { \prime } d$ and a multiplicative $1 / ( 1 - \delta )$ factor.

Comparison to naive costThe naive, brute-force method computes $N ^ { \prime }$ full $d$ -dimensional distances, with total cost at most $N ^ { \prime } d$ . Comparing with the bound above shows a reduction factor that scales as $\alpha$ (up to the slowly varying and logarithmic terms), on the same high-probability event ${ \mathcal { E } } _ { \delta }$ On the role of $\alpha > 1$ The parameter $\alpha$ controls the rate of exponential energy decay, $e ^ { - \alpha m / d }$ If $\alpha \leq 1$ , energy decays too slowly (e.g., at halfway, $m = d / 2$ ,the remaining energy is at least $e ^ { - 0 . 5 }$ ）， leading to weak bounds and limited pruning. Effective transforms concentrate energy early, which in practice corresponds to $\alpha$ comfortably greater than 1. The high-probability analysis simply replaces the expected-margin terms by their concentrated counterparts and leaves this qualitative conclusion unchanged.

# ROBUSTNESS TO OUT-OF-DISTRIBUTION QUERIES

In practice, the query vector $\mathbf { q }$ and database vectors $\left\{ { { \bf { x } } _ { i } } \right\}$ may have different energy compaction properties under the learned transform $T$ Let $\alpha _ { q }$ denote the energy compaction parameter for the query and $\alpha _ { x }$ for the database vectors,such that:

$$
\begin{array} { r } { R _ { \mathbf { q } } ^ { ( m , d ) } \approx \| \mathbf { q } \| ^ { 2 } e ^ { - \alpha _ { q } m / d } } \\ { R _ { \mathbf { x } _ { i } } ^ { ( m , d ) } \approx \| \mathbf { x } _ { i } \| ^ { 2 } e ^ { - \alpha _ { x } m / d } } \end{array}
$$

Theorem 8 (Effective energy compaction with asymmetric parameters). When the query and database vectors have different compaction rates, the effective energy compaction parameter for the lower bound error becomes:

$$
\alpha _ { e f f } = \frac { \alpha _ { q } + \alpha _ { x } } { 2 }
$$

leading to an expected complexity of:

$$
\mathbb { E } [ C o s t ] \sim \frac { C \cdot N ^ { \prime } d } { \alpha _ { e f f } } \sim \frac { 2 C \cdot N ^ { \prime } d } { \alpha _ { q } + \alpha _ { x } }
$$

for some constant $C > 0$ depending on the problem parameters.

Proof. Starting from the same Cauchy-Schwarz derivation as in Step 2,the lower bound error is:

$$
\| \mathbf { q } - \mathbf { x } _ { j } \| ^ { 2 } - \mathbf { L B } ^ { ( m ) } ( \mathbf { q } , \mathbf { x } _ { j } ) \leq 4 \sqrt { R _ { \mathbf { q } } ^ { ( m , d ) } R _ { \mathbf { x } _ { j } } ^ { ( m , d ) } }
$$

With asymmetric energy compaction parameters, the tail energies become:

$$
\begin{array} { r l } & { R _ { \mathbf { q } } ^ { ( m , d ) } \leq \| \mathbf { q } \| ^ { 2 } e ^ { - \alpha _ { q } m / d } \leq R ^ { 2 } e ^ { - \alpha _ { q } m / d } } \\ & { R _ { \mathbf { x } _ { j } } ^ { ( m , d ) } \leq \| \mathbf { x } _ { j } \| ^ { 2 } e ^ { - \alpha _ { x } m / d } \leq R ^ { 2 } e ^ { - \alpha _ { x } m / d } } \end{array}
$$

Substituting into the Cauchy-Schwarz bound:

$$
4 \sqrt { R _ { \mathbf { q } } ^ { ( m , d ) } R _ { \mathbf { x } _ { j } } ^ { ( m , d ) } } \leq 4 R ^ { 2 } \sqrt { e ^ { - \alpha _ { q } m / d } \cdot e ^ { - \alpha _ { x } m / d } } = 4 R ^ { 2 } e ^ { - ( \alpha _ { q } + \alpha _ { x } ) m / ( 2 d ) }
$$

The effective energy compaction parameter is therefore $\alpha _ { \mathrm { e f f } } = ( \alpha _ { q } + \alpha _ { x } ) / 2$ , and the rest of the analysis follows identically to the symmetric case, yielding the stated complexity. □

Graceful degradation for OOD queriesThis result has important practical implications. Even when the query is completely out-of-distribution and exhibits no energy compaction $( \alpha _ { q } = 0 )$ ),the algorithm still achieves a speedup factor of $\alpha _ { x } / 2$ compared to the naive approach:

$$
\mathbb { E } [ \mathrm { C o s t } ] \sim \frac { 2 C \cdot N ^ { \prime } d } { \alpha _ { x } }
$$

This demonstrates that Panorama provides robust performance even for challenging queries that don't conform to the learned transform's assumptions, maintaining substantial computational savings as long as the database vectors are well-compacted.

# FINAL COMPLEXITY RESULT AND COMPARISON WITH NAIVE ALGORITHM

The naive brute-force algorithm computes the full $d$ -dimensional distance for each of the $N ^ { \prime }$ candidates, yielding cost $\mathrm { C o s t } _ { \mathrm { n a i v e } } = N ^ { \prime } \cdot d$

$\begin{array} { r } { \phi = \frac { \mathbb { E } [ \rho ] } { d } } \end{array}$ expected computational cost is:

$$
\mathbb { E } [ C o s t ] = \phi \cdot d \cdot N ^ { \prime } \sim { \frac { C \cdot N ^ { \prime } d } { \alpha } }
$$

where $C$ can be made arbitrarily close to l through appropriate scaling.

Proof. From Steps 1-6,the expected cost is approximately:

$$
\mathbb { E } [ \mathrm { C o s t } ] \approx \frac { d } { \alpha } \left( | I _ { C _ { 0 } } | \log C _ { 0 } - ( N _ { C _ { 0 } } ^ { \prime } - i _ { 0 } + 1 ) \left[ \ln \sigma + \frac { 1 } { 2 } \ln \left( 2 \ln \left( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } } \right) \right) \right] \right)
$$

For large $N ^ { \prime }$ , we have $\frac { | I _ { C _ { 0 } } | } { N ^ { \prime } }  1$ and $\frac { N _ { C _ { 0 } } ^ { \prime } - i _ { 0 } + 1 } { N ^ { \prime } }  1$ , giving:

$\begin{array} { r } { \zeta : = \frac { 1 } { 2 } \ln \biggl ( 2 \ln \biggl ( \frac { N _ { C _ { 0 } } ^ { \prime } } { k + N _ { C _ { 0 } } ^ { \prime } \varepsilon _ { N _ { C _ { 0 } } ^ { \prime } } } \biggr ) \biggr ) } \end{array}$

Scaling to achieve $C = 1$ .Scale all vectors by $\beta > 0$ : this transforms $R \to \beta R$ and $\sigma \to \beta \sigma$ The expression becomes:

$$
\begin{array} { l } { { \displaystyle \phi \approx \frac { 1 } { \alpha } \left( \log ( \beta ^ { 2 } C _ { 0 } ) - \ln ( \beta \sigma ) - \zeta \right) = \frac { 1 } { \alpha } \left( \log C _ { 0 } + 2 \log \beta - \ln \sigma - \ln \beta - \zeta \right) } } \\ { { ~ } } \\ { { { } = \displaystyle \frac { 1 } { \alpha } \left( \log C _ { 0 } + \log \beta - \ln \sigma - \zeta \right) } } \end{array}
$$

By choosing $\beta = e ^ { \ln \sigma - \log C _ { 0 } + \zeta }$ ,we get $\log C _ { 0 } + \log \beta = \ln \sigma + \zeta$ , making the leading coefficient exactly 1. Therefore $\phi \sim 1 / \alpha$ and $\mathbb { E } [ \mathrm { C o s t } ] \sim N ^ { \prime } d / \alpha$

Note that $\zeta$ depends on the problem size $N ^ { \prime }$ ,the number of nearest neighbors $k$ , and the concentration parameter ε No

This gives the asymptotic speedup: $\mathrm { C o s t _ { n a i v e } / \mathbb { E } [ C o s t _ { P a n o r a m a } ] } \sim \alpha .$

BEXPERIMENTAL SETUP

# B.1HARDWARE AND SOFTWARE

All experiments are conducted on Amazon EC2 m6i .metal instances equipped with Intel Xeon Platinum 8375C CPUs (2.90GHz),512GB DDR4 RAM,running Ubuntu 24.04.3 LTS,and compiled with GCC 13.3.0. In line with the official ANN Benchmarks (Aumuller et al.,2020),all experiments are executed on a single core with hyper-threading (SMT) disabled.

Our code is publicly available at https: //github.com/fasttrack-nn/panorama.

# B.2DATA COLLECTION

We benchmark each index using recall, the primary metric of the ANN Benchmarks (Aumuler et al., 2020). For each configuration, we run 1OO queries sampled from a held-out test set, repeated 5 times. On HNSW, Annoy, and MRPT, build times for SIFT100M would commonly exceed 60 minutes. Since we conducted hundreds of experiments per index, we felt it necessary to use SIFT10M for these indexes to enable reasonable build times. All the other indexes were benchmarked using SIFT100M.

IVFFlat and IVFPQ. Both methods expose two parameters: (i) $n _ { \mathrm { l i s t } }$ ,the number of coarse clusters (256-2048 for most datasets,and 10 for CIFAR-1O/FashionMNIST, matching their class counts), and (ii) $n _ { \mathrm { p r o b e } }$ , the number of clusters searched (1 up to $n _ { \mathrm { l i s t } }$ ,sweeping over 6-10 values, primarily powers of two). IVFPQ additionally requires: (i) $M$ ,the number of subquantizers (factors of $d$ between $d / 4$ and $d _ { \iota }$ ，and (ii) $n _ { \mathrm { b i t s } }$ , the codebook size per subquantizer (fixed to 8 (Jégou et al., 2011), yielding $M$ bytes per vector).

HNSW. We set $M = 1 6$ neighbors per node (Malkov & Yashunin, 2020), $e f _ { \mathrm { c o n s t r u c t i o n } } = 4 0$ for index creation (Douze et al., 2024),and vary $e f _ { \mathrm { s e a r c h } }$ from 1 to 2048 in powers of two.

Annoy.We fix the forest size to $n _ { \mathrm { t r e e s } } = 1 0 0$ (Bernhardsson, 2013) and vary search_k over 5-7 values between 1 and 400,000.

MRPT.MRPT supports autotuning via a target recall(Jäasaari et al., 2O19b), which we vary over 12 values from O.0 to 1.0.

# B.3DATA PROCESSING

For each index, we sweep its parameters and compute the Pareto frontier of QPS-recall pairs. To denoise,we traverse points from high to low recal: starting with the first point, we retain only those whose QPS exceeds the previously selected point by a factor of 1.2-1.5. This yields smooth QPS-recall curves. To obtain speedup-recall plots, we align the QPS-recall curves of the baseline and PANORAMA-augmented versions of an index, sample 5 evenly spaced recallvalues along their intersection, and compute the QPS ratios. The resulting pairs are interpolated using PCHIP.

# B.4MODEL TRAINING

We trained Cayley using the Adam optimizer with a learning rate of O.001,running for up to 100 epochs with early stopping (patience of 10). Training typically converged well before the maximum epoch limit,and we applied a learning-rate decay schedule to stabilize optimization and avoid overshooting near convergence.This setup ensured that PCA-Cayley achieved stable orthogonality while maintaining efficient convergence across datasets. The training was performed on the same CPUonly machine described in B,using $30 \%$ of the data for training and an additional $10 \%$ as a validation set to ensure generalization. Since our transforms are not training-heavy, training usually finished in under 2O minutes for each dataset, except for SIFT (due to its large size) and Large/CIFAR-10 (3072-dimensional), where the training step took about 1 hour.

# B.5ACCOUNTING FOR TRANSFORMATION TIME

PANORAMA applies an orthogonal transform to each query via a $1 \times d$ by $d { \times } d$ matrix multiplication. We measure this amortized cost by batching 100 queries per dataset and averaging runtimes using NumPy(Harrs et al.，2O2O) on the CPUs of our EC2 instances.Table 3 reports the estimated maximum per-query transformation time share across datasets and index types.

Table 3: Estimated maximum per-query transform time ( $\%$ of query time) by index and dataset.   

<table><tr><td></td><td>Ada</td><td>CIFAR-10</td><td>FashionMNIST</td><td>GIST</td><td>Large</td><td>SIFT</td></tr><tr><td>Annoy</td><td>3.0e-04%</td><td>5.2e-03%</td><td>7.0e-03%</td><td>2.2e-04%</td><td>4.5e-04%</td><td>1.1e-04%</td></tr><tr><td>HNSW</td><td>1.4e-02%</td><td>5.5e-02%</td><td>3.3e-02%</td><td>4.7e-03%</td><td>1.9e-02%</td><td>2.5e-04%</td></tr><tr><td>IVFFlat</td><td>1.1e-03%</td><td>1.5e-02%</td><td>1.8e-02%</td><td>8.1e-04%</td><td>1.3e-03%</td><td>1.7e-05%</td></tr><tr><td>IVFPQ</td><td>2.7e-03%</td><td>8.4e-03%</td><td>7.0e-03%</td><td>6.7e-04%</td><td>2.2e-03%</td><td>3.3e-05%</td></tr><tr><td>MRPT</td><td>1.7e-03%</td><td>1.7e-02%</td><td>1.1e-02%</td><td>5.5e-04%</td><td>3.0e-03%</td><td>5.9e-05%</td></tr><tr><td>L2Flat</td><td>7.0e-04%</td><td>5.6e-02%</td><td>1.3e-02%</td><td>7.0e-04%</td><td>8.5e-04%</td><td>1.4e-06%</td></tr></table>

# CPANORAMA VARIANTS

<table><tr><td>Variant</td><td>|B|</td><td>Use UB</td><td>Applicable Indexes</td></tr><tr><td>Point-centric</td><td>1</td><td>No</td><td>HNSW, Annoy, MRPT</td></tr><tr><td>Batch-UB</td><td>B&gt;1</td><td>Yes</td><td>IVFPQ</td></tr><tr><td>Batch-noUB</td><td>B&gt;1</td><td>No</td><td>L2Flat, IVFFlat</td></tr></table>

Table 4: Panorama execution variants, parameterized by batch size $( B )$ and whether upper bounds (UBs) are maintained.

The generic Panorama algorithm (Algorithm 4) is flexible and admits three execution modes depending on two factors: the batch size $B$ and whether we maintain upper bounds (UBs) during iterative refinement. We highlight three important variants that cover the spectrum of practical use cases. In each case, we present the pseudocode along with a discusson of the design tradeoffs and a summary in Table 4

# C.1POINT-CENTRIC:BATCHSIZE $= 1$ ,UsE $\pi = 0$

As outlined in Alg.2,candidates are processed individually，with heap updates only after exact distances are computed. Since exact values immediately overwrite looser bounds, maintaining UBs offers no benefit. This mode is best suited for non-contiguous indexes (e.g.,HNsW, Annoy, MRPT), wherethe storage layout is not reorganized. Here, pruning is aggressve and immediate. A candidate can be discarded as soon as its lower bound exceeds the current global threshold $d _ { k }$ . The heap is updated frequently, but since we only track one candidate at a time, the overhead remains low.

# C.2BATCH-UB:BATCHSIZE $\neq 1$ ,UsE $\pi = 1$

As described in Alg.3,when we process candidates in large batches ( $B > 1 )$ ，the situation changes.Frequent heap updates may seem expensive, however, maintaining upper bounds allows us to prune more aggressively: a candidate can be pushed into the heap early if its UB is already tighter than the current $d _ { k }$ ,even before its exact distance is known.When batch sizes are large, the additional pruning enabled by UBs outweighs the overhead of heap updates. This tighter pruning is particularly beneficial in high-throughput, highly-optimized setings such as IVFPQ, where PQ compresses vectors into shorter codes,allowing many candidates to be processed together.

# Algorithm 2 PANORAMA: Point Centric

1:Input: Query q,candidate set $\mathcal { C } = \{ \mathbf { x } _ { 1 } , \dots , \mathbf { x } _ { N ^ { \prime } } \}$ ,transform $_ T$ ,levels $m _ { 1 } < \cdots < m _ { L }$ , $k$ ,batch size $B$ 2:Precompute: $T ( \mathbf { q } )$ , $\| T ( \mathbf { q } ) \| ^ { 2 }$ ,and tail energies $R _ { q } ^ { ( \ell , d ) }$ for all $\ell$ 3:Initialize: Global exactdistance heap $H$ (size $k$ ), global threshold $d _ { k } \gets + \infty$ ， $p ( \mathbf { q } , \mathbf { x } ) \gets \mathbf { 0 } ^ { ( l , l ) }$ Compute exact distances of first $k$ candidates,initialize $H$ and $d _ { k }$ for each candidate $\mathbf { x } \in { \mathcal { C } }$ do Batch $\boldsymbol { B } = \{ \boldsymbol { p } \}$ for $\ell = 1$ to $L$ do if $\mathsf { L B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) > d _ { k }$ then Update LB bound Mark $\mathbf { x }$ as pruned If threshold exceeded, prune candidate continue 10: Push $( \mathsf { L B } ^ { L } ( \mathbf { q } , \mathbf { x } ) , \mathbf { x } )$ to $H$ as exact entry $\mathsf { L B } ^ { L } ( \mathbf { q } , \mathbf { x } )$ is ED as $\ell = L$ 11: if $d < d _ { k }$ then 12: Update $d _ { k } = k ^ { \mathrm { t h } }$ distance in $H$ ; $\operatorname { C r o p } H$ 13:return Candidates in $H$ (top k with possible ies at $k ^ { \mathrm { t h } }$ position)

# Algorithm 3 PANORAMA: Batched with UB

1:Input: Query q,candidate set $\mathcal { C } = \{ \mathbf { x } _ { 1 } , \dots , \mathbf { x } _ { N ^ { \prime } } \}$ ,transform $_ T$ ,levels $m _ { 1 } < \cdots < m _ { L } ,$ $k$ ,batch size $B$   
2:Precompute: $T ( \mathbf { q } )$ , $\| T ( \mathbf { q } ) \| ^ { 2 }$ ,and tail energies $R _ { q } ^ { ( \ell , d ) }$ for all $\ell$   
3:Initialize: Global exact distance heap $H$ (size $k$ ), global threshold $d _ { k } \gets + \infty$ , $p ( \mathbf { q } , \mathbf { x } ) \gets \mathbf { 0 } ^ { ( l , l ) }$   
4:Compute exact distances of first $k$ candidates, initialize $H$ and $d _ { k }$   
for each batch $B \subset { \mathcal { C } }$ of size $B$ do for $\ell = 1$ to $L$ do for each candidate $\mathbf { x } \in B$ do if $\mathsf { L B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) > d _ { k }$ then Update LB bound Mark $\mathbf { x }$ as pruned If threshold exceeded,prune candidate   
10: continue   
11: Compute $\mathsf { U B } ^ { \ell } ( \mathbf { q } , \mathbf { x } )$ Compute upper bound   
12: if $\mathsf { U B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) < d _ { k }$ then   
13: Push $( \mathsf { U B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) , \mathbf { x } )$ to $H$ as UB entry   
14: Update $d _ { k } = k ^ { \mathrm { t h } }$ distance in $H$ ; $\mathrm { C r o p } \ H$   
15:return Candidates in $H$ (top k with possible ties at $k ^ { \mathrm { t h } }$ position)

# C.3BATCH-NOUB:BATCHSIZE $\neq 1$ ,UsE $\pi = 0$

Finally,when batch size is greater than one but we disable UBs,we obtain a different execution profile,as described in Alg 4 In this mode, each batch is processed level by level,and pruning is done only with lower bounds. Candidates that survive all levels are compared against the global $d _ { k }$ using their final exact distance,but the heap is updated only once per batch rather than per candidate. This reduces UB maintenance overhead,at the expense of weaker pruning within the batch. For L2Flat and IVFFlat, batch sizes are modest and candidates are uncompressed. Here,the marginal pruning benefit from UBs is outweighed by the overhead of heap updates, making UB maintenance inefficient.

# Algorithm 4 PANORAMA: Batched without UB

1:Input: Query q, candidate set $\mathcal { C } = \{ \mathbf { x } _ { 1 } , \dots , \mathbf { x } _ { N ^ { \prime } } \}$ ,transform $_ T$ ,levels $m _ { 1 } < \cdots < m _ { L }$ ,k, batch size $B$   
2:Precompute: $T ( \mathbf { q } )$ , $\| T ( \mathbf { q } ) \| ^ { 2 }$ ,and tail energies $R _ { q } ^ { ( \ell , d ) }$ for all $\ell$ $H$ $k$ $d _ { k } \gets + \infty$ $p ( \mathbf { q } , \mathbf { x } ) \gets \mathbf { 0 } ^ { ( l , l ) }$ $k$ $H$ $d _ { k }$ for each batch $B \subset { \mathcal { C } }$ of size $B$ do for $\ell = 1$ to $L$ do for each candidate $\mathbf { x } \in B$ if $\mathsf { L B } ^ { \ell } ( \mathbf { q } , \mathbf { x } ) > d _ { k }$ then Update LB bound Mark $\mathbf { x }$ as pruned If threshold exceeded,prune candidate continue   
11: for each unpruned candidate $\mathbf { x } \in B$ do   
12: Push $( \mathsf { L } \mathsf { \bar { B } } ^ { L } ( \mathbf { q } , \mathbf { x } ) , \mathbf { x } )$ to $H$ as exact entry $\mathsf { L B } ^ { L } ( \mathbf { q } , \mathbf { x } )$ is ED as $\ell = L$   
13: if $d < d _ { k }$ then   
14: Update $d _ { k } = k ^ { \mathrm { t h } }$ distance in $H$ ; Crop $H$   
15:return Candidates in $H$ $\mathrm { i o p } \ k$ with possible ties at $k ^ { \mathrm { { t h } } }$ position)

This setting is not equivalent to the point-centric case above.Here,allcandidates in a batch share the same pruning threshold for the duration of the batch,and the heap is only updated at the end. This is the design underlying IVFFlat: effcient to implement, and still benefiting from level-major layouts and SIMD optimizations.

Systems Perspective. As noted in Section 2, these three Panorama variants capture a spectrum of algorithmic and systems tradeoffs:

· Point-centric ( $B = 1$ ， $\pi = 0$ ): Suited for graph-based or tree-based indexes (Annoy, MRPT, HNSW) where candidates arrive sequentially, pruning is critical, and system overhead is minor.   
·Batch-UB ( $B > 1$ ， $\pi = 1$ ): Ideal for highly optimized,quantization-based indexes (IVFPQ) where aggressive pruning offsets the cost of frequent heap updates.   
·Batch-noUB $( B < 1 , \pi = 1 )$ : Matches flat or simpler batched indexes (IVFFlat), where streamlined execution and SIMD batching outweigh the benefit of UBs.

# DHNSW: NON-TRIVIAL ADDITION

# Algorithm 5 HNSW + PANORAMA at Layer 0

<table><tr><td>1: 2:</td><td>Input:Query q, neighbors k,beam width ef Search,transform T</td></tr><tr><td>set {ep} (entry point)</td><td>Initialize:CandidateeapC(sizeefearch,eyedbpartialdistance),esulthapW(size,eyedbyexactdistace)iid</td></tr><tr><td></td><td></td></tr><tr><td></td><td>Compute ed ← ||T(q)-epll2</td></tr><tr><td></td><td>Insert (ed,ep) into Cand W</td></tr><tr><td></td><td>while C not empty do</td></tr><tr><td></td><td>U ←C.pop-min()</td></tr><tr><td></td><td>T ←W.max_key( if|W|= k else+∞</td></tr><tr><td></td><td>for each neighbor u of u do</td></tr><tr><td>10:</td><td>ifuvisited then</td></tr><tr><td>11:</td><td>Add u to visited</td></tr><tr><td>12:</td><td>(lb,ub,pruned) ← PANORAMA(q,u,T,T) Inser (lbb），u）intoC;coC</td></tr><tr><td>13:</td><td></td></tr><tr><td>14:</td><td>if not pruned then</td></tr><tr><td>15:</td><td>Insert (lb,u) into W;crop W</td></tr><tr><td>16:</td><td>return Top-k nearest elements from W</td></tr><tr><td>17:</td><td>procedure PANORAMA(q,u,T,T)</td></tr><tr><td>18:</td><td>for each level l do</td></tr><tr><td>19:</td><td>lb←LB(T(q),u)</td></tr><tr><td>20:</td><td>ub ←UBe(T(q),u)</td></tr><tr><td>21:</td><td>if lb &gt;T then</td></tr><tr><td>22:</td><td>return (lb,ub,true)</td></tr><tr><td>23:</td><td></td></tr><tr><td></td><td>return (lb,ub,false)</td></tr></table>

HNSW constructs a hierarchical proximity graph, where an edge $( v , u )$ indicates that the points $v$ and $u$ are close in the dataset. The graph is built using heuristics based on navigability,hub domination,and small-world properties, but importantly, these edges do not respect triangle inequality guarantees. As a result, a neighbor's neighbor may be closer to the query than the neighbor itself.

At query time, HNsW proceeds in two stages:

1. Greedy descent on upper layers: A skip-list-like hierarchy of layers allows the search to start from a suitable entry point that is close to the query.By descending greedily through upper layers, the algorithm localizes the query near a promising root in the base layer.

2. Beam search on layer 0: From this root, HNsW maintains a candidate beam ordered by proximity to the query. In each step, the closest element $v$ in the beam is popped, its neighbors $N ( v )$ are examined,and their distances to the query are computed. Viable neighbors are inserted into the beam, while the global result heap $W$ keeps track of the best $k$ exact neighbors found so far.

Integration Point. The critical integration occurs in how distances to neighbors $u \in N ( v )$ are computed. In vanilla HNsW,each neighbor's exact distance to the query is evaluated immediately upon consideration. With Panorama,distances are instead refined progressively. For each candidate $v$ popped from the beam heap,and for each neighbor $u \in N ( v )$ ,we invoke PANORAMA with the current $k$ -th threshold $\tau$ from the global heap:

· If Panorama refines $u$ through the final level $L$ and $u$ survives pruning, its exact distance is obtained. In this case, $u$ is inserted into the global heap and reinserted into the beam with its exact distance as the key.

· If Panorama prunes $u$ earlier at some level $\ell < L$ , its exact distance is never computed. Instead, $u$ remains in the beam with an approximate key $( \mathsf { L B } ^ { \ell } + \mathsf { U B } ^ { \ell } ) / 2$ , serving as a surrogate estimate of its distance.

Heuristics at play. This modification introduces two complementary heuristics:

·Best-first exploration: The beam remains ordered, but now candidates may carry either exact distances or partial Panorama-based estimates.   
·Lazy exactness: Exact distances are only computed when a candidate truly needs them (i.e., it survives pruning against the current top- $k$ ).Non-viable candidates are carried forward with coarse estimates, just sufficient for ordering the beam.

Why this is beneficial. This integration alows heterogeneous precision within the beam: some candidates are represented by exact distances，while others only by partial Panorama refinements.The global heap $W$ still guarantees correctness of the final $k$ neighbors (exact distances only), but the beam search avoids unnecessary exact computations on transient candidates. Thus, HNSW+Panorama reduces wasted distance evaluations while preserving the navigability benefits of HNSW's graph structure.

# EIVFPQ:IMPLEMENTATION DETAILS

We now describe how we integrated PANORAMA into Faiss's IVFPQ index. Our integration required careful handling of two performance-critical aspects: (i) maintaining SIMD eficiency during distance computations when pruning disrupts data contiguity,and (ii) choosing the most suitable scanning strategy depending on how aggressively candidates are pruned. We address these challenges through a buffering mechanism and a set of adaptive scan modes,detailed below.

Buffering.For IVFPQ,the batch size $B$ corresponds to the size of the coarse cluster currently being scanned. As pruning across refinement levels progresses, a naive vectorized distance computation becomes ineficient: SIMD lanes remain underutilized because codes from pruned candidates leave gaps.To address this,we design a buffering mechanism that ensures full SIMD lane utilization. Specifically,we allocate a 16KB buffer once and reuse it throughout the search. This buffer stores only the PQ codes of candidates that survive pruning, compacted contiguously for efficient SIMD operations.Buffer maintenance proceeds as follows:

1.Maintain a byteset where byteset[i] indicates whether the $i$ -th candidate in the batch survives. We also keep a list of indices of currently active candidates.   
2. While unprocessed points remain in the batch and the buffer is not full,load 64 bytes from the byteset(_mm512_loadu_si512).   
3.Load the corresponding 64 PQ codes.   
4.Construct a bitmask from the byteset， and compressthe loaded codeswith mm512 maskz_compress_epi8 so that surviving candidates are packed contiguously.

5.Write the compacted codes into the buffer.

Once the buffer fills (or no codes remain), we compute distances by gathering precomputed entries from the IVFPQ lookup table (LUT), which stores distances between query subvectors and all $2 ^ { n _ { \mathrm { b i t s } } }$ quantized centroids.Distance evaluation reduces to mm512_i32gather_ps calls on the buffered codes,and pruning proceeds in a fully vectorized manner.

Scan Modes.Buffering is not always optimal. If no candidates are pruned, bufering is redundant, since the buffer merely replicates the raw PQ codes. To avoid unnecessary overhead, we introduce a ScanMode :: Full, which bypasses buffering entirely and directly processes raw codes.

Conversely，when only a small fraction of candidates survive pruning，buffer construction becomes inefficient: most time is wasted loading already-pruned codes.For this case,we define ScanMode : Sparse, where we iterate directly over the indices of surviving candidates in a scalar fashion,compacting them into the buffer without scanning the full batch with SIMD loads.

# FABLATION STUDIES

We conduct multiple ablation studies to analyze the effect of individual components of PANORAMA, providing a detailed breakdown of its behavior under diverse settings.

The base indexes we use expose several knobs that control the QPS-recall tradeof. An ANNS query is defined by the dataset (with distribution of the metric), the number of samples $N$ ,and the intrinsic dimensionality $d$ . Each query retrieves $k$ out of $N$ entries. In contrast, PANORAMA has a single end-to-end knob,the hyperparameter $\alpha$ , which controls the degree of compaction.

# F.1TRUNCATION VS.PANORAMA

Vector truncation (e.g.，via PCA） is often used with the argument that it provides speedup while only marginally reducing recall. However, truncating all vectors inevitably reduces recall across the board.In contrast, PANORAMA adaptively stops evaluating dimensions based on pruning conditions,enabling speedup without recall loss. Figure 11 shows $\%$ dimensions pruned (xaxis),recall (left y-axis)， and speedup on L2Flat (right y-axis). The black line shows PANORAMA's speedup.To achieve the same speedup as PANORAMA,PCA truncation only achieves a recall of 0.58.

![](images/ca83515c12ac92aa33c3b95dacd39b61df5b1da1df984ebd96dc24c8d20b2f32.jpg)  
Figure 11: Truncation vs. PANORAMA: recall and speedup tradeoff.

# F.2ABLATION ON $N , d , k$

We do an ablation study on GIST1M using L2Flat to study the impact of the number of points, the dimension of each vector, and $k$ in the $k \mathbf { N N }$ query.

![](images/b0b9c490d4ceeaf064053eeefbc70c2e9902d886991d7c503848907ce69f1c9b.jpg)  
Figure 12: We study the effect of dataset size on GIST using L2Flat.In principle speedups should not depend on $N$ as we see for $5 0 0 \mathrm { K \mathrm { ~ - ~ } } 1 \mathrm { M }$ ，however nuances in selected of subset show higher speedups for 100K.

![](images/7db381828ef50d23c1d172f86a0896f1bc1789531439e2d1f0bf988fafe3a038.jpg)  
Figure 13: On GIST, we sample dimensions 10,200,300, 500,and 960,apply the Cayley transform，and measure speedup as $d$ varies.

![](images/2c799a5d6b687696f4657ca8aa9bbc035836262ba4d3d8fbd435b5564cefc69e.jpg)  
Figure 14: We study scaling with $k$ . We set max $\dot { k } = \sqrt { N }$ ， the largest value used in practice.Since the first $k$ elements require full distance computations，the overhead increases with $k$ ，reducing the relative speedup

Theabovetablecompares PCA with Cayley transforms.It highlights theimportance of havingalpha(introducedin Section 4） as a tunable parameter. The following results show speedup on IVFPQ and clearly demonstrate how Cayley achieves superiorspeedupscom

Table 5: DCT vs. PCA vs. Cayley (IVFPQ).   

<table><tr><td>Dataset @recall</td><td>DCT(×)</td><td>PCA (x)</td><td>Cayley (×)</td></tr><tr><td>Ada @98.0%</td><td>1.675</td><td>4.196</td><td>4.954</td></tr><tr><td>CIFAR-10 @92.5%</td><td>N/A</td><td>2.426</td><td>3.564</td></tr><tr><td>FashionMNIST @98.0%</td><td>1.199</td><td>2.635</td><td>4.487</td></tr><tr><td>GIST1M @98.0%</td><td>2.135</td><td>6.033</td><td>15.781</td></tr><tr><td>Large @98.0%</td><td>5.818</td><td>12.506</td><td>15.105</td></tr><tr><td>SIFT100M @92.5%</td><td>0.821</td><td>3.842</td><td>4.586</td></tr></table>

pared to PCA or DCT methods. Despite the fact that DCT provides immense energy compaction on image datasets (CIFAR-10 and FashionMNIST),the transformed data ultimately loses enough recall on IVFPQ to render the speedups due to compaction underwhelming.

# F.4NLEVELS ABLATION

Figure 15 highlights two key observations for GIST on IVFPQ under our framework:

Impact of the number of levels. Increasing the number of levels generally improves speedups up to about 32-64 levels,beyond which gains plateau and can even decline. This degradation arises from the overhead of frequent pruning decisions: with more levels,each candidate requires more branch evaluations, leading to increasingly irregular control flow and reduced performance.

![](images/7fdf926774d1b175f6ca25eb6e6969e9a21da10cb1e2275b744e9f0eee5598ac.jpg)  
Figure 15: Speedups Vs. number of levels.

Cache eficiency from LUT re-use. Panorama's level-wise computation scheme naturally reuses segments of the lookup table (LUT) across multiple queries, mitigating cache thrashing. Even in isolation, this design yields a $1 . 5 - 2 \times$ speedup over standard IVFPQ in Faiss. This underscores that future system layouts should be designed with Panorama-style execution in mind, as they inherently align with modern cache and SIMD architectures.

We compare the speedup predicted by our pruning model against the measured end-to-end speedup, validating both the analysis and the practical efficiency of our system. The expected speedup is a semi-empirical estimate: it takes the observed fraction $o$ of features processed and combines it with the measured fraction $p$ of time spent in verification. Formally,

$$
s _ { \mathrm { e x p } } = { \frac { 1 } { ( 1 - p ) + p \cdot o } } .
$$

When verification dominates $( p = 1 )$ ), this reduces to $s _ { \mathrm { e x p } } = 1 / o$ ，while if verification is negligible $( p = 0 )$ , no speedup is possible regardless of pruning. The actual speedup is measured as the ratio of PANORAMA 's end-to-end query throughput over the baseline,restricted to recall above $80 \%$ Figure 16 shows that $s _ { \mathrm { e x p } }$ and the measured values closely track each other, confirming that our system implementation realizes the gains predicted by pruning, though this comparison should not be confused with our theoretical results.

![](images/4f29e6b7f7a473935ef1c00c1fa07fefd0c4030bc6b79e551bd0eb02a7f81064.jpg)  
Figure 16: Comparison of measured and predicted speedup across datasets.

1)Implementation gains.For IVFPQ—and to a lesser extent IVFFlat and L2Flat—measured speedups exceed theoretical predictions. This stems from reduced LUT and query-cache thrashing in our batched, cache-aware design,as explained in Section 5.

2) Recall dependence. Higher recall generally comes from verifying a larger candidate set. This increases the amount of work done in the verification stage, leading to larger gains in performance (e.g., IVFPQ, HNSW).

3) Contiguous indexes. Layouts such as IVFPQ and IVFFlat realize higher predicted speedups, since they scan more candidates and thus admit more pruning. Their cache-friendly structure allows us to match—and sometimes surpass due to (1)—the expected bounds.

4) Non-contiguous indexes. Graph- and tree-based methods (e.g., HNsW, Annoy, MRPT) saturate around $5 { - } 6 \times$ actual speedup across our datasets, despite higher theoretical potential. Here, cache misses dominate, limiting achievable gains in practice and underscoring Amdahl's law. Moreover, in Annoy and MRPT specifically,less time is spent in the verification phase overall.

Finally, Figure 17 summarizes the overall QPS vs. Recal tradeoffs across datasets and indexes.

![](images/d7d08117fbd78b3f6aa0c0c4fbc55d0a8d120cd99410e9f0e408bc5e6c74f686.jpg)  
Figure 17: QPS vs. Recall: base index vs. PANORAMA+index across datasets.

QPS vs. recall plots are generated for every combination of index (PANORAMA and original) and dataset using the method outlined in Appendix B. These graphs are used to generate the Speedup vs. recall curves in Figure 8.

LLM Usage Statement We used an LLM to assist in polishing the manuscript at the paragraph level, including tasks such as re-organizing sentences and summarizing related work. All LLMgenerated content was carefully proofread and verified by the authors for grammatical and semantic correctness before inclusion in the manuscript.