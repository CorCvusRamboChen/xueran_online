# 隐藏信息与社交推理的 AI 方法：能否评估说书人的假信息

调研日期：2026-10-31。

来源标记：【全文】读过论文正文的相关段落；【摘要】只读了 arXiv 页面、摘要或项目 README；【摘录】只看到搜索结果摘录，没打开原文，引用前应再核对。没有标记的「我算的」「我测的」是本次自己的计算，不是文献结论。

本地基线：15 人局世界数中位 100,953，单次枚举 p50 71 ms，给一条假信息打分 0.3–0.45 秒；最好和最差候选只差 1–3 个百分点，见 `design/world-enum.md`。

## 总问题：哪些方法能回答「给这条假信息，玩家会信什么，结局怎么变」

### Takeaway
没有一种现成方法能完整回答。「逻辑上还剩哪些世界」已经解决，「在人的模型下会信什么」有便宜的公式但没校准过，「结局怎么变」目前无法直接验证：要测出 3 个百分点的胜率差，每个候选约需 4,400 局。最划算的路线是：先改枚举的权重，再用真实玩家的怀疑探针校准，不用胜率验证。

### Cited Findings

成本表。除标明处外都是按本地基线外推的估算，不是实测。

| 方法 | 回答到哪一层 | 15 人局成本（估算） | 能否离线 | 是否需要人类数据 | 验证情况 |
|---|---|---|---|---|---|
| 现有枚举，改为带权重 | 逻辑层 + 理性观察者 | 约等于现有成本的 1–11 倍（红鲱鱼已是 ≤15 次循环） | 能，也能现算到 12 人 | 运行不需要；权重要校准 | 无 |
| 信息增益 / 熵 | 逻辑层 | 在枚举结果上加几十毫秒 | 能 | 不需要；但人未必照此行事 | 在 Battleship 上有人类对照 |
| RSA 式递归听者 / 说话者 | 人的推理模型 | 候选矩阵 10 万世界 × 22 候选一轮约 26 ms，144 万世界约 360 ms（我测的合成数据） | 能 | 理性参数需要 | 简单语言游戏有验证，且有争议 |
| 贝叶斯劝说（信息设计） | 选信号策略的理论框架 | 同上；求最优是线性规划 | 能 | 不需要，但假定听者完全理性 | 理论结果 |
| ASP / SAT / #SAT | 逻辑层 | 不比现有枚举快（见下）；价值在规则表达和加权计数 | 能 | 不需要 | 有 BotC 开源实现 |
| 动态认知逻辑、按玩家视角 | 每个玩家知道什么 | 一层视角约 15 次枚举≈1 秒；两层上限 225 次≈16 秒 | 能 | 不需要 | 人类做到二阶就明显吃力 |
| 类人规则求解器 | 玩家实际推得出什么 | 每候选毫秒级，但规则要手写 | 能 | 要，用来定难度权重 | 数独相关系数 0.95 |
| 因子图 + LLM（GRAIL 式） | 把讨论变成软证据 | 证据换算要 LLM 调用；我们有精确枚举，不需要跑信念传播 | 能 | 训练用无语言日志；Avalon 用了约 10 万局 | 44 名被试，但没测人的信念 |
| LLM 整局模拟 | 信念和结局都给数 | 一局约 300 万 token 量级（外推）；比候选要几千局 | 仅离线，且很贵 | 跑不需要；不校准就不代表人 | 目前没有针对人类信念的验证 |
| Cicero 式人类模型 + 规划 | 预测人并规划 | 不可行：12.5 万局人类数据 | 不适用 | 要，量级远超我们 | 40 局匿名对局 |
| DeepRole / CFR / ReBeL / Pluribus | 博弈均衡 | 不可行：无语言，规模不匹配 | 不适用 | 不需要 | 5 人 Avalon，或扑克 |
| BAD / OBL | 公共信念 | 不可行（作为算法）；思想可借 | 不适用 | 不需要 | Hanabi |

- 世界规模（我算的）：选 4 个邪恶座位 C(15,4)=1,365，乘 4 种恶魔座位、爪牙排列 24，得 131,040；乘最多 11 个酒鬼位得 144 万；再乘最多 11 个红鲱鱼得约 1,586 万；再乘一次投毒目标 14 得约 2.2 亿。任务里说的「约 2 亿」和这个展开吻合，但这是我的还原，文档里没有写。实际过滤后约 10 万，是因为自称角色固定，且红鲱鱼和投毒只判定「存在一种解释」。
- 胜率验证的样本量（我算的）：胜率约 50% 时，双臂比较 5% 显著性、80% 把握，差 3 个百分点每臂约 4,356 局，差 1 个百分点每臂约 39,200 局。
- `worlds.js` 的三点结构问题（读代码所得）：`explains()` 返回布尔值，靠投毒才说得通的世界和完全自然的世界等权；信息来源是邪恶或酒鬼时直接 `continue`，这条信息对该世界不起作用；`viewOf()` 把全镇所有信息合并成一个公共视角，而真实玩家各知各的，也不会全部公开。

