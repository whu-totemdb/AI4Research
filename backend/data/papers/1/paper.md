# FedAPM: Federated Learning via ADMM with Partial Model Personalization

Shengkun Zhu   
School of Computer Science   
Wuhan University   
Wuhan, China   
whuzsk66@whu.edu.cn   
Feiteng Nie   
School of Computer Science   
Wuhan University   
Wuhan, China   
niefeiteng@whu.edu.cn Jinshan Zeng\*   
School of Management   
Xi'an Jiaotong University Xi'an, China jsh.zeng@gmail.com   
Sheng Wang\*   
School of Computer Science   
Wuhan University   
Wuhan, China   
swangcs@whu.edu.cn

Yuan Sun La Trobe Business School La Trobe University Melbourne,Australia yuan.sun@latrobe.edu.au

Yuan Yao Hong Kong University of Science and Technology Hong Kong, China yuany@ust.hk

Shangfeng Chen   
School of Computer Science   
Wuhan University   
Wuhan, China   
brucechen@whu.edu.cn   
Quanqing Xu   
Oceanbase   
Ant group   
Hangzhou, China   
xuquanqing.xqq@oceanbase.com   
Chuanhui Yang   
Oceanbase   
Ant group   
Hangzhou, China   
rizhao.ych@oceanbase.com

# Abstract