### Inferences
- 1–3 个百分点这个结论可能部分是模型造成的。任何投毒者活着的世界都能吸收每晚一条不符的信息，而且没有代价，所以候选之间自然分不开。改成似然加权后差距可能变大，也可能不变，这是几小时内能测的问题，应排在所有新方法之前。
- 带权重的写法（推断，未实现）：P(信息 | 世界) 按「真信息」「酒鬼或中毒的假信息」「邪恶自报」分开，投毒和红鲱鱼按世界内求和，不展开成世界。这样 2 亿不必逐个枚举，成本基本不变。
- 胜率不该作验证指标。应当用逐条判定的中间量：假信息公布前后，玩家对各人是恶魔的主观概率变化。同一玩家前后比较，样本需求远小于胜率比较，但具体多少要看方差，目前没有数据。
- 建议顺序：1）似然加权，看差距变不变；2）算每个候选的逐玩家熵和世界存活数；3）在对局里加可选的怀疑探针，积累真实信念；4）用这份数据校准一个小参数模型（信源可信度、推理深度）；5）再考虑 LLM 模拟做离线初筛。

### Gaps
- 没有找到任何工作把「假信息候选 → 玩家信念 → 结局」这条链在真人身上做过验证，社交推理领域也没有。
- 信念探针的方差和所需局数没有文献数字，需要自测。
- 上表的 LLM token 量是外推：假设 15 个智能体各约 20 万 token 一局，参照 GRAIL 每局约 12.6 万输入，BotC 局更长。没有 15 人 BotC 的实测。这里不给美元数字，因为没有核对当前价格。

## 心智理论和信念建模：什么能迁移到 15 人、长时间自由讨论

### Takeaway
能迁移的是思路，不是算法。多人博弈求解方法都绕开了自由语言，且在 5 人或更少的规模上验证。值得借的三件事：把说书人当有策略的信号发送者（RSA、贝叶斯劝说）、用参照策略定义第 0 层听者（OBL）、用人类模型做锚再规划（Cicero，但只取结构）。