In federated learning (FL),the assumption that datasets from different devices are independent and identically distributed (i.i.d.) often does not hold due to user differences,and the presence of various data modalities across clients makes usinga single model impractical. Personalizing certain parts of the model can effectively address these issues by allowing those parts to differ across clients, while the remaining parts serve as a shared model.However, we found that partial model personalization may exacerbate client drift (each client's local model diverges from the shared model), thereby reducing the effectiveness and efficiency of FL algorithms.We propose an FL framework based on the alternating direction method of multipliers (ADMM),referred to as FedAPM,to mitigate client drift. We construct the augmented Lagrangian function by incorporating first-order and second-order proximal terms into the objective, with the second-order term providing fixed correction and the firstorder term offering compensatory correction between the local and shared models. Our analysis demonstrates that FedAPM, by using explicit estimates of the Lagrange multiplier, is more stable and efficient in terms of convergence compared to other FL frameworks.We establish the global convergence of FedAPM training from arbitrary initial points to a stationary point, achieving three types of rates:constant, linear,and sublinear,under mild assumptions.We conduct experiments using four heterogeneous and multimodal datasets with different metrics to validate the performance of FedAPM.Specifically, FedAPM achieves faster and more accurate convergence,outperforming the SOTA methods with average improvements of $1 2 . 3 \%$ in test accuracy, $1 6 . 4 \%$ in F1 score, and $1 8 . 0 \%$ in AUC while requiring fewer communication rounds.

# CCS Concepts

· Computing methodologies Distributed artificial intelligence;Distributed algorithms; Regularization.

# Keywords

Federated learning, partial model personalization,ADMM,client drift, global convergence.

# ACMReference Format:

Shengkun Zhu,Feiteng Nie, Jinshan Zeng\*,Sheng Wang\*,Yuan Sun, Yuan Yao, Shangfeng Chen, Quanqing Xu,and Chuanhui Yang.2025.FedAPM: Federated Learning via ADMM with Partial Model Personalization.In Proceedings ofthe 31stACMSIGKDD Conference on KnowledgeDiscovery and DataMiningV.2(KDD '25),August 3-7,2025,Toronto,ON,Canada.ACM, New York,NY,USA,28 pages.https://doi.org/10.1145/3711896.3736954

# 1 Introduction

With the widespread use of mobile devices,vast amounts of data are generated that fuel various machine learning applications [65, 68,70].However, traditional cloud-based training methods face issues of privacy leakage and data transmission costs [29,62].Additionally,with the implementation of privacy regulations like the California Consumer Privacy Act (CCPA)[1] and General Data Protection Regulation (GDPR)[2],protecting user data has become even more critical.Federated learning (FL) is a distributed machine learning framework that protects privacy by enabling local model training without the need for data centralization [40,48],addressing challenges like data silos and insufficient samples [3o,38],and fostering advancements in various intelligent applications [35,72].

In FL,it is typically assumed that the datasets from various devices are sampled from the same or highly similar distributions [38,41,46].However, due to the distinct characteristics of users and the growing prominence of personalized on-device services, the assumption of independent and identically distributed (i.i.d.) data often does not hold in practical scenarios [55,71,78]. This leads to statistical heterogeneity,which can significantly impact the effectiveness ofFL algorithms [71]. Moreover,different clients may have data in various modalities [15,16,24],such as images,videos, text,and audio,each requiring distinct models like convolutional neural networks (CNNs) for images [37] and recurrent neural networks (RNNs) for audio [26].Therefore,relying on a single model for all cases is ineffective and impractical [52, 63].

Partial model personalization [52] is amethod designed to address the challenge of heterogeneous and multimodal data by dividing the model parameters into two groups: shared and personalized model parameters.The dimensions of personalized models can vary among clients,enabling personalized components to differ in the number of parameters or even in their architecture,while the shared model is common among clients and maintains the same structure. However,while personalized models can effectively address the impact of heterogeneous and multimodal data, the shared model cannot,leading to the common saying:it started with a bang and ended with awhimper.This limitation arises because each client's local objectives differ.When solving for the shared model,the result is often a stationary point with respect to the local objective,rather than a stationary point with respect to the global objective.This issue is commonly referred to as client drift [32].

Several studies consider using full model personalization to address client drift [23,39,43],which involves personalizingall model parameters.However,each model requires twice the memory footprint of the full model, which limits the size of trainable models. Moreover,Pillutla et al.[52] proposed that full model personalization may not be essential for modern deep learning architectures, which consist of multiple simple functional units often structured in layers or other complex interconnected designs.Focusing on personalizing the appropriate components,guided by domain expertise,can yield significant advantages with only a minimal increase in memory requirements.Current partial model personalization methods can be categorized into two types based on their iterative approach:one using Gauss-Seidel iteration [19,52,6o],and the other employing Jacobi iteration [4,27,42],referred to as FedAlt and FedSim, respectively.Pillutla et al.[52] theoretically demonstrated the convergence of both methods and experimentally validated that FedAlt achieves better test performance than FedSim.However, these methods do not fundamentally address client drifts,as multiple local updates can still lead to deviations of each client's local model from the optimal representation.Moreover, we find that partial model personalization sometimes even exacerbates client drift,as shown in Figure 1.The local updates in FedAlt and FedSim, compared to FedAvg (a de facto FL framework without personalization)[48],bring the local model closer to the optimal local model while moving it further from the optimal shared model.

![](images/bfebaa06eaa5aa52c0bc3470cbadaf545239c1e869fb844978d4d455936f39bc.jpg)  
Figure 1: Client drift in FedAvg [48] and FedAlt/FedSim [52] is illustrated using two clients with three local update steps. Partial model personalization reduces the gap between $\pmb { u } _ { i }$ and $\pmb { u } _ { i } ^ { * }$ ,but increases the gap between $\pmb { u } _ { i }$ and $\pmb { u } ^ { * }$ .This may cause the shared model $\pmb { u }$ to drift further from $\pmb { u } ^ { * }$ ,as $\pmb { u } = \left( \pmb { u } _ { 1 } + \pmb { u } _ { 2 } \right) / 2$

Our main contribution in this paper is to address the issue that partial model personalization can exacerbate client drift. Specifically,we propose an FL framework based on the alternating direction method of multipliers (ADMM): FedAPM.We construct the augmented Lagrangian function by incorporating first-order and second-order proximal terms into the objective.The second-order term offers a fixed correction,while the first-order term provides a compensatory adjustment to fine-tune the local update. Moreover, we demonstrate that FedAPM is more stable and efficient in terms of convergence compared to FedAlt and FedSim,which results in improved communication efficiency. Specifically,we show that FedAlt and FedSim can be interpreted as using the inexact penalty method, while FedAPM adopts ADMM,an augmented Lagrangian method (also known as the exact penalty method).In FedAPM, explicit estimates of the Lagrange multiplier are used to address the ill-conditioning that is inherent in quadratic penalty functions [51].

We theoretically establish the global convergence of FedAPM under weaker assumptions than those used in [19,27,52]. Specifically, we establish global convergence with constant, linear,and sublinear convergence rates based on the Kurdyka-Lojasiewicz (KE) [36] inequality framework, as formulated in [6,67]. Our convergence analysis differs from existing work [6,67] in several key ways,enabling us to achieve the previously mentioned convergence results. According to [6,67],the conditions of suffcient descent,relative error, continuity,and the KL property guarantee the global convergence of a nonconvex algorithm.In contrast, we demonstrate sufficient descent and relative error conditions within an inexact ADMM optimization framework,while existing theories [6,67] require that all subproblems in ADMMbe solved exactly. Our theoretical contributions are also of value to the optimization community.

Our experimental contributions demonstrate that partial model personalization can exacerbate client drift, while FedAPM effectively alleviates this issue.Specifically,we validate FedAPM on several real-world datasets (including heterogeneous and multimodal data) using three partial model personalization strategies,four baselines, and six metrics.We demonstrate that FedAPM improves the overall performance of the SOTA methods,resulting in an average improvement of $1 2 . 3 \%$ ， $1 6 . 4 \%$ and $1 8 . 0 \%$ in testing accuracy,F1 score,and AUC,respectively.In terms of communication efficiency, FedAPM requires fewer communication rounds to converge to a lower loss. Moreover,we explore the impact of hyperparameters on FedAPM and provide adjustment strategies based on empirical findings.

# 2Related Work

Since partial model personalization is a special case of personalized FL approaches,we first review the existing personalized FL methods.Subsequently, given that ADMM is a primal-dual-based optimization framework,we review the current research that utilizes primal-dual-based methods as solvers for FL.

Personalized FL. According to the model partitioning strategies, PFL can be categorized into two types: full model personalization and partial model personalization [52]. Since the former is not the focus of this paper, interested readers can refer to [23,39,43, 81]. Here,we will only review partial model personalization methods. Based on the iterative methods (Gauss-Seidel and Jacobi),partial model personalization can be divided into two categories: FedAlt [19,60] and FedSim [4,27,42].These methods proposed different schemes for personalizing model layers.Liang et al.[42] and Collins et al.[19] proposed to personalize the input layers to learn a personalized representation,while Arivazhagan et al.[4] proposed learning a shared representation across various tasks through output layer personalization.However,regardless of which part of the model is personalized,the shared part still suffers from client drift,and this phenomenon can sometimes be exacerbated,leading to a decline in overall model performance.In terms of theory, Pillutla et al.[52] provided convergence guarantees for these methods, demonstrating a sublinear convergence rate under the assumptions of smoothness, bounded variance, and partial gradient diversity, which are often too strong in practical scenarios.

Primal-dual-basedFL.Existing FL frameworks can beclassified into three categories based on the type of variables being solved: primal-based FL [32,41,48],dual-based FL [47,61,62],and primaldual-based FL [25,31,66,77,79-81].Primal-based FL solves the primal problem ofFL,which makes it easy to implement [81]. Consequently,it has become one of the most widely used FL frameworks [10,12,44].In contrast,dual-based FL solves dual problems and has been shown to have better convergence than primal-based FL[56,57].However, dual-based FL is only applicable to convex problems.In recent years,primal-dual-based FL has gained more attention due to its advantages from both primal-based and dualbased methods.ADMM,as an exact penalty method [11,74],has been applied in FL optimization in recent years [79]. It has been shown to offer advantages in terms of convergence [8o] and alleviating data heterogeneity [25].However, these studies do not explain why applying ADMM in FL outperforms other FL frameworks,a question we will discuss from an optimization perspective.

# 3Preliminaries

This section presents the notations used throughout the paper and provides detailed definitions of both FL and ADMM. Moreover, we present three types of partial model personalization methods.

# 3.1 Notations

Weuse different text-formatting styles to represent different mathematical concepts: plain letters for scalars,bold letters for vector, and capitalized letters for matrices.For instance, $m$ represents a scalar, $^ { v }$ represents a vector,and $V$ denotes a matrix.Without loss of generality,all training models in this paper are represented using vectors.We use $[ m ]$ to represent the set $\{ 1 , 2 , . . . , m \}$ .Weuse “ $= "$ to indicate a definition, while $\mathbb { R } ^ { d }$ represents the $d$ -dimensional Euclidean space.We represent the inner product of vectors,such as $\langle { \pmb u } , { \pmb v } \rangle$ ,as the sum of the products of their corresponding elements. We use $| | \cdot | |$ to denote the Euclidean norm of a vector.Table 1 enumerates the notations used in this paper along with the description.

Table 1: Summary of notations   

<table><tr><td>Notations</td><td>Description</td></tr><tr><td>Xi,i∈[m]</td><td>The local dataset</td></tr><tr><td>Ui,i∈[m]</td><td>The personalized model</td></tr><tr><td>ui,i∈[m]</td><td>The local model</td></tr><tr><td>πi,i∈[m]</td><td>Thedualvariable</td></tr><tr><td>αi,i∈[m]</td><td>The weight parameter</td></tr><tr><td>u</td><td>The sharedmodel</td></tr><tr><td>p</td><td>The penalty parameter</td></tr><tr><td>St</td><td>The selected clients set in the t-th iteration</td></tr></table>

# 3.2 Federated Learning

In an $\mathrm { F L }$ scenario involving $m$ clients,each clientiholds a local dataset $X _ { i }$ consisting of $n _ { i }$ data samples drawn from the distribution $\mathcal { D } _ { i }$ .These clients collaborate through a central server to jointly train a model $\pmb { u }$ that minimizes empirical risk as follows [48]:

$$
\operatorname* { m i n } _ { \pmb { u } } \left\{ \sum _ { i = 1 } ^ { m } \alpha _ { i } f _ { i } ( \pmb { u } ) : = \sum _ { i = 1 } ^ { m } \alpha _ { i } \mathbb { E } _ { \pmb { x } \sim \mathcal { D } _ { i } } \left[ \ell _ { i } ( \pmb { u } ; \pmb { x } ) \right] \right\} ,
$$

where $\alpha _ { i }$ isaweight parameter, typically chosen as either $1 / m$ or $n _ { i } / n$ where $\begin{array} { r } { n = \sum _ { i = 1 } ^ { m } n _ { i } } \end{array}$ representsthetotaldatanumber, $_ x$ denotes a random sample from $\mathcal { D } _ { i }$ ， $\ell _ { i } ( u ; x )$ is the loss function for the model $\pmb { u }$ with respect to the sample $_ { x }$ ,and $f _ { i } ( \pmb { u } ) : = \mathbb { E } _ { \pmb { x } \sim \mathcal { D } _ { i } } \left[ \ell _ { i } ( \pmb { u } ; \pmb { x } ) \right]$ represents the expected loss over the data distribution $\mathcal { D } _ { i }$ . In this paper, we consider $f _ { i } ( { \pmb u } )$ to be possibly non-convex.

# 3.3Alternating Direction Method of Multipliers

ADMMis an optimization method within the augmented Lagrangian framework, ideally suited for addressing the following problem [11]:

$$
\operatorname* { m i n } _ { \pmb { u } \in \mathbb { R } ^ { r } , \pmb { v } \in \mathbb { R } ^ { q } } f ( \pmb { u } ) + g ( \pmb { v } ) , \quad \mathrm { s . t . } A \pmb { u } + B \pmb { v } - \pmb { b } = \pmb { 0 } ,
$$

where $A \in \mathbb { R } ^ { p \times r }$ ， $B \in \mathbb { R } ^ { p \times q }$ ,and $\boldsymbol { b } \in \mathbb { R } ^ { p }$ . We directly give the augmented Lagrangian function of the problem as follows,

$$
\mathcal { L } ( u , v , \pi ) : = f ( u ) + g ( v ) + \langle \pi , A u + B v - b \rangle + \frac { \rho } { 2 } | | A u + B v - b | | ^ { 2 } ,
$$

where $\pmb { \pi } \in \mathbb { R } ^ { p }$ is the dual variable,and $\rho > 0$ is the penalty parameter.After initializing the variables with $( { \pmb u } ^ { 0 } , { \pmb v } ^ { 0 } , \pmb { \pi } ^ { 0 } )$ ,ADMM iteratively performs the following steps:

$$
\left\{ \begin{array} { l l } { \pmb { u } ^ { t + 1 } = \mathrm { a r g m i n } _ { \pmb { u } \in \mathbb { R } ^ { r } } \mathcal { L } ( \pmb { u } , \pmb { v } ^ { t } , \pmb { \pi } ^ { t } ) , } \\ { \pmb { v } ^ { t + 1 } = \mathrm { a r g m i n } _ { \pmb { v } \in \mathbb { R } ^ { q } } \mathcal { L } ( \pmb { u } ^ { t + 1 } , \pmb { v } , \pmb { \pi } ^ { t } ) , } \\ { \pmb { \pi } ^ { t + 1 } = \pmb { \pi } ^ { t } + \rho ( A \pmb { u } ^ { t + 1 } + B \pmb { v } ^ { t + 1 } - b ) . } \end{array} \right.
$$

ADMM offers effective distributed and parallel computing capabilities, effciently addresses equality-constrained problems,and guarantees global convergence [67]. This makes it especially suitable

![](images/269ba9388893da0005983964b76b623b3309136b7cd117846008bb94c810a729.jpg)  
Figure 2: Three examples of partial model personalization in deep neural networks,where $_ { v _ { i } }$ and $\pmb { u }$ represent the personalized and shared models, respectively.

for large-scale optimization tasks and widely used in distributed computing [11] and machine learning [74].

# 3.4Partial Model Personalization

Partial model personalization allows clients to make personalized adjustments based on the shared global model.Pillutla et al. [52] categorized current methods for partial model personalization in deep neural networks into three types based on their applications:

·Input personalization: The lower layers are trained locally, and the upper layers are shared among clients. · Output personalization: The upper layers are trained locally and the lower layers are shared among clients. · Split input personalization: The input layers are divided horizontally into a shared and a personal part,which processes different portions of the input vector,and their outputs are concatenated before being passed to the upper layers of the model.

In Figure 2,we present examples of three partial model personalization strategies. Input personalization can be seen as learning a shared representation among different clients [19,42].Despite heterogeneous data with different labels,tasks may share common features,like those in various image types or word-prediction tasks [7,37].After learning this representation, each client's labels can be predicted with a linear classifier or shallow neural network [19]. Output personalization is applicable to various tasks [4],such as personalized image aesthetics [53] and personalized highlight detection [2o],where explicit user features are absent from the data and must be inferred during training.As a result, the same input data may receive different labels from different users,indicating that personalized models must vary across users to accurately predict distinct labels for similar test data. Split input personalization helps protect private user features by localizing their personalized embeddings on the device [52]. Similar architectures have been proposed for context-dependent language models [49].

# 4Proposed FedAPM

In this section,we begin by presenting the formulation of the optimization problem and defining the stationary points.Next,we offer a detailed algorithmic description of FedAPM.Finally,we discuss theadvantages of FedAPM compared to other FL frameworks.

# 4.1Problem Formulation

Let $V : = \{ v _ { i } \} _ { i = 1 } ^ { m }$ be a set ofpersonalized models and $\pmb { u }$ be the shared model. We consider solving the following optimization problem:

$$
\operatorname* { m i n } _ { V , u } \bigl \{ { f ( V , u ) : = \sum _ { i = 1 } ^ { m } \alpha _ { i } f _ { i } ( v _ { i } , u ) } \bigr \} ,
$$

where $\begin{array} { r } { f _ { i } ( v _ { i } , u ) : = \mathbb { E } _ { x \sim \mathcal { D } _ { i } } \left[ \ell _ { i } ( ( v _ { i } , u ) ; x ) \right] } \end{array}$ denotes the expected loss over the data distribution $\mathcal { D } _ { i }$ for the combined model $( \pmb { v } _ { i } , \pmb { u } )$ .The existing two types of methods for solving(2)are FedAltand FedSim [52],which are analogous to the Gauss-Seidel and Jacobi updates in numerical linear algebra [21],respectively.However,we found that these two methods can exacerbate client drift in the shared model (see Figure1,which will be validated in Section 6).To address this issue,we use ADMM to solve (2),and we discuss the advantages of using ADMM in Section 4.4.We introduce auxiliary variables $\pmb { U } : = \{ \pmb { u } _ { i } \} _ { i = 1 } ^ { m }$ to transform (2)intoaseparableform(withrespect to a partition or splitting of the variable into multi-block variables):

$$
\operatorname* { m i n } _ { V , U , u } \big \{ f ( V , U ) : = \sum _ { i = 1 } ^ { m } \alpha _ { i } f _ { i } ( v _ { i } , u _ { i } ) \big \} , ~ \mathrm { s . t . } ~ u _ { i } = u , ~ i \in [ m ] .
$$

Note that (3) is equivalent to (2)in the sense that the optimal solutions coincide (discussed in Section 4.2). To apply ADMM for (3), we define the augmented Lagrangian function as follows:

$$
\begin{array} { l } { \displaystyle \mathcal { L } ( V , U , \Pi , u ) : = \displaystyle \sum _ { i = 1 } ^ { m } \mathcal { L } _ { i } ( v _ { i } , u _ { i } , \pi _ { i } , u ) , } \\ { \displaystyle \mathcal { L } _ { i } ( v _ { i } , u _ { i } , \pi _ { i } , u ) : = \alpha _ { i } f _ { i } ( v _ { i } , u _ { i } ) + \langle \pi _ { i } , u _ { i } - u \rangle + \frac { \rho } { 2 } \| u _ { i } - u \| ^ { 2 } , } \end{array}
$$

where $\Pi : = \{ \pmb { \pi } _ { i } \} _ { i = 1 } ^ { m }$ denotes the set of dual variables, and $\rho > 0$ represents the penalty parameter. The ADMM algorithm to solve (3)can be outlined as follows:starting from arbitrary initialization $( V ^ { 0 } , { \cal U } ^ { 0 } , \Pi ^ { 0 } , { \pmb u } ^ { 0 } )$ ,the update is iteratively performed for each $t \geq 0$ ：

$$
\begin{array} { r } { \left\{ \begin{array} { l l } { v _ { i } ^ { t + 1 } = \operatorname { a r g m i n } _ { v _ { i } } \mathcal { L } _ { i } ( v _ { i } , u _ { i } ^ { t } , \pi _ { i } ^ { t } , u ^ { t } ) , } \\ { \displaystyle u _ { i } ^ { t + 1 } = \operatorname { a r g m i n } _ { u _ { i } } \mathcal { L } _ { i } ( v _ { i } ^ { t + 1 } , u _ { i } , \pi _ { i } ^ { t } , u ^ { t } ) , } \\ { \displaystyle \pi _ { i } ^ { t + 1 } = \pi _ { i } ^ { t } + \rho ( u _ { i } ^ { t + 1 } - u ^ { t } ) , } \\ { \displaystyle u ^ { t + 1 } = \operatorname { a r g m i n } _ { u } \mathcal { L } ( V ^ { t + 1 } , U ^ { t + 1 } , \Pi ^ { t + 1 } , u ) } \\ { \displaystyle \quad \quad = \frac { 1 } { m } \sum _ { i = 1 } ^ { m } ( u _ { i } ^ { t + 1 } + \frac { 1 } { \rho } \pi _ { i } ^ { t + 1 } ) . } \end{array} \right. } \end{array}
$$

Due to the potentially non-convex nature of $f _ { i }$ ,closed-form solutions for $\pmb { u } _ { i }$ and $\boldsymbol { v } _ { i }$ may not exist.We will provide an approach to address this issue later in Section 4.3.

# 4.2Stationary Points

We define the optimal conditions of (3)as follows:

Definition 1 (Stationary point). $A$ point $( V ^ { * } , U ^ { * } , \pmb { u } ^ { * } , \Pi ^ { * } )$ is a stationary point of (3) if it satisfies

$$
\begin{array} { r } { \left\{ \begin{array} { l l } { \displaystyle \alpha _ { i } \nabla _ { u _ { i } } f _ { i } ( v _ { i } ^ { * } , u _ { i } ^ { * } ) + \boldsymbol { \pi } _ { i } ^ { * } + \rho ( u _ { i } ^ { * } - u ^ { * } ) = 0 , \quad i \in [ m ] , } \\ { \displaystyle \nabla _ { v _ { i } } f _ { i } ( v _ { i } ^ { * } , u _ { i } ^ { * } ) = 0 , \quad i \in [ m ] , } \\ { \displaystyle u _ { i } ^ { * } - u ^ { * } = 0 , \quad i \in [ m ] , } \\ { \displaystyle \sum _ { i = 1 } ^ { m } \boldsymbol { \pi } _ { i } ^ { * } = 0 . } \end{array} \right. } \end{array}
$$

# Algorithm 1: FedAPM

Input: $T :$ communication rounds, $\rho$ : penalty parameter, $m$ ： number of clients, $X _ { i }$ : local dataset, $\sigma _ { i }$ : hyperparameter.

Output: $\left\{ \boldsymbol { v } _ { i } \right\} _ { i = 1 } ^ { m }$ (personalized), $\left\{ { \pmb u } _ { i } \right\} _ { i = 1 } ^ { m }$ (local), $\pmb { u }$ (shared).

1 Initialize: $\begin{array} { r } { v _ { i } ^ { 0 } , u _ { i } ^ { 0 } , \pi _ { i } ^ { 0 } , z _ { i } ^ { 0 } = u _ { i } ^ { 0 } + \frac { 1 } { \rho } \pi _ { i } ^ { 0 } , \xi _ { i } ^ { 0 } , \mu _ { i } \in ( 0 , 1 ) , i \in [ m ] . } \end{array}$   
2 for $t = 0 , 1 , \cdots , T - 1$ do

Weights upload: Allclients send $z _ { i } ^ { t }$ to the server ;

Weights average: Server aggregates $z _ { i } ^ { t }$ by

$$
{ \pmb u } ^ { t } = \frac { 1 } { m } \sum _ { i = 1 } ^ { m } z _ { i } ^ { t } .
$$

Weights feedback: Broadcast ${ \mathbf { } } u ^ { t }$ to all clients;

Client selection: Randomly select $s$ clients $S ^ { t } \subset [ m ]$ ；

# for each client $i \in S ^ { t }$ do

Local update: client $i$ update its parameters as follows:

$$
\begin{array} { r l } & { \boldsymbol { v } _ { i } ^ { t + 1 } = \operatorname * { a r g m i n } _ { \boldsymbol { v } _ { i } } f _ { i } ( \boldsymbol { v } _ { i } , \boldsymbol { u } _ { i } ^ { t } ) + \displaystyle \frac { \sigma _ { i } } { 2 } \| \boldsymbol { v } _ { i } - \boldsymbol { v } _ { i } ^ { t } \| ^ { 2 } , } \\ & { \xi _ { i } ^ { t + 1 } \leq \mu _ { i } \xi _ { i } ^ { t } , } \end{array}
$$

Find a $\xi _ { i } ^ { t + 1 }$ -approximate solution $\pmb { u } _ { i } ^ { t + 1 }$ (Definition 2),

$$
\begin{array} { l } { { \pmb \pi } _ { i } ^ { t + 1 } = { \pmb \pi } _ { i } ^ { t } + \rho ( { \pmb u } _ { i } ^ { t + 1 } - { \pmb u } ^ { t } ) , } \\ { \quad \qquad z _ { i } ^ { t + 1 } = { \pmb u } _ { i } ^ { t + 1 } + \displaystyle \frac { 1 } { \rho } { \pmb \pi } _ { i } ^ { t + 1 } } \end{array}
$$

9

10

for each client $i \notin S ^ { t }$ do

Local invariance: client $i$ keep its parameters as follows:

11 return

$$
\begin{array} { r l } & { ( \zeta _ { i } ^ { t + 1 } , v _ { i } ^ { t + 1 } , \pmb { u } _ { i } ^ { t + 1 } , \pmb { \pi } _ { i } ^ { t + 1 } , \pmb { z } _ { i } ^ { t + 1 } ) = ( \zeta _ { i } ^ { t } , v _ { i } ^ { t } , \pmb { u } _ { i } ^ { t } , \pmb { \pi } _ { i } ^ { t } , \pmb { z } _ { i } ^ { t } ) . } \\ & { \{ v _ { i } ^ { T } \} _ { i = 1 } ^ { m } , \{ \pmb { u } _ { i } ^ { T } \} _ { i = 1 } ^ { m } , \pmb { u } ^ { T } . } \end{array}
$$

If $f _ { i }$ is convex with respect to $\boldsymbol { v } _ { i }$ and $\pmb { u } _ { i }$ for any $i \in [ m ]$ ,then a point is a globally optimal solution if and only if it satisfies (6). Moreover, a stationary point $( V ^ { * } , U ^ { * } , \pmb { u } ^ { * } , \Pi ^ { * } )$ of (3) indicates that

$$
\left\{ \sum _ { i = 1 } ^ { m } \alpha _ { i } \nabla _ { u } f _ { i } ( v _ { i } ^ { * } , u ^ { * } ) = 0 , \right.
$$

That is, $( V ^ { * } , \pmb { u } ^ { * } )$ is also a stationary point of (2).

# 4.3Algorithmic Design

In Algorithm 1,we present the details of FedAPM.Figure 3 shows a running example of FedAPM.The algorithm is divided into two parts,which are executed on the clients and the server,respectively.

· Server update: First, the clients upload their locally computed parameters $z _ { i } ^ { t }$ to the server (Line 3). The server aggregates these parameters to obtain the shared model ${ \mathbf { } } u ^ { t }$ (Line 4),and then broadcasts ${ \mathbf { } } u ^ { t }$ to each client (Line 5). Next, the clients are randomly divided into two groups (Line 6).For the clients in $S ^ { t }$ ， they perform a local update, while the clients not in $S ^ { t }$ keep their local parameters unchanged.

· Client update: The clients in $S ^ { t }$ update the model parameters locally (Line 8). Due to the possible non-convex nature of $f _ { i }$ we propose using proximal update strategies for solving $\boldsymbol { v } _ { i }$ and $\pmb { u } _ { i }$ Specifically,we consider solving $\boldsymbol { v } _ { i }$ by adding a proximal term to the augmented Lagrangian function such that the new function is convex with respect to $_ { v _ { i } }$ ,that is

$$
v _ { i } ^ { t + 1 } = \mathrm { a r g m i n } _ { \upsilon _ { i } } \mathcal { L } _ { i } ( v _ { i } , u _ { i } ^ { t } , \pi _ { i } ^ { t } , u ^ { t } ) + \frac { \sigma _ { i } } { 2 } \| v _ { i } - v _ { i } ^ { t } \| ^ { 2 } ,
$$

where $\sigma _ { i }$ isa hyperparameter employed to control the degree of approximation between $\boldsymbol { v } _ { i }$ and $\boldsymbol { \upsilon } _ { i } ^ { t }$ .The purpose of using proximal update strategies is to effectively stabilize the training process [73].For each subproblem involving $\boldsymbol { v } _ { i }$ ,we assume the minimizer can be achieved.In a similar vein, to solve for $\pmb { u } _ { i }$ , we consider applying stochastic gradient descent (SGD) to obtain an approximate solution for $\pmb { u } _ { i }$ ,defined as follows:

Definition 2 ( $\xi$ Approximate solution). For $\xi _ { i } ^ { t + 1 } \in ( 0 , 1 )$ , we say isa $\xi _ { i } ^ { t + 1 }$ -approximate solution of $\begin{array} { r } { \operatorname* { m i n } _ { \pmb { u } _ { i } } \mathcal { L } _ { i } ( \pmb { \upsilon } _ { i } ^ { t + 1 } , \pmb { u } _ { i } , \pmb { \pi } _ { i } ^ { t } , \pmb { u } ^ { t } ) } \end{array}$ if

$$
\begin{array} { r } { \| \alpha _ { i } \nabla _ { u _ { i } } f _ { i } ( v _ { i } ^ { t + 1 } , \pmb { u } _ { i } ^ { t + 1 } ) + \pi _ { i } ^ { t } + \rho ( \pmb { u } _ { i } ^ { t + 1 } - \pmb { u } ^ { t } ) \| ^ { 2 } \leq \xi _ { i } ^ { t + 1 } . } \end{array}
$$

Note that a smaller $\xi _ { i } ^ { t + 1 }$ corresponds to higher accuracy.

SGD is commonly used to compute approximate solutions in a finite number of iterations and is applied in many FL frameworks [23,41, 79].Note that we set the local accuracy level at each iteration as $\xi _ { i } ^ { t + 1 } \le \mu _ { i } \xi _ { i } ^ { t }$ .In the earlystages ofalgorithmiteration, when the solution is far from stationary points,seting a larger $\xi _ { i }$ can effectively reduce the number of iterations and improve effciency.As iterations increase,the solution gets closer to the stationarypoints.Therefore,reducing $\xi _ { i }$ can improve the accuracy.After computing $_ { v _ { i } }$ and $\pmb { u } _ { i }$ ,we follow from (5) to update the dual variable $\pmb { \pi } _ { i }$ and calculate the update messages $z _ { i }$ that will be uploaded to the server.For those clients that are not in $S ^ { t }$ ,the local parameters remain unchanged (Lie 10).

# 4.4 Discussions

In this section,we provide an intuitive discussion on why partial model personalization can exacerbate client drift in the shared model.Furthermore,we highlight the superiority of FedAPM in addressing client drift,as well as its improved convergence stability and effciency compared to FedAlt and FedSim.

In input personalization,the personalized module processes the rawinput before it reaches the shared model.As a result, each client's personalized transformation alters the input distribution seen by the shared model.Due to heterogeneity in client data and personalized modules,the shared model receives inconsistent and client-specific inputs,which leads to misaligned optimization objectives across clients.This discrepancy causes the shared model to drift,as it is effectively optimizing fora different feature space on each client.In output personalization,it is the backpropagated gradients from the personalized layers that influence the shared layers.Since these gradients are conditioned on personalized outputs (e.g.,client-specific classification heads),they differ across clients even for similar inputs,thereby causing divergence in the shared representation layer updates.

FedAPM can be considered a generalFL framework,while FedAlt and FedSim are special cases of FedAPM. Specifically,when the dual variables $\pmb { \pi } _ { i } , i \in [ m ]$ and the penalty parameter $\rho$ are set to 0,and the initial values of $\pmb { u } _ { i }$ are set to ${ \mathbf { } } u ^ { t }$ in the corresponding subproblem,FedAPM reduces to FedAlt and FedSim.Therefore,FedAlt and FedSim can be interpreted as FL approaches that solve (3) through penalty methods.However,client drift arises in these methods:

![](images/ee88111dede948d2f0906672932b6975c6f8a7be2697b68ff499b19d14aeca79.jpg)  
Figure 3:Arunning exampleof FedAPM.Differentclients may posess heterogeneous or multimodaldata.Each clientupdates its local parameters using local data and uploads $z _ { i }$ to the server, which then updates and broadcasts $\pmb { u }$ to all clients.

each client optimizes its own objective rather than the global one due to differing local objectives,which could hinder convergence or even lead to divergence.While increasing $\rho$ can mitigate this issue,it introduces another challenge: for ill-conditioned problems, an excessively large $\rho$ is required to enforce constraints effectively. This,in turn,may result in numerical instability during optimization,as demonstrated in [51].This issue is particularly problematic in the FL optimization,where the number of constraints $m$ further increases the condition number of the objective function's Hessian matrix, exacerbating the risk of ill-conditioning.

In FedAPM, the second-order term provides a fixed correction for the update of $\pmb { u } _ { i }$ ,causing the gradient descent direction of $\pmb { u } _ { i }$ to shift towards $\pmb { u }$ bya fixed value $\rho ( { \pmb u } _ { i } - { \pmb u } )$ ,while the first-order termallows the gradient descent direction of $\pmb { u } _ { i }$ to shift towards $\pmb { u }$ byavariable value $\pmb { \pi } _ { i }$ ,thereby providing compensation that brings $\pmb { u } _ { i }$ closer to $\pmb { u }$ and effectively addressing the issue of client drift.Moreover, the update of the dual variables corrects the bias in constraint violations,allowing ADMM to avoid relying on large $\rho$ to enforce the constraints, thus preventing ill-conditioning.

# 5Convergence Analysis

We aim to establish the global convergence and convergence rate for FedAPM, starting with the assumptions used in our analysis.

# 5.1 Main Assumptions

We present the definitions of graph,semicontinuous,real analytic, and semialgebraic functions,which are utilized in our assumptions.

Definition 3 (Graph). Let $f : \mathbb { R } ^ { p }  \mathbb { R } \cup \{ + \infty \}$ be an extended real-valued function,its graph is defined by

$$
G r a p h ( f ) : = \{ ( x , y ) \in \mathbb { R } ^ { p } \times \mathbb { R } : y = f ( x ) \} ,
$$

and its domain is defined by don $\iota ( f ) : = \{ \pmb { x } \in \mathbb { R } ^ { p } : f ( \pmb { x } ) < + \infty \}$ $_ { I f f }$ is a proper function,i.e., $d o m ( f ) \neq 0$ ,thenthe setof itsglobal minimizers is definedby argmin $f : = \{ \pmb { x } \in \mathbb { R } ^ { p } : f ( \pmb { x } ) = \operatorname* { i n f } f \}$

Definition 4 (Semicontinuous [8]). A function $f : X \to \mathbb { R }$ is lower semicontinuous if for any $x _ { 0 } \in \mathcal { X }$ , $\operatorname* { l i m } _ { x \to x _ { 0 } }$ inf $f ( x ) \geq f ( x _ { 0 } )$

Definition 5 (Real analytic [33]).A function $f$ is real analytic on an open set $\chi$ in thereallineiffor any $x _ { 0 } \in X , f ( x )$ can be represented

as $\textstyle f ( x ) = \sum _ { i = 1 } ^ { + \infty } a _ { i } ( x - x _ { 0 } ) ^ { i }$ where $\{ a _ { i } \} _ { i = 1 } ^ { + \infty }$ are real numbers and the series is convergent to $f ( x )$ for $x$ in a neighborhoodof $\cdot _ { x _ { 0 } }$

Definition 6 (Semialgebraic set and function [8]).

a $A$ set $\chi$ is called semialgebraic ifit can be represented by

$$
\begin{array} { r } { \big \chi = \cup _ { i = 1 } ^ { r } \cap _ { j = 1 } ^ { s } \{ \pmb { x } \in \mathbb { R } ^ { p } : P _ { i j } ( \pmb { x } ) = 0 , Q _ { i j } ( \pmb { x } ) > 0 \} , } \end{array}
$$

where $P _ { i j } ( \cdot )$ and $Q _ { i j } ( \cdot )$ are real polynomial functions for $1 \leq i \leq r$ and $1 \leq j \leq s$

b）Afunction $f$ is called semialgebraic $i f G r a p h ( f )$ is semialgebraic.

As highlighted in [8,45,58],semialgebraic sets are closed under several operations,including finite unions,finite intersections, Cartesian products,and complements.Typical examples include polynomial functions,indicator functions of a semialgebraic set, and Euclidean norm.In the following,we outline the assumptions employed in our convergence analysis.

Assumption 1. Suppose the expected loss functions $f _ { i }$ ， $i \in [ m ]$ are a) proper lower semicontinuous and nonnegative functions, and $b$ ）either real analytic or semialgebraic.

Assumption 2 (Gradient Lipschitz continuity).For each $i \in [ m ]$ ， theexpected loss function $f _ { i } ( \pmb { \upsilon } _ { i } , \pmb { u } )$ is continuouslydifferentiable.There exist constants $L _ { u }$ ， $L _ { v }$ ， $L _ { u v }$ ， $L _ { v u }$ such that for each $i \in [ m ]$ ：

· $\nabla _ { { \pmb v } _ { i } } f _ { i } ( { \pmb v } _ { i } , { \pmb u } _ { i } )$ is $L _ { v }$ -Lipschitz with respect to $_ { v _ { i } }$ and $L _ { v u }$ -Lipschitz with respect to $\pmb { u } _ { i }$ ,i.e.

$$
\begin{array} { r l } & { \| \nabla _ { v _ { i } } f _ { i } ( v _ { 1 } , u _ { i } ) - \nabla _ { v _ { i } } f _ { i } ( v _ { 2 } , u _ { i } ) \| \leq L _ { v } \| v _ { 1 } - v _ { 2 } \| , } \\ & { \| \nabla _ { v _ { i } } f _ { i } ( v _ { i } , u _ { 1 } ) - \nabla _ { v _ { i } } f _ { i } ( v _ { i } , u _ { 2 } ) \| \leq L _ { v u } \| u _ { 1 } - u _ { 2 } \| , } \end{array}
$$

· $\nabla _ { u _ { i } } f _ { i } ( v _ { i } , \pmb { u } _ { i } )$ is $L _ { u }$ -Lipschitz with respect to $\pmb { u } _ { i }$ and $L _ { u v }$ -Lipschitz with respect to $_ { v _ { i } }$ ,i.e.

$$
\begin{array} { r l } & { \| \nabla _ { u _ { i } } f _ { i } ( v _ { i } , u _ { 1 } ) - \nabla _ { u _ { i } } f _ { i } ( v _ { i } , u _ { 2 } ) \| \leq L _ { u } \| u _ { 1 } - u _ { 2 } \| , } \\ & { \| \nabla _ { u _ { i } } f _ { i } ( v _ { 1 } , u _ { i } ) - \nabla _ { u _ { i } } f _ { i } ( v _ { 1 } , u _ { i } ) \| \leq L _ { u v } \| v _ { 1 } - v _ { 2 } \| , } \end{array}
$$

Assumption 3.The expected loss functions $f _ { i } , i \in [ m ]$ are coercive1.

According to [8,33,45,58],common loss functions such as squared,logistic,hinge,and cross-entropy losses can be verified to satisfy Assumption 1.Assumption 2 is a standard assumption in the convergence analysis ofFL,as noted in [52]. Assumption 3 is widely applied to establish the convergence properties of optimization algorithms,as shown in [73,74,80]. Our assumptions are weaker than those used by FedAlt and FedSim [52],which include gradient Lipschitz continuity, bounded variance,and bounded diversity.

# 5.2Global Convergence

Our global convergence analysis builds upon the analytical framework presented in [6],which relies on four essential components: the establishment of sufficient descent and relative error conditions, along with the verification of the continuity condition and the $K E$ property of the objective function. Let $\mathscr { P } ^ { t } : = ( V ^ { t } , U ^ { t } , \Pi ^ { t } , \pmb { u } ^ { t } )$ we define the Lyapunov function $\tilde { \mathcal { L } } ( \mathcal { P } ^ { t } )$ by adding to the original augmented Lagrangian the accuracy level of each $\pmb { u } _ { i } ^ { t }$ ：

$$
\tilde { \mathcal { L } } ( \mathcal { P } ^ { t } ) : = \mathcal { L } ( \mathcal { P } ^ { t } ) + \sum _ { i = 1 } ^ { m } \frac { 2 9 } { \rho ( 1 - \mu _ { i } ) } \xi _ { i } ^ { t } .
$$

With the Lyapunov function established,we can demonstrate that the sequence generated by ADMM converges to the stationary points defined in (7)and(6)(see Theorem 2).Below, we present the two key lemmas,with additional details provided in the Appendix. Specifically,the verification of the KL property for FL training models satisfying Assumption 1 is outlined in Proposition 1(Appendix A.2),while the verification of the continuity condition is naturally satisfied by Assumption 1. Using Lemmas 1 and 2,Proposition 1, and Assumption 1,we establish Theorem 2.

Lemma 1(Suffcient Descent). Suppose that Assumption 2 holds.Let $\{ \mathcal P ^ { t } \}$ denote the sequence generated by Algorithm 1; let each client set the hyperparameters such that $\begin{array} { r } { \operatorname* { m a x } \{ 3 \alpha _ { i } \bar { L } _ { u } , 3 \alpha _ { i } L _ { u v } \} \le \rho \le \frac { 1 5 } { 8 } \sigma _ { i } , } \end{array}$ then for all $t \geq 0$ ,itholds that

$$
\begin{array} { r l } & { \tilde { \mathcal { L } } ( \mathcal { P } ^ { t } ) - \tilde { \mathcal { L } } ( \mathcal { P } ^ { t + 1 } ) \geq a \Sigma _ { p } ^ { t + 1 } , w h e r e \ a : = \operatorname* { m i n } \{ \displaystyle \frac { \rho } { 6 0 } , \displaystyle \frac { \sigma _ { i } } { 2 } - \frac { 4 \rho } { 1 5 } \} } \\ & { a n d \Sigma _ { p } ^ { t + 1 } : = \displaystyle \sum _ { i = 1 } ^ { m } ( \| v _ { i } ^ { t + 1 } - v _ { i } ^ { t } \| ^ { 2 } + \| u _ { i } ^ { t + 1 } - u _ { i } ^ { t } \| ^ { 2 } + \| u ^ { t + 1 } - u ^ { t } \| ^ { 2 } ) . } \end{array}
$$

Lemma2 (Relative Error).Suppose that Assumption2 holds.Let $\{ \mathcal P ^ { t } \}$ denoteteeeed $\textstyle t \Xi ^ { t } : = \sum _ { i = 1 } ^ { m } \xi _ { i } ^ { t }$ $\tilde { \Xi } ^ { t + 1 } : = \Xi ^ { t + 1 } - \Xi ^ { t }$ ,and let each client setthe hyperparameters such that $\sigma _ { i } \geq \alpha _ { i } L _ { v }$ and $\begin{array} { r } { \operatorname* { m a x } \{ 3 \alpha _ { i } L _ { u } , 3 \alpha _ { i } L _ { u v } \} \le \rho \stackrel {  } { \le } \frac { 1 5 } { 8 } \sigma _ { i } } \end{array}$ ,then for all $t \geq 0$ ,thefollowing result holds:

$$
d i s t ( 0 , \partial \mathcal { L } ( \mathcal { P } ^ { t } ) ) ^ { 2 } \leq b ( \Sigma _ { \hat { p } } ^ { t + 1 } + \tilde { \Xi } ^ { t + 1 } ) ,
$$

where $\begin{array} { r } { \cdot b : = \operatorname* { m a x } \{ \frac { 2 2 } { 5 } \sigma _ { i } ^ { 2 } + \frac { 4 } { 3 } \rho ^ { 2 } + \frac { 8 \rho } { 1 5 } , \frac { 1 6 } { 3 } \rho ^ { 2 } + 2 + \frac { 8 \rho } { 1 5 } , \frac { 4 8 + 4 \rho } { \rho ( 1 - \mu _ { i } ) } \} , d i s t ( 0 , C ) : = } \end{array}$ $\operatorname { i n f } _ { c \in C } \left\| c \right\|$ for a set $c$ ,and

$$
\begin{array} { r } { \partial \mathcal { L } ( \mathcal { P } ^ { t } ) : = ( \{ \nabla _ { v _ { i } } \mathcal { L } \} _ { i = 1 } ^ { m } , \{ \nabla _ { u _ { i } } \mathcal { L } \} _ { i = 1 } ^ { m } , \{ \nabla _ { \pi _ { i } } \mathcal { L } \} _ { i = 1 } ^ { m } , \{ \nabla _ { u } \mathcal { L } \} ) ( \mathcal { P } ^ { t } ) . } \end{array}
$$

Note that the relative error condition contains an error term $\tilde { \Xi } ^ { t + 1 }$ on the right-hand side of the inequality.The existing theoretical frameworks [6,67,74] cannot account for this error term.In the following, we present an analysis framework of global convergence that incorporates this error term.

Theorem1.Suppose thatAssumption2 holds,leteachclient set the hyperparameters such that $\begin{array} { r } { \operatorname* { m a x } \{ 3 \alpha _ { i } L _ { u } , 3 \alpha _ { i } L _ { u v } \} \le \rho \le \frac { 1 5 } { 8 } \sigma _ { i } } \end{array}$ and $\sigma _ { i } \geq \alpha _ { i } L _ { v }$ ,then the following results hold.

a) Sequence $\{ \mathcal P ^ { t } \}$ is bounded.

b） The gradients of $f ( V ^ { t + 1 } , U ^ { t + 1 } )$ and $f ( V ^ { t + 1 } , \pmb { u } ^ { t + 1 } )$ with respect to each variable eventually vanish, i.e.,

$$
\begin{array} { r } { \underset { t  \infty } { \operatorname* { l i m } } \nabla _ { V } f ( V ^ { t + 1 } , \boldsymbol { u } ^ { t + 1 } ) = \underset { t  \infty } { \operatorname* { l i m } } \nabla _ { V } f ( V ^ { t + 1 } , \boldsymbol { U } ^ { t + 1 } )  0 , } \\ { \underset { t  \infty } { \operatorname* { l i m } } \nabla _ { \boldsymbol { u } } f ( V ^ { t + 1 } , \boldsymbol { u } ^ { t + 1 } ) = \underset { t  \infty } { \operatorname* { l i m } } \nabla _ { U } f ( V ^ { t + 1 } , \boldsymbol { U } ^ { t + 1 } )  0 . } \end{array}
$$

c) Sequences $\{ \tilde { \mathcal { L } } ( \mathcal { P } ^ { t } ) \} , \{ \mathcal { L } ( \mathcal { P } ^ { t } ) \} , \{ f ( V ^ { t } , U ^ { t } ) \}$ and $\{ f ( V ^ { t } , u ^ { t } ) \}$ converge to the same value, i.e.,

$$
\operatorname* { l i m } _ { t \to \infty } \tilde { \mathcal { L } } ( \mathscr { P } ^ { t } ) = \operatorname* { l i m } _ { t \to \infty } \mathcal { L } ( \mathscr { P } ^ { t } ) = \operatorname* { l i m } _ { t \to \infty } f ( V ^ { t } , U ^ { t } ) = \operatorname* { l i m } _ { t \to \infty } f ( V ^ { t } , u ^ { t } ) .
$$

Theorem 1 establishes the convergence of the objective function. Next, we establish the convergence properties of the sequence $\{ \mathcal P ^ { t } \}$

Theorem 2.Suppose that Assumptions 2 and 3 hold,let each client i ${ \textstyle \frac { 1 5 } { 8 } } \sigma _ { i }$ tehd $\sigma _ { i } \geq \alpha _ { i } L _ { v }$ etres shg stat $\operatorname* { m a x } \{ 3 \alpha _ { i } L _ { u } , 3 \alpha _ { i } L _ { u v } , 2 L _ { u } \} \le \rho \le$ a） The accumulating point $\mathcal { P } ^ { \infty }$ ofsequences $\{ \mathcal P ^ { t } \}$ is a stationary point of (3), and $( V ^ { \infty } , \pmb { u } ^ { \infty } )$ is a stationary point of (2). b) Under Assumption 1, the sequence $\{ \mathcal P ^ { t } \}$ converges to $\mathcal { P } ^ { \infty }$

Note that the proof of Theorem 2 does not depend on the convexity of the loss function $f _ { i }$ . As a result, the sequence will reach a stationary point for (3) and (2).Moreover,if we assume that $f _ { i }$ is convex, the sequence will converge to the optimal solutions.

# 5.3 Convergence Rate

We establish the convergence rates when $\tilde { \mathcal { L } }$ has $\mathrm { K L }$ properties with a desingularizing function $\begin{array} { r } { \phi ( x ) = \frac { \sqrt { c } } { 1 - \theta } x ^ { 1 - \theta } } \end{array}$ x1-θ (see Definition 7 and 9 in Appendix A.2),where $c > 0$ and $\theta \in \left[ 0 , 1 \right)$ .We elaborate in Proposition 1 that most functions in FL are $\mathrm { K L }$ functions.

Theorem 3. Let $\{ \mathcal P ^ { t } \}$ be the sequence generated by Algorithm1,and $\mathcal { P } ^ { \infty }$ be its limit, then under Assumptions 1,2,and 3,let each client set the hyperparameters $\begin{array} { r } { \operatorname* { m a x } \{ 3 \alpha _ { i } \bar { L _ { u } } , 3 \alpha _ { i } L _ { u v } , 2 L _ { u } \} \le \rho \le \frac { 1 5 } { 8 } \sigma _ { i } } \end{array}$ and $\sigma _ { i } \geq \alpha _ { i } L _ { v }$ ,thefollowingresults hold:

a)If $\theta = 0$ ,then there exists a $t _ { 1 }$ such that the sequence $\{ \tilde { \mathcal { L } } ( \mathcal { P } ^ { t } ) \}$ ， $t \geq t _ { 1 }$ converges in $a$ finite number of iterations.

$b$ If $\theta \in \left( 0 , 1 / 2 \right]$ , then there exists a $t _ { 2 }$ such that for any $t \geq t _ { 2 }$ ，

$$
\tilde { \mathcal { L } } ( \mathcal { P } ^ { t + 1 } ) - \tilde { \mathcal { L } } ( \mathcal { P } ^ { \infty } ) \leq \biggl ( \frac { b c } { a + b c } \biggr ) ^ { t - t _ { 2 } + 1 } \Bigl ( \tilde { \mathcal { L } } ( \mathcal { P } ^ { t _ { 2 } } ) - f ^ { * } \Bigr ) + ( a + b c ) \Xi ^ { t _ { 2 } - 1 } .
$$

c） $H f \theta \in \left( 1 / 2 , 1 \right)$ , then there exists a $t _ { 3 }$ such that for any $t \geq t _ { 3 }$ ，

$$
\tilde { \mathcal { L } } ( \mathcal { P } ^ { t + 1 } ) - \tilde { \mathcal { L } } ( \mathcal { P } ^ { \infty } ) \leq \Big ( \frac { b c } { ( 2 \theta - 1 ) \kappa a ( t - t _ { 3 } ) } \Big ) ^ { \frac { 1 } { 2 \theta - 1 } } ,
$$

where $\kappa > 0$ is a constant.

Theorem 3 demonstrates that when $\theta = 0$ ,the convergence rate becomes constant. For $\theta \in ( 0 , 1 / 2 ]$ ,the rate is linear,while for $\theta \in \left( 1 / 2 , 1 \right)$ ,it is sublinear.Note that although Theorem 3 relies on Assumptions 1,2 and 3,these conditions are satisfied by most loss functions and are less restrictive compared to those in [52].

# 6Numerical Experiments

In this section,we compare the performance of FedAPM with SOTA methods and examine the effects of various parameters on FedAPM. Our codes are open-sourced².We present key design details and results,with complete content provided in Appendix B.

Table 2: An overview of the datasets (Acc and Gyro are abbreviations of Accelerometer and Gyroscope, respectively).   

<table><tr><td>Ref.</td><td>Datasets</td><td>Modalities</td><td># samples</td><td># clients</td></tr><tr><td>[34]</td><td>CIFAR10</td><td>Image</td><td>60,000</td><td>20</td></tr><tr><td>[3]</td><td>CrisisMMD</td><td>Image, Text</td><td>18,100</td><td>20</td></tr><tr><td>[59]</td><td>KU-HAR</td><td>Acc, Gyro</td><td>10,300</td><td>63</td></tr><tr><td>[13]</td><td>Crema-D</td><td>Audio, VIdeo</td><td>4,798</td><td>72</td></tr></table>

# 6.1 Setups

Datasets.We evaluate FedAPM as well as other comparable algorithms on four datasets from common heterogeneous and multimodalFL benchmarks [24,38],which are CIFAR10 [34],CrisisMMD [3],KU-HAR [59],and Crema-D [13]. Among these, CIFAR10 is unimodal,while the others are multimodal.For each client, the training and testing data are pre-specified: $8 0 \%$ of data is randomly extracted to construct a training set, keeping the remaining $2 0 \%$ as the testing set.Table 2 presentsan overview of the datasets.

Partitions.To incorporate data heterogeneity,we implement various data partitioning strategies as outlined in [24,38].For CIFAR10 and CrisisMMD,we allocate a portion of samples from each class to every client based on the Dirichlet distribution,which is commonly used for partitioning non-i.i.d.data [38].For Crema-D and KU-HAR, we partition data by the speaker and participant IDs,respectively.

Models.We provide different classification models for various datasets.Specifically,we employ a CNN-only model architecture for the image modality,an RNN-only model for the video and text modalities,and a Conv-RNN model for other modalities.

Metrics and Baselines.We use the accuracy, F1 score,AUC performance,training loss,gap between local and shared models,and communication rounds as metrics to measure the performance of each competing method.To demonstrate the empirical performance of our proposed method,we compare FedAPM with two state-ofthe-art personalization methods,FedAlt and FedSim [52],as well as two non-personalized methods,FedAvg [48] and FedProx [41].

# 6.2Comparison of Multiple Methods

For each competing algorithm,different hyperparameters need to be tuned.We provide several candidates for each hyperparameter and perform a grid search on all possible combinations based on the accuracy performance on the validation dataset.Further details on parameter settings can be found in Appendix B.3.

6.2.1Overall Comparison. Table 3 reports the top-1 accuracy,F1 score,and AUC for various methods.It can be observed that FedAPM outperforms all other methods across the datasets on most of the metrics.Specifically,compared to the best-performing method among the other four, FedAPM achieves an average improvement of $1 2 . 3 \%$ ， $1 6 . 4 \%$ ,and $1 8 . 0 \%$ in accuracy,F1 score,and AUC,respectively. This characteristic indicates that FedAPM is advantageous for FL applications involving heterogeneous or multimodal client data.

6.2.2Convergence and Communication Efficiency.Due to space limitations,we show the results on two datasets here with the full results left in Figure 8 in Appendix B.5.Figure 4 shows the variation in training loss across different methods as the communication rounds increase.First,it can be observed that the methods based on partial model personalization (FedAPM,FedAlt,FedSim) tend to converge more effectively compared to non-personalized methods (FedAvg and FedProx). Second, FedAPM demonstrates lower training loss compared to other methods and achieves faster convergence,highlighting its superior convergence performance. Finally,for a given loss,FedAPM reaches this target with fewer communication rounds, emphasizing its communication efficiency over other methods.

Table 3: Performance comparison of various methods across multiple datasets.We report the mean and standard deviation for top-1 Accuracy,F1 Score,and AUC over 20 trials.Bold values highlight the best performance for each metric.   

<table><tr><td>Datasets</td><td>Methods</td><td>Accuracy</td><td>F1 Score</td><td>AUC</td></tr><tr><td rowspan="5">CIFAR10</td><td>FedAPM</td><td>.738±.005</td><td>.725±.005</td><td>.873±.010</td></tr><tr><td>FedAvg</td><td>.435±.012</td><td>.345±.010</td><td>.602±.011</td></tr><tr><td>FedAlt</td><td>.672±.006</td><td>.649±.005</td><td>.839±.011</td></tr><tr><td>FedSim</td><td>.592±.005</td><td>.565±.004</td><td>.808±.010</td></tr><tr><td>FedProx</td><td>.406±.010</td><td>.307±.005</td><td>.571±.011</td></tr><tr><td rowspan="6">CrisisMMD</td><td>FedAPM</td><td>.357±.028</td><td>.294±.008</td><td>.519±.015</td></tr><tr><td>FedAvg</td><td>.374±.023</td><td>.288±.012</td><td>.510±.027</td></tr><tr><td>FedAlt</td><td>.364±.025</td><td>.289±.010</td><td>.513±.019</td></tr><tr><td>FedSim</td><td>.364±.025</td><td>.291±.009</td><td>.514±.019</td></tr><tr><td>FedProx</td><td>.380±.017</td><td>.291±.009</td><td>.507±.024</td></tr><tr><td>FedAPM</td><td>.437±.051</td><td>.396±.061</td><td></td></tr><tr><td rowspan="5">KU-HAR</td><td>FedAvg</td><td>.142±.004</td><td>.050±.004</td><td>.595±.002 .464±.023</td></tr><tr><td></td><td></td><td></td><td></td></tr><tr><td>FedAlt</td><td>.196±.017</td><td>.105±.022</td><td>.562±.006</td></tr><tr><td>FedSim</td><td>.196±.012</td><td>.105±.017</td><td>.566±.007</td></tr><tr><td>FedProx</td><td>.143±.005</td><td>.049±.005</td><td>.453±.023</td></tr><tr><td rowspan="5">Crema-D</td><td>FedAPM</td><td>.651±.007</td><td>.590±.009</td><td>.695±.018</td></tr><tr><td>FedAvg</td><td>.434±.025</td><td>.295±.041</td><td>.604±.044</td></tr><tr><td>FedAlt</td><td>.444±.031</td><td>.304±.042</td><td>.642±.020</td></tr><tr><td>FedSim</td><td>.444±.031</td><td>.304±.042</td><td>.643±.020</td></tr><tr><td>FedProx</td><td>.438±.032</td><td>.297±.045</td><td>.600±.046</td></tr></table>

![](images/49e233b92502b904044652dbba81c74f8343d00e44dd1ffb50cf2bedeb0d3846.jpg)  
Figure 4: Comparison of training loss across various methods.

6.2.3Model Deviation.Figure 5 illustrates the distance comparison between local and shared models for different methods З.First, partial model personalization can sometimes exacerbate client drift.In the KU-HAR dataset,both FedAltand FedSim cause the local model to diverge further from the shared model compared to FedAvg and FedProx. Second,we observe that the local model trained with FedAPM is closer to the shared model than those trained with other methods,indicating that FedAPM can effectively address client drift.

![](images/c651fe16637838c92c5611b41af9e2e0ba4aa6dfd35fef999293877645770b9f.jpg)  
Figure 5: The distance between the local and the shared models across different FL methods.A larger distance indicates that the local model deviates further from the shared model.

# 6.3 Comparison of Multiple Hyperparameters

6.3.1Effectof Penalty Parameter.We show the results on two datasets here with the full results shown in Figure 9 in Appendix B.5.Figure 6 illustrates how the training loss of FedAPM changes with communication rounds under different values of $\rho$ ,where $\rho$ takes the values of $\left\{ 0 . 0 0 1 , 0 . 0 1 , 0 . 0 2 , 0 . 0 5 , 0 . 1 \right\}$ .The experimental results on CIFAR10 and CrisisMMD show that FedAPM effectively addresses ill-conditioning,with smaller $\rho$ leading to faster convergence without the need for an excessively large $\rho$ This supports the analysis presented in Section 4.4,where we show that the dual variable effectively corrects the bias in constraint violations,allowing ADMM to avoid relying on large $\rho$ to enforce the constraints.

6.3.2Effectof Client Selection.We show the results on two datasets here with the full results presented in Figure 10 in Appendix B.5. Figure7illustrates the variation in the training loss of FedAPM with different numbers of selected clients,where the fraction of selected clients is $\{ 0 . 1 , 0 . 2 , 0 . 3 , 0 . 5 \}$ .It can be observed that as the number of selected clients increases,the training loss decreases more rapidly. This is because a greater number of clients participating enables more frequent model updates, thereby enhancing model accuracy. Therefore, when communication capacity allows, increasing the number of selected clients can improve convergence speed.

# 6.4Insights on Experimental Results

We have compared the performance of FedAPM with SOTA methods and validated the impact of hyperparameters on the performance of FedAPM. Our findings have led to the following insights:

·FedAPM demonstrates superior accuracy,F1 score,AUC,convergence,and communication efficiency compared to state-of-theart methods in heterogeneous and multimodal settings. · Partial model personalization can exacerbate client drift,causing the local model to diverge further from the shared model.The proposed FedAPM effectively mitigates client drift,bringing the local model closer to the shared model. ·Selecting appropriate hyperparameters for FedAPM can effectively enhance convergence. Specifically,choosinga relatively small value for $\rho$ and increasing the number of clients participating in each training round can yield faster convergence.

![](images/8453208823bacfe246a49a83f7dac67d976997d4ccd8272f1162a3950cb19514.jpg)  
Figure 6: Convergence v.s. penalty parameter.

![](images/7ea92ada97802dbdd3ef016d58b3470abbb8638304f5341053f54f5997ee3494.jpg)  
Figure 7: Convergence v.s. client selection.

# 7Conclusions and Future Work

In this paper,we proposed an FL framework based on ADMM, called FedAPM, which performed well in heterogeneous and multimodal settings.FedAPM effectively addressed client drift and illconditioning issues in other FL frameworks.We established global convergence for FedAPM with three convergence rates under weaker conditions than existing theoretical frameworks.Our experimental results demonstrated the superior performance of FedAPM across multiple datasets and metrics,and we also validated the impact of different hyperparameters, providing a strategy for their selection.

In future work,we plan to improve FedAPM with robust privacypreserving mechanisms,such as encryption techniques or differential privacy,to prevent adversaries from inferring users’sensitive information from the shared model parameters.Additionally, we will explore the theoretical foundations and practical applications of federated learning and ADMM methods within foundation models.

# Acknowledgments

This work was supported by the National Key R&D Program of China (2023YFB4503600), National Natural Science Foundation of China(62202338),Key R&D Program of Hubei Province(2023BAB081), and Ant Group through CCF-Ant Research Fund. Jinshan Zeng was partially supported by the National Natural Science Foundation of China under Grant No.62376110, the Jiangxi Provincial Natural Science Foundation for Distinguished Young Scholars under Grant No. 20224ACB212004. Yao Yuan was partially supported by the Research Grants Council (RGC) of Hong Kong, SAR, China (GRF-16308321) and the NSFC/RGC Joint Research Scheme Grant N_HKUST635/20.

# References

[1]2018.California ConsumerPrivacy Act. https://en.wikipedia.org/wiki/California_ Consumer_Privacy_Act.   
[2] 2018.General Data Protection Regulation.htps://en.wikipedia.org/wiki/ General_Data_Protection_Regulation.   
[3] Firoj Alam,Ferda Ofli,and Muhammad Imran.2018. CrisisMMD: Multimodal Twitter Datasets from Natural Disasters.In ICWSM. 465-473.   
[4] Manoj Ghuhan Arivazhagan,Vinay Aggarwal, Aaditya Kumar Singh,and Sunav Choudhary.2019.Federated learning with personalization layers.arXiv preprint arXiv:1912.00818 (2019).   
[5]Hedy Attouch and Jerome Bolte.2009.On the convergence of the proximal algorithmfor nonsmooth functions involvinganalytic features.Math.Program. 116, 1-2 (2009), 5-16.   
[6] Hedy Atouch,Jerome Bolte,and BenarFuxSvaiter.2013.Convergence ofdescent methods for semi-algebraic and tame problems: proximal algorithms,forwardbackward spliting,and regularized Gauss-Seidel methods.Math.Program.137, 1-2 (2013), 91-129.   
[7] Yoshua Bengio,Aaron C.Courville,and Pascal Vincent. 2013.Representation Learning:A Review and New Perspectives.IEEE Trans.Pattern Anal. Mach. Intel. 35,8 (2013),1798-1828.   
[8] Jacek Bochnak,Michel Coste,and Marie-FrancoiseRoy.1998.Real algebraic geometry.   
[9] Jerome Bolte,Aris Daniilidis,and Adrian Lewis.2007.The Lojasiewicz inequality for nonsmooth subanalytic functions with applications to subgradient dynamical systems.SIAM J.Optim.17,4(2007),1205-1223.   
[10] Kalista A.Bonawitz,Hubert Eichner, Wolfgang Grieskamp,Dzmitry Huba,Alex Ingerman,Vladimir Ivanov,Chloé Kiddon,Jakub Konecny,tefano Mazocchi, Brendan McMahan,Timon Van Overveldt,David Petrou,Daniel Ramage,and Jason Roselander. 2019. Towards Federated Learning at Scale: System Design. In SysML.   
[11] Stephen Boyd,Neal Parikh,Eric Chu,Borja Peleato,Jonathan Eckstein,etal.2011. Distributed optimization and statistical learning via the alternating direction method of multipliers.Found.Trends Mach.Learn.3,1(2011),1-122.   
[12] Sebastian Caldas,Sai Meher Karthik Duddu,Peter Wu,TianLi,Jakub Konecny, HBrendan McMahan,Virginia Smith,and Ameet Talwalkar. 2018.Leaf:A benchmark for federated setings.arXiv preprint arXiv:1812.01097 (2018).   
[13] Houwei Cao,David G.Cooper, Michael K.Keutmann,Ruben C.Gur,Ani Nenkova, and Ragini Verma. 2014. CREMA-D: Crowd-Sourced Emotional Multimodal Actors Dataset. IEEE Trans.Affect. Comput.5,4(2014),377-390.   
[14] Hong-You Chen and Wei-Lun Chao.2022.On Bridging Generic and Personalized Federated Learning for Image Classification. In ICLR.   
[15] Jiayi Chen and Aidong Zhang. 2022. FedMSplit: Correlation-Adaptive Federated Multi-Task Learning across Multimodal Split Networks.In KDD.87-96.   
[16] Jiayi Chen and Aidong Zhang.2024.FedMBridge: Bridgeable Multimodal Federated Learning. In ICML.   
[17]Li-Wei Chen and Alexander Rudnicky.2023.Exploring wav2vec 2.0fine tuning for improved speech emotion recognition.In ICASSP.1-5.   
[18] Kyunghyun Cho, Bart van Merrienboer,Caglar Gulcehre, Dzmitry Bahdanau, Fethi Bougares,Holger Schwenk,and Yoshua Bengio. 2014.Learning Phrase Representations using RNN Encoder-Decoder for Statistical Machine Translation. In EMNLP.1724-1734.   
[19] Liam Colins,Hamed Hassani,Aryan Mokhtari,and Sanjay Shakkottai. 2021. Exploiting Shared Representations for Personalized Federated Learning.In ICML, Vol. 139.2089-2099.   
[20] Ana Garcia del Molino and Michael Gygli.2018.PHD-GIFs: Personalized HighlightDetection for Automatic GIF Creation.In ACMMM. 600-608.   
[21] James Demmel.1997.Applied Numerical Linear Algebra. SIAM.   
[22] JacobDevlin.2018.Bert: Pre-trainingof deep bidirectional transformers for language understanding.arXiv preprint arXiv:1810.04805 (2018).   
[23] Canh T.Dinh,Nguyen Hoang Tran,and Tuan Dung Nguyen.2020.Personalized Federated Learning with Moreau Envelopes.In NeurIPS.21394-21405.   
[24] Tiantian Feng,Digbalay Bose, Tuo Zhang,Rajat Hebbar, Anil Ramakrishna, Rahul Gupta,Mi Zhang, Salman Avestimehr,and Shrikanth Narayanan. 2023. FedMultimodal: A Benchmark for Multimodal Federated Learning.In KDD.4035- 4045.   
[25]Yonghai Gong, Yichuan Liand Nikolaos M.Freris.202.FedADMM: A Robust Federated Deep Learning Framework with Adaptivity to System Heterogeneity. In ICDE.2575-2587.   
[26] Ian Goodfellow. 2016.Deep learning.   
[27] Filip Hanzely,Boxin Zhao,and Mladen Kolar. 2021．Personalized federated learning: A unified framework and universal optimization techniques.arXiv preprint arXiv:2102.09743 (2021).   
[28] Andrew G Howard. 2017.Mobilenets: Efficient convolutional neural networks for mobile vision applications.arXiv preprint arXiv:1704.04861(2017).   
[29] Peter Kairouz, Ziyu Liu,and Thomas Steinke.2021.The Distributed Discrete Gaussian Mechanism for Federated Learning with Secure Aggregation.In ICML, Vol. 139. 5201-5212.   
[JU]Iici auvuz,I.DIuan viLivianaIl,Dinual vIt,uIncn Dnct,vnu Bennis,Arjun Nitin Bhagoji, Kalista A. Bonawitz, Zachary Charles,Graham Cormode,Rachel Cummings,Rafael G.L.D'Oliveira,Hubert Eichner, SalimEl Rouayheb,David Evans,Josh Gardner, Zachary Garrett,Adria Gascon, Badih Ghazi,Philip B.Gibbons, Marco Gruteser, Zaid Harchaoui, ChaoyangHe,Lie He,ZhouyuanHuo,BenHutchinson,JustinHsu,MartinJggiaraJavidiGaui Joshi,Mikhail Khodak,Jakub Konecny,Aleksandra Korolova,Farinaz Koushanfar, Sanmi Koyejo,Tancrede Lepoint, Yang Liu,Prateek Mittal,Mehryar Mohri, Richard Nock,AyferOzgur,Rasmus Pagh,Hang Qi,Daniel Ramage,Ramesh Raskar, Mariana Raykova,DawnSong, WeikangSong,Sebastian UStichZiteng Sun,Ananda Theertha Suresh,Florian Tramer,Praneeth Vepakomma, Jianyu Wang,LiXiong,Zheng Xu, Qiang Yang,Felix X.Yu,Han Yu,and Sen Zhao. 2021. Advances and Open Problems in Federated Learning.Found.Trends Mach.Learn. 14,1-2 (2021),1-210.   
[31] Heejoo Kang, Minsoo Kim, Bumsuk Lee,and Hongseok Kim. 2024. FedAND: Federated Learning Exploiting Consensus ADMM by Nulling Drift. IEEE Trans. Ind.Informatics 20,7 (2024),9837-9849.   
[32] Sai Praneeth Karimireddy,Satyen Kale,Mehryar Mohri,Sashank J.Reddi, Sebastian U. Stich,and Ananda Theertha Suresh.2020.SCAFFOLD: Stochastic Controlled Averaging for Federated Learning.In ICML,Vol.119.5132-5143.   
[33] Steven G Krantz and Harold RParks.20o2.A primer of real analytic functions.   
[34] Alex Krizhevsky, Geoffrey Hinton,etal.2o09.Learning multiple layersoffeatures from tiny images.(2009).   
[35]Weirui Kuang,Bingchen Qian,ZitaoLi,Daoyuan Chen,Dawei Gao,XuchenPan, Yuexiang Xie,Yaliang Li,Bolin Ding,and Jingren Zhou.2024.FederatedScopeLLM: A Comprehensive Package for Fine-tuning Large Language Models in Federated Learning. In KDD.ACM, 5260-5271.   
[36] Krzysztof Kurdyka.1998.On gradients of functions definable in o-minimal structures.In Annales de l'institut Fourier,Vol.48.769-783.   
[37] Yann LeCun, Yoshua Bengio,and Geoffrey E.Hinton. 2015.Deep learning.Nat. 521,7553 (2015),436-444.   
[38]QinbinLi,YiqunDiao,QuanChen,andBingsheng He.2022.FederatedLeaing on Non-IID Data Silos: An Experimental Study.In ICDE.965-978.   
[39] TianLi,Shengyuan Hu,Ahmad Beirami,and Virginia Smith.2021.Ditto: air and Robust Federated Learning Through Personalization.In ICML,Vol.139. 6357-6368.   
[40] Tian Li,Anit Kumar Sahu,Ameet Talwalkar,and Virginia Smith.202o.Federated Learning:Challngeseosnduturerectios.EEigalrsg 37,3 (2020),50-60.   
[41] Tian Li,Anit Kumar Sahu,Manzil Zaheer, Maziar Sanjabi, Ameet Talwalkar, and Virginia Smith.2020.Federated Optimization in Heterogeneous Networks.In MLSys.   
[42] Paul Pu Liang,Terrance Liu, ZiyinLiu,Ruslan Salakhutdinov,andLouis-Philippe Morency. 202o. Think Locally,Act Globally: Federated Learning with Local and Global Representations.In NeurIPS.   
[43] Shiyun Lin,Yuze Han, Xiang Li,and Zhihua Zhang.2022.Personalized Federated Learning towards Communication Eficiency, Robustness and Fairness In NeurIPS. 30471-30485.   
[44] Yang Liu,Tao Fan, Tianjian Chen, Qian Xu,and Qiang Yang.2021.FATE: An Industrial Grade PlatformforColaborativeLearning WithData Protection.J. Mach. Learn.Res.22 (2021),226:1-226:6.   
[45] Stanis Lojasiewicz.1965.Ensembles semi-analytiques.Institut des Hautes Etudes Scientifiques (1965).   
[46] MiLuo,Fei Chen,Dapeng Hu, Yifan Zhang,Jian Liang,and Jiashi Feng.2021. No Fear of Heterogeneity: Classifier Calibration for Federated Learning with Non-IID Data.In NeurIPS.5972-5984.   
[47]ChenxinMa,Virginia Smith,MartinJaggi,MichaelIJordan,PeterRichtarik,nd Martin Takac.2015.Adding vs.Averaging in Distributed Primal-Dual Optimization.In ICML,Vol.37.1973-1982.   
[48] Brendan McMahan,Eider Moore,Daniel Ramage,Seth Hampson,and Blaise Aguera y Arcas. 2017. Communication-efficient learning of deep networks from decentralized data.In AISTATS.1273-1282.   
[49] Tomas Mikolov and Geoffrey Zweig.2012. Context dependent recurrent neural network language model. In SLT. 234-239.   
[50] Boris S Mordukhovich.2oo6.Variational analysis and generalized differentiation I: Basic Theory.   
[51] Jorge Nocedal and Stephen J.Wright.1999.Numerical Optimization. Springer.   
[52]Krishna Pillutla,Kshitiz Malik,Abdelrahman Mohamed,Michael G.Rabbat, Maziar Sanjabi,and Lin Xiao.2022.Federated Learning with Partial Model Personalization.In ICML.17716-17758.   
[53] Jian Ren, Xiaohui Shen, Zhe L.Lin,Radomir Mech,and David J.Foran. 2017. Personalized Image Aesthetics.In ICCV. 638-647.   
[54]RTyrrell RockafellarandRogerJ-BWets.1998.Variational analysis.   
[55] Felix Sattler, Simon Wiedemann,Klaus-Robert Muller,and Wojciech Samek.2020. Robust and Communication-Efficient Federated Learning From Non-i.i.d.Data. IEEE Trans.Neural Networks Learn.Syst.31,9(2020),3400-3413.   
[56] Shai Shalev-Shwartz and Tong Zhang.2013. Stochastic dual coordinate ascent methods for regularized loss. 7.Mach.Learn.Res.14,1(2013),567-599.   
[57] Shai Shalev-Shwartz and Tong Zhang. 2016.Accelerated proximal stochastic dual coordinate ascent for regularized loss minimization. Math.Program.155, 1-2 (2016),105-145.   
[58] Masahiro Shiota.1997.Geometry of subanalytic and semialgebraic sets.   
[59] Niloy Sikder and Abdullah Al Nahid.2021.KU-HAR: An open dataset for heterogeneous human activity recognition.Pattern Recognit. Lett.146 (2021),46-54.   
[60] Karan Singhal,Hakim Sidahmed, Zachary Garrett, Shanshan Wu,John Rush, and Sushant Prakash.2O21.Federated Reconstruction: Partially Local Federated Learning.In NeurIPS.11220-11232.   
[61] Virginia Smith,Chao-Kai Chiang,Maziar Sanjabi,and Ameet Talwalkar. 2017. Federated Multi-Task Learning.In NeurIPS. 4424-4434.   
[62] Virginia Smith, SimoneForte,Chenxin Ma,Martin Takac,Michael I.Jordan,and Martin Jaggi. 2017. CoCoA:A General Framework for Communication-Efficient Distributed Optimization. J.Mach.Learn. Res.18 (2017),230:1-230:49.   
[63] Guangyu Sun,Matias Mendieta,Jun Luo,Shandong Wu,and Chen Chen. 2023. FedPerfix: Towards Partial Model Personalization of Vision Transformers in Federated Learning.In ICCV.4965-4975.   
[64] Zhiqing Sun,Hongkun Yu,Xiaodan Song,Renjie Liu, Yiming Yang,and Denny Zhou.2020.Mobilebert: a compact task-agnostic bert for resource-limited devices. arXiv preprint arXiv:2004.02984 (2020).   
[65] Chen Wang, Jialin Qiao,Xiangdong Huang, Shaoxu Song,Haonan Hou, Tian Jiang,Lei Rui, Jianmin Wang,and Jiaguang Sun.2023.Apache IoTDB:A Time Series Database for IoT Applications.Proc.ACMManag.Data1,2 (2023),195:1- 195:27.   
[66] Han Wang,Siddartha Marella,and James Anderson.2022.FedADMM:Afederated primal-dual algorithm allowing partial participation.In CDC.IEEE, 287-294.   
[67] Yu Wang,Wotao Yin,and Jinshan Zeng. 2019.Global convergence of ADMM in nonconvex nonsmooth optimization. J. Sci. Comput.78,1(2019),29-63.   
[68] Liang Xiao,Xiaoyue Wan,Xiaozhen Lu, Yanyong Zhang,and Di Wu. 2018. IoT Security Techniques Based on Machine Learning: How Do IoTDevices Use AI to Enhance Security? IEEE Signal Process.Mag.35,5 (2018),41-49.   
[69] Yangyang Xu and Wotao Yin. 2013.A Block Coordinate Descent Method for Regularized Multiconvex Optimization with Applications to Nonnegative Tensor Factorization and Completion. SIAM J.Imaging Sci.6,3 (2013),1758-1789.   
[70]Piyush Yadav,Dhaval Salwala,Felipe Arruda Pontes,PraneetDhingra,and Edward Curry. 2021.Query-Driven Video Event Processing for the Internet of Multimedia Things.Proc.VLDB Endow.14,12 (2021),2847-2850.   
[71] Mang Ye,Xiuwen Fang,Bo Du,Pong C.Yuen,and Dacheng Tao.2024.Heterogeneous Federated Learning: State-of-the-art and Research Challenges.ACM Comput. Surv.56,3 (2024),79:1-79:44.   
[72]RuiYe,WenhaoWang,JingyiChai,DihanLi,ZexiLiYindaXu,YaxinDu,Yanfeng Wang,and Siheng Chen. 2024. OpenFedLLM: Training Large Language Models on Decentralized Private Data via Federated Learning.In KDD.ACM, 6137-6147.   
[73] Jinshan Zeng,Tim Tsz-Kit Lau, Shaobo Lin,and Yuan Yao.2019.Global Convergence of Block Coordinate Descent in Deep Learning.In ICML,Vol.97.7313-7323.   
[74] Jinshan Zeng, Shao-Bo Lin, Yuan Yao,and Ding-Xuan Zhou. 2021. On ADMM in Deep Learning: Convergence and Saturation-Avoidance. J.Mach. Learn.Res. 22 (2021),199:1-199:67.   
[75] Jianqing Zhang, Yang Hua,Hao Wang,Tao Song,Zhengui Xue,Ruhui Ma,and Haibing Guan. 2023.FedALA:Adaptive Local Aggregation for Personalized Federated Learning.In AAAI. 11237-11244.   
[76] Jianqing Zhang, Yang Hua,Hao Wang,Tao Song,Zhengui Xue,Ruhui Ma,and Haibing Guan. 2023.FedCP: Separating Feature Information for Personalized Federated Learning via Conditional Policy.In KDD.3249-3261.   
[77] Xinwei Zhang,Mingyi Hong,Sairaj Dhople,Wotao Yin,and Yang Liu.2021. FedPD:A federated learning framework with adaptivity to non-iid data. IEEE Trans. Signal Process.69 (2021),6055-6070.   
[78] Yue Zhao,Meng Li,Liangzhen Lai, Naveen Suda,Damon Civin,and Vikas Chandra.2018.Federated learning with non-id data.arXiv preprint arXiv:1806.00582 (2018).   
[79] Shenglong Zhou and Geoffrey Ye Li.2023.Federated Learning Via Inexact ADMM. IEEE Trans.Pattern Anal.Mach.Intell45,8 (2023),9699-9708.   
[80] Shenglong Zhou and Geoffrey Ye Li.2023.FedGiA: An Efficient Hybrid Algorithm for Federated Learning.IEEE Trans.Signal Process.71(2023),1493-1508.   
[81] Shengkun Zhu,Jinshan Zeng,Sheng Wang, Yuan Sun, Xiaodong Li, Yuan Yao, and Zhiyong Peng. 2024.On ADMM in Heterogeneous Federated Learning: Personalization,Robustness,and Fairness.arXiv preprint arXiv:2407.16397(2024).