### Cited Findings
- RSA 起点：Michael C. Frank, Noah D. Goodman, "Predicting Pragmatic Reasoning in Language Games", Science 336(6084), 2012。说话者力求信息量，听者做贝叶斯推断，有报道称无自由参数即贴合人类判断 — [Stanford PDF](https://web.stanford.edu/%7engoodman/papers/FrankGoodman-Science2012.pdf)【摘录】
- RSA 综述：Noah D. Goodman, Michael C. Frank, "Pragmatic Language Interpretation as Probabilistic Inference", Trends in Cognitive Sciences 20(11), 2016 — [PDF](https://psych205.stanford.edu/papers/GoodmanFrank17TiCS.pdf)【摘录】
- RSA 反证：Sikos, Venhuizen, Drenhaus, Crocker, "Reevaluating pragmatic reasoning in language games", PLoS One 16(3), 2021。重现了高相关，但只用字面意义和显著性的基线模型拟合显著更好，听者在真正需要语用推理的条件下是随机水平 — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7968720/)【全文，读了前约三分之二】
- BToM：Baker, Saxe, Tenenbaum, "Action understanding as inverse planning", Cognition 113(3), 2009，用三个迷宫动画实验比较逆规划模型和人的目标推断 — [MIT DSpace](https://dspace.mit.edu/handle/1721.1/60852)【摘录】
- BToM：Baker, Jara-Ettinger, Saxe, Tenenbaum, "Rational quantitative attribution of beliefs, desires and percepts in human mentalizing", Nature Human Behaviour 1, 0064, 2017，在两个实验中定量贴合被试的心理状态判断，场景是空间移动 — [Springer](https://link.springer.com/article/10.1038/s41562-017-0064)【摘录】
- 撒谎的递归模型：Oey, Schachner, Vul, "Designing and detecting lies by reasoning about other agents"，撒谎者估计被识破的概率，识谎者反向推理。找到的是 2022 年草稿；其前身 "Designing good deception"（CogSci 2019）称理性模型比非理性模型更能定性预测人类撒谎和识谎 — [NSF PAR](https://par.nsf.gov/search/author:%22Oey,%20Lauren%22)【摘录，全文两次取不到】
- 层级思考：Camerer, Ho, Chong, "A Cognitive Hierarchy Model of Games", QJE 2004，平均约 1.5 步思考可拟合大量博弈数据 — [PDF](https://www.csc2.ncsu.edu/faculty/mpsingh/local/Social/f24/wrap/readings/Camerer+Ho+Chong-cognitive-hierarchy-of-games-2004.pdf)【摘录】
- DeepRole：Serrino, Kleiman-Weiner, Parkes, Tenenbaum, "Finding Friend and Foe in Multi-Agent Games", arXiv 2019。把演绎推理嵌入向量形式 CFR，加深度价值网络；评估集中在 5 人 Avalon；与真人混队时胜过人类。不涉及自由语言 — [arXiv:1906.02330](https://arxiv.org/abs/1906.02330)【摘要】
- BAD：Foerster 等，"Bayesian Action Decoder for Deep Multi-Agent Reinforcement Learning"，用公共信念 MDP，动作是「私有信息到动作的映射」，在两人 Hanabi 上领先。检索到的页面没有列出会议 — [arXiv:1811.01458](https://arxiv.org/abs/1811.01458)【摘要】
- OBL：Hu, Lerer, Cui, Pineda, Brown, Foerster, "Off-Belief Learning", ICML 2021。假定历史动作来自固定参照策略，可叠成层级来控制推理深度 — [PMLR](https://proceedings.mlr.press/v139/hu21c.html)【摘录】
- ReBeL：Brown, Bakhtin, Lerer, Gong, "Combining Deep Reinforcement Learning and Search for Imperfect-Information Games"，收敛保证只针对两人零和 — [arXiv:2007.13544](https://arxiv.org/abs/2007.13544)【摘要】
- Student of Games：Schmid 等，Science Advances 9, eadg3256, 2023，在国际象棋、围棋、单挑扑克、苏格兰场上验证 — [arXiv:2112.03178](https://arxiv.org/abs/2112.03178)【摘要】
- Pluribus：Brown, Sandholm, "Superhuman AI for Multiplayer Poker", Science 2019。蓝图策略约 12,400 核时、8 天，实战 28 核 — [CMU](https://www.cmu.edu/news/stories/archives/2019/july/cmu-facebook-ai-beats-poker-pros.html)【新闻稿，非论文原文】
- Cicero：Meta FAIR Diplomacy Team, "Human-level play in the game of Diplomacy by combining language models with strategic reasoning", Science 378, 1067–1074, 2022。数据 125,261 局人类对局，其中 40,408 局有对话，共 12,901,662 条消息；用 piKL 让预测策略贴近人类模型，同时响应期望收益；刻意让消息诚实表达意图 — [PDF 副本](https://gwern.net/doc/reinforcement-learning/imperfect-information/diplomacy/2022-bakhtin.pdf)【全文，第三方副本，Science 官网返回 403】
- 40 局匿名对局中得分超过人类平均的两倍，在打了多局的玩家里排前 10% — [Meta](https://ai.meta.com/blog/cicero-ai-negotiates-persuades-and-cooperates-with-people/)【摘录，公司博客】
- 贝叶斯劝说：Kamenica, Gentzkow, "Bayesian Persuasion", AER 101(6), 2011。理性听者的后验按信号概率加权后必须等于先验（Bayes plausibility），这也是对后验分布的唯一限制 — [NBER](https://www.nber.org/system/files/working_papers/w15540/w15540.pdf)【摘录】
- 文字版：Li 等，"Verbalized Bayesian Persuasion"，把状态和信号都当文本，用 LLM 扮演发送者和接收者，Prompt-PSRO 求解 — [arXiv:2502.01587](https://arxiv.org/pdf/2502.01587)【摘录】

### Inferences
- 说书人的处境比玩家更接近贝叶斯劝说：知道真相，选信号，目标是塑造后验。理论上的直接含义：如果玩家完全理性且知道说书人的策略，假信息改不了平均信念，只能改变分布的散度。所以「让全镇平均更怀疑某人」这个目标本身就有上限，优化对象应该是分布形状（是否分裂、是否留有悬念），而不是均值。
- 但真实玩家不是这样的接收者。投毒信息的来源和动机，他们只能猜；而且 Sikos 的结果提示，字面听者可能比递归听者更贴近人。合理的默认值是第 0–1 层，不是深层递归。
- 把 RSA 里的「话语」换成离散的假信息候选后，候选少、世界可枚举，正好是 RSA 最容易计算的情形。困难不在算力，在于没有 BotC 上的人类数据来定理性参数。
- 自由讨论是所有博弈方法的主要障碍。Cicero 能处理语言，靠的是 1,290 万条人类消息，我们没有这个条件。

### Gaps
- 任务里提到的 "Reinhart" 没能对应到任何社交推理论文，没有收录。
- DeepRole、BAD、ReBeL 的会议信息在检索到的页面上没有显示，这里不写会议名。
- 没有找到用 BToM 或 RSA 拟合隐藏身份游戏里真人怀疑变化的研究。

## 狼人杀、Avalon、Among Us 的 LLM 智能体：作为人类信念模型有多准

### Takeaway
目前几乎没有直接证据。多数工作以引擎真值或胜率为标准，不是人的信念；少数真人比较显示 LLM 和人的偏差方向不一致，甚至会反过来。LLM 可以做离线初筛，不能当人的替身。

### Cited Findings
- Xu 等，"Exploring Large Language Models for Communication Games: An Empirical Study on Werewolf"，arXiv 2023，免调参框架，出现信任、对抗、伪装等行为 — [arXiv:2309.04658](https://arxiv.org/pdf/2309.04658)【摘录】
- Xu, Yu, Fang, Wang, Wu, "Language Agents with Reinforcement Learning for Strategic Play in the Werewolf Game", ICML 2024，LLM 提候选，RL 选动作，报告在人机实验中达到人类水平 — [PMLR](https://proceedings.mlr.press/v235/xu24ad.html)【摘录】
- Wang 等，"Avalon's Game of Thoughts: Battle Against Deception through Recursive Contemplation"（ReCon），一阶和二阶换位思考，评价由 LLM 完成 — [arXiv:2310.01320](https://arxiv.org/abs/2310.01320)【摘要】
- Wu 等，"Enhance Reasoning for Large Language Models in the Game Werewolf"，18,800 局 9 人人类对局训练外部 Thinker 模块，称是当时最大的社交推理数据集 — [arXiv:2402.02330](https://arxiv.org/abs/2402.02330v2)【摘要】
- Bailis, Friedhoff, Chen, "Werewolf Arena"，用竞价决定发言，LLM 对战 — [arXiv:2407.13943](https://arxiv.org/abs/2407.13943v1)【摘要】
- AIWolf 2014 年起每年举办，自然语言组由评委主观打分。2023 年组织方指出发言有时和游戏动作不一致，也不清楚智能体是否真的靠逻辑推角色 — [ACL Anthology](https://aclweb.org/anthology/2023.inlg-genchal.13.pdf)【摘录】
- GRAIL：Rahimirad 等，"Bayesian Social Deduction with Graph-Informed Language Models"，ACL 2026。因子图 + 神经因子做信念，LLM 只把对话转成「更高/更低/不变」的先验。胜率 67%，对照基线 27%（频率派 p=0.054），44 名被试。每局约 12.6 万输入 token、4 千输出。信念传播在 M2 CPU 上 4.62 秒（6 节点）到 15.14 秒（20 节点）。因子训练用 AvalonLogs 3,143 局、ProAvalon 101,280 局，不含语言。没有测量人的信念 — [arXiv HTML](https://arxiv.org/html/2506.17788v2)【全文，读了前约 70%】
- Stepputtis 等，"Long-Horizon Dialogue Understanding for Role Identification in the Game of Avalon with Large Language Models"，EMNLP Findings 2023。20 局、30 名参与者，玩家自己标注说服策略并报告对他人角色的信念，这是我找到的唯一含真人信念自述的公开数据。F1 表格中人类约 Good 0.76、Evil 0.72，最好的 LLM 约 0.68、0.58，结论是 LLM 未达人类水平（PDF 抽取后表格错位，人类这一行按版式判断，需核对）— [ACL PDF](https://aclanthology.org/2023.findings-emnlp.748.pdf)【全文】
- Yoo, Kim, "Finding deceivers in social context with large language models and how to find them: the case of the Mafia game", Scientific Reports 14, 30946, 2024。15 局测试，GPT-4 找到黑手党 45.16%，人类投票命中 28.83%。信息增多时 GPT-4 上升（33%→50%→75%），人类下降（33%→33%→15%）。第 4 天样本极少，作者说明缺乏统计效力；人类数字来自投票记录，不是同条件对照 — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11680777)【全文】
- Kao, Vats, Davis, "Hidden in Plain Text"，IEEE ICA 2025，35 局 LLM 对比 28 局人类 Mafia，检测器在 LLM 局上准确率更低 — [arXiv:2601.13709](https://arxiv.org/abs/2601.13709)【摘要】
- Eckhaus, Berger, Stanovsky, "Time to Talk"，异步 Mafia 里智能体和人同场，时机接近人类，内容仍不同 — [arXiv:2506.05309](https://arxiv.org/abs/2506.05309)【摘要】
- Song 等，"Beyond Survival"，电视节目数据超过 100 小时。以获胜方 MVP 的投票为标准，模型投票一致率 0.255–0.782，对手角色推断最高 0.616。约一半模型低于 0.50，没有给出人类自身的分数 — [arXiv HTML](https://arxiv.org/html/2510.11389v1)【全文部分】
- Yang 等，"Do LLMs Trust the Accuser or the Accusation?"，arXiv 2026-09。40 个模型配置、1,224 条标注消息，指控仍然强烈左右信念，尤其来自受信任者时，即使他是狼。全部语料由 LLM 生成，没有真人参与 — [arXiv:2609.12446](https://arxiv.org/abs/2609.12446)【全文部分】
- Karpov, "MafiaScope"，每次公开发言后让智能体私下回答结构化探针，再和引擎真值比较。自信度校准差，高估被怀疑程度约 1.5 倍；单票反事实重放很少改变结果 — [arXiv:2607.10645](https://arxiv.org/abs/2607.10645)【摘要】
- Gao 等，"Auditing Belief-Conditioned LLM Agents"，1,080 局。显式信念使好人胜率 0.205→0.390，但动作和信念的一致性只有约 0.21，作者不把提升归因于信念内容 — [arXiv:2607.10814](https://arxiv.org/abs/2607.10814)【摘要】
- Zhang 等，"Playing social deduction games with reinforcement fine-tuned large language models"，arXiv 2026-10。训练可把隐藏状态推断从约 0.55 提到 0.78，但只用输赢奖励学不会；作者明确说跨 LLM 泛化不等于对人泛化 — [arXiv:2610.04261](https://arxiv.org/abs/2610.04261)【全文部分】
- Zheng 等，"The Stackelberg Speaker"，ACL 2026，把发言建模成领导者影响跟随者，用 RL 优化说服力 — [arXiv:2510.09087](https://arxiv.org/abs/2510.09087)【摘要】
- 数据集：Lai 等，"Werewolf Among Us"，199 段对话和视频，26,647 条说服策略标注，ACL Findings 2023 — [arXiv:2212.08279](https://arxiv.org/abs/2212.08279v1)【摘录】

### Inferences
- 最值得复制的是 MafiaScope 的探针设计，只是把对象从智能体换成真人，再把真值从引擎换成玩家自报概率。
- 最值得借鉴的结构是 GRAIL 的分工：逻辑部分算概率，LLM 只把讨论压缩成少量软证据。我们已有精确枚举，可以把这个证据直接变成世界权重，不需要信念传播。
- Mafia 结果说明不能假定「LLM 偏差 ≈ 人的偏差」：信息越多，GPT-4 越准而人越差。若这个趋势成立，LLM 模拟会系统性低估假信息对人的误导。不过这个样本太小，只能当警告，不能当结论。
- 信念在 LLM 里也不一定驱动动作（一致性 0.21），所以测「说了什么信念」和测「投给谁」要分开。

### Gaps
- 没有找到 LLM 信念轨迹与真人信念轨迹的逐条对比研究。Stepputtis 的数据可以做这件事，但他们的比较只到角色预测 F1。
- 没有 20 局以上、含真人信念自述的 12 人以上数据集。
- 2026 年的多篇预印本未经同行评审，且多为近几个月提交。

## 信息论、认知逻辑和模型计数

### Takeaway
信息增益和熵适合作为第二指标，但在人身上不是好的行为模型。#SAT 和 ASP 解决的是规则表达和加权计数，不解决速度：我们这个规模用直接枚举已经够快。动态认知逻辑的用处是提醒我们要按玩家视角算，不一定要用它的工具。

### Cited Findings
- Rothe, Lake, Gureckis, "Do People Ask Good Questions?", Computational Brain & Behavior 2018。Battleship 任务里人能识别好问题，但很难自己合成信息量最大的问题 — [论文页](https://www.gureckislab.org/papers/ref/rothe2018people)【摘录】
- Bertsimas, Paskov, "An Exact and Interpretable Solution to Wordle", Operations Research 73(3), 2025，精确动态规划，平均 3.421 猜 — [IDEAS](https://ideas.repec.org/a/inm/oropre/v73y2025i3p1384-1394.html)【摘录】
- Mastermind：Knuth 用最小化最大分区大小，Kooi 2005 报告熵策略表现差，Lozano 等 2012 却发现熵和 Most Parts 最好，两者结论不一致 — [arXiv:1207.1315](https://arxiv.org/pdf/1207.1315)【摘录】
- 公共宣告逻辑的模型检验在 P，一般 DEL 是 PSPACE 完全 — [Aucher, Schwarzentruber](https://hal.archives-ouvertes.fr/hal-00856468)【摘录】；S5 下两个智能体也已 PSPACE 难 — de Haan, van de Pol, [arXiv:1805.09880](https://arxiv.org/abs/1805.09880)【摘要】
- Minculescu, Top, Verbrugge, de Weerd, "How Well Do People Perform on Novel Logic Puzzles Requiring Higher-Order Theory of Mind?"，CogSci 2025，用 Cheryl's Birthday 区分推理阶数，阶数越高耗时越长、错误越多；背景研究认为策略博弈中人常止于二阶 — [eScholarship PDF](https://escholarship.org/content/qt5s63j43q/qt5s63j43q.pdf)【摘录】
- Sileo, Lernould, "MindGames"，用 DEL 生成心智理论题，含 Muddy Children 变体，模型规模增大并不稳定优于随机 — [arXiv:2305.03353](https://arxiv.org/abs/2305.03353)【摘要】
- clingo：Gebser 等，"Multi-shot ASP solving with clingo", TPLP 19, 2019，增量求解，避免每步重启 — [arXiv 版](https://ar5iv.labs.arxiv.org/html/1705.09811)【摘录】
- 答案集计数：clingo 枚举在答案集少时最好，超过约 10^5 后运行时间明显变差，因此有枚举加计数器的混合方案 — [arXiv:2312.11936](https://arxiv.org/pdf/2312.11936)【摘录】；2025 年 sharpASP 工作 — [arXiv:2502.09231](https://arxiv.org/pdf/2502.09231)【摘录】
- 精确计数：Sharma, Roy, Soos, Meel, "GANAK", IJCAI 2019 — [IJCAI](https://www.ijcai.org/proceedings/2019/163)【摘录】。2021–2023 竞赛里 SharpSAT-TD 领先 — [Fichte, Hecher, arXiv:2504.13842](https://arxiv.org/pdf/2504.13842)【摘录】。另有研究提醒不要只看竞赛冠军 — [arXiv:2408.07059](https://arxiv.org/pdf/2408.07059)【摘录】
- 加权计数可把概率推断化为公式模型的权重和，主流用字面量权重 — [Chakraborty 等 IJCAI 2015](https://www.cs.toronto.edu/~meel/Papers/ijcai15.pdf)【摘录】
- 近似：ApproxMC 提供 PAC 式保证，CMSGen 是快但非严格均匀的采样器 — [CSB, arXiv:2607.04142](https://arxiv.org/pdf/2607.04142)【摘录】
- Cluedo：Neller 等，"Clue Deduction: an introduction to satisfiability reasoning"，2008，教学项目；后续用伪布尔约束和 WalkSAT 采样估计概率 — [PDF](https://cs.carleton.edu/faculty/dmusicant/cs321s12/clue.pdf)【摘录】
- Knights and Knaves：Xie 等，"On Memorization of Large Language Models in Logical Reasoning"，动态生成题目，微调后对扰动题表现下降 — [arXiv:2410.23123](https://arxiv.org/abs/2410.23123v1)【摘录】。心理学方面，Rips 1989 引发规则与心智模型之争，只核实到书目 — [引用页](https://informahealthcare.com/doi/ref/10.1080/135467899394066)【摘录】

### Inferences
- 我们的世界数约 10 万，刚好在 clingo 开始变慢的位置，而本地 JS 枚举 71 ms。换求解器不会提速。真正的取舍是：逻辑规则写一份声明式代码，比现在和引擎分离的 `holds()` 更容易检查，但线上慢很多。若要用，放在线下做校对最合适。
- 2.2 亿不该交给 #SAT。投毒和红鲱鱼可以在世界内部求和，这比任何通用计数器都快；通用计数器只在规则变得不能分解时才有优势，比如梦殒春宵的疯狂和复杂的恶魔换人。
- Mastermind 和 Wordle 的教训：熵是便宜的启发式，不保证最优，而且结论依赖具体游戏。说书人并不想让信息量最大，通常想要留有悬念，所以目标应是「某个熵区间」而不是极值。
- 真正要用认知逻辑的地方是：对每个玩家分别枚举，世界集合用「他自己的信息 + 公开信息」过滤。这在现有代码上就能做，一层约 15 次枚举。二阶以上对人类没有多大意义，也不划算。

### Gaps
- 2024、2025 年模型计数竞赛的官方排名没取到，只知道 [mccompetition.org](https://mccompetition.org/) 现在是第 7 届 MC 2026。
- 没有找到 BotC 编码下 ganak、sharpSAT-TD、D4 的实测。上面的判断是推断。
- 我没有在 15 人规模跑过 clingo。

## 类人求解器：能否模拟玩家实际推得出什么

### Takeaway
这是最被低估的方向。数独证据很强：按人使用的技巧建模，比按搜索量建模更能预测人的难度。迁移到 BotC 没有先例，但成本低，而且直接弥补「枚举假设玩家逻辑完美」的缺陷。

### Cited Findings
- Pelánek, "Difficulty Rating of Sudoku Puzzles by a Computational Model", FLAIRS 2011。人类求解行为模型与实测表现相关 0.95，数据来自三个网站、超过 2,000 道题；难度来自单步复杂度和步骤间依赖；更简单的指标也有 0.88 — [技术报告](https://www.fi.muni.cz/~xpelanek/publications/sudoku-tr.pdf)【摘录】
- Pelánek 2014，"Difficulty Rating of Sudoku Puzzles: An Overview and Evaluation"，超过 1,700 道题和数百名解题者，仍是人类模型最佳 — [arXiv:1403.7373](https://arxiv.org/pdf/1403.7373)【摘录】
- Bogaerts, Gamba, Guns, "A framework for step-wise explaining how to solve constraint satisfaction problems", Artificial Intelligence 300, 2021。把解题过程拆成一串简单的推理步骤，用于逻辑格子题 — [arXiv:2006.06343](https://arxiv.org/abs/2006.06343v1)【摘录】

### Inferences
- 可以写一个小型推理机，只含玩家常用的几条规则：同角色唯一、Chef 数字、Empath 相邻、Washerwoman 二选一、投毒的直接怀疑等。用它算「这条假信息在几步之内能推出什么」，再和枚举结果比较。枚举能推出、规则机推不出的，就是玩家实际看不到的矛盾。
- 这能把假信息分成三类：立刻露馅、聪明玩家才能发现、基本发现不了。对说书人来说，这可能比 1–3 个百分点的怀疑度更有用。
- 这也能评价平衡性：统计每局需要的推理步数，作为难度指标。用真实对局里玩家的「是否解开」来校准，人类数据量远小于训练神经模型。
- 关键差异：数独只有一个解，BotC 没有唯一解，且玩家信息不完整也不可靠。数独的 0.95 不能直接外推。

### Gaps
- 没有找到任何社交推理游戏上的类人求解器。
- 玩家用哪些推理规则没有数据，需要从对局记录或访谈里总结。

## 程序化谜题和保持虚假证词一致

### Takeaway
谜题生成领域的共同做法是先定事实结构，再生成文本，这和 `snvWorld` 的假世界思路一致。但几乎没有工作处理「证词为假且仍能推理」，系统通常直接不让角色撒谎。

### Cited Findings
- Mohr, Eger, Martens, "Eliminating the Impossible: A Procedurally Generated Murder Mystery", CEUR Vol-2282（EXAG 工作坊，年份按卷号判断为 2018，正文里未核实）。角色属性组合唯一以保证可解，用 Ostari 动态认知逻辑跟踪玩家知识。文中明确说角色会隐瞒，但绝不撒谎；一旦允许撒谎，就要从排除可能性改成计算概率，判定何时算解开留作未来工作 — [CEUR](https://ceur-ws.org/Vol-2282/EXAG_113.pdf)【全文】
- Sprague 等，"MuSR"，ICLR 2024。先生成事实和推理树，再让 LLM 写成约 1000 词故事。无辜嫌疑人有两项事实加一条不成立的红鲱鱼 — [arXiv:2310.16049](https://arxiv.org/abs/2310.16049)【摘要】，生成细节见 [PDF](https://arxiv.org/pdf/2310.16049)【摘录】
- Del, Fishel, "True Detective"，*SEM 2023，191 篇推理故事，GPT-4 只解 38% — [ACL Anthology](https://aclanthology.org/2023.starsem-1.28)【摘录】
- Wagner, Keydar, Abend, "The Challenge and Reward of Fair Play in Narrative"，用信息论形式化惊奇、连贯和公平，分揭晓前后两种读者模式，用 LLM 模拟读者并做了人类研究，公平性对强模型也难 — [arXiv:2507.13841](https://arxiv.org/abs/2507.13841)【摘要】
- Cai 等，"MIRAGE"，ACL 2025，8 个剧本杀剧本，四项指标含信任倾向 — [arXiv:2501.01652](https://arxiv.org/pdf/2501.01652)【摘录】
- Murder Mystery Agents（MMAgents），Frontiers in AI 2025，四智能体模拟讨论阶段，重点是发言轮转 — [Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1582287/pdf)【摘录】
- Zhu 等，"PLAYER*"，含 WellPlay，12 局 1,482 个推理问题 — [arXiv:2404.17662](https://arxiv.org/abs/2404.17662v5)【摘录】

### Inferences
- Fair Play 这篇最贴近说书人问题：好的假信息既不能立刻穿帮，也不能永远无解。可以把「揭晓后回看时，假信息是否解释得通」作为一条独立指标，放到赛后复盘里，比预测信念容易验证得多。
- `snvWorld` 用一整套假世界保持一致，方向和这些工作一致，文献没有更好的现成方案。

### Gaps
- 没有找到专门保证多轮虚假证词彼此一致的通用算法。最接近的是 Mohr 等，而他们明确没有做撒谎。
- MMAgents 的 Frontiers 文章只看到摘录。

## Blood on the Clocktower 专门的项目

### Takeaway
已有两个可直接参考的开源求解器和一篇 LLM 试玩报告，但都没有概率，都不评估假信息，也没有同行评审论文。我们的「按信念打分」在这个圈子里似乎还没人做过。

### Cited Findings
- `olarozenfeld/botc`：C++20、SAT 模型，读一名玩家视角的对局日志，输出所有机制上可能的世界，可加「某人是邪恶」这类假设。只支持暗流涌动，明确不给概率，计划以后加入。要求角色声明齐全，通常到决赛三人才能解。Apache-2.0，7 星 — [GitHub](https://github.com/olarozenfeld/botc)【README】
- `pnkfelix/botc-asp`：用 Clingo 写暗流涌动规则，每条规则有 sat/unsat 测试，浏览器内 WebAssembly 运行，仓库也有 `snv` 目录（内容未描述）。754 次提交，3 星 — [GitHub](https://github.com/pnkfelix/botc-asp)【README】
- 同仓库的 ZDD 计划：首夜场景比 clingo 快 130–8,000 倍。最大场景是 7 人含间谍，34,020 个世界，ZDD 0.6 ms，clingo 5.0 s，ZDD 最多 510 节点。仅验证到首夜 5–7 人，第二夜交叉验证尚未实现 — [ZDD_INTEGRATION_PLAN](https://github.com/pnkfelix/botc-asp/blob/main/ZDD_INTEGRATION_PLAN.md)【仓库文档，作者自述】
- Clock Plucker：Android 工具，用 Choco Solver 做发角色的约束满足和优化，处理酒鬼、疯子、提线木偶的保留位，不做推理 — [GitHub](https://github.com/derkstample/clockplucker)【README】
- James Sullivan, "How do AI agents work together when they can't trust each other?"，2025-06-06，LessWrong 和 EA Forum 同发。几十局，Claude 3.5 Haiku、Claude 4 Sonnet、Claude 4 Opus。玩家会一起接受幻觉出来的规则，比如「真调查员能得到贞洁者的真信息」；措辞也影响行为，Investigator 这个词比 Chef、Librarian 更让人警惕。作者说明这是定性结论 — [LessWrong](https://www.lesswrong.com/posts/syYBLEkj5bGswz5yf/claude-plays-blood-on-the-clocktower-how-do-ai-agents-work)【全文，经抓取工具概括；EA Forum 原帖返回 429】
- 其他：[Ricky042/clocktower](https://github.com/Ricky042/clocktower) 是无说书人的手机版暗流涌动，只看到搜索摘录，没有打开。

### Inferences
- `botc-asp` 的规则库和测试用例可以当作第三方规则校对：把同一局喂给我们的 `enumerate()` 和它，看世界集合是否一致。这比自己写第二份 ASP 便宜。许可证是 Apache-2.0 / MIT，可参考。
- ZDD 数字说明换表示法能有几个数量级的提升，但它比的是 clingo，不是我们。7 人局 34,020 个世界用 ZDD 0.6 ms，不能和我们 15 人局 71 ms 直接比较：`botc-asp` 的世界展开方式不同，而且它只到首夜。
- Sullivan 的报告说明 LLM 模拟 BotC 时，规则幻觉本身会污染结果。如果做模拟，得先解决这个，不然测到的是模型的幻觉而不是假信息的效果。
- 在规则上已有人做，所以学术上的空白在「假信息评估」和「人的信念验证」，不在枚举。

### Gaps
- 没有找到关于 BotC 的同行评审论文。Sullivan 的帖子页面提到另一篇 "Bench on the Clocktower"，单独搜索没有找到，无法核实。
- `olarozenfeld/botc` 没有写明底层求解器和性能数据，投毒、酒鬼的建模方式在 README 里也没有描述。
- 没有检查这几个仓库的代码本身，只读了说明文件。
