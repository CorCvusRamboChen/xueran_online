# 自动游戏主持与戏剧管理：让一局游戏紧张、胶着又不作弊的研究版图

证据标记（每条都标）：
- 证据类型：【真人实验】有对照或条件比较的真人数据；【真人质性】访谈或观察；【真人场外】真人行为的观测数据（如转播收视）；【仿真】只有模拟玩家或 AI 自我对局；【理论】数学推导；【主张】从业者或作者的说法，没有公开数据。
- 阅读深度：〔全文〕我取回了 PDF 或网页并读了相关段落；〔摘要〕只读到摘要或书目页；〔二手〕只来自别人的转述、搜索摘要或媒体报道，引用前要回到原文。

项目内部材料只出现在 Inferences 里，并明确写出来源。

## 一、搜索与声明式优化的戏剧管理：优化什么，评估函数怎么来，真人上有没有用

### Takeaway
这条线最硬的教训有两个：一是搜索和强化学习的成果几乎都建立在「随机乱走加听提示」的模拟玩家上，真人验证很少；二是纯最大化一个分数，结果会收敛到几乎同一个故事。真人实验里效果最清楚的是 Yu & Riedl，它的「好」不是作者写的权重，而是从玩家评分学出来的，但实验是 CYOA 文本，不是竞争游戏。

### Cited Findings

**奠基：Weyhrauch 与搜索式 DM**
- Weyhrauch 1997 博士论文 Guiding Interactive Drama（CMU，报告号 CMU-CS-97-109，导师 Joseph Bates），架构名 Moe，策略有 SAS、SAS+（随机采样）和 MMFC（记忆化全深度搜索）。〔摘要〕论文全文在 CMU 页面标注为暂无电子版，我没读到 — [CMU CSD](https://www.csd.cmu.edu/academics/doctoral/degrees-conferred/peter-weyhrauch)；[Math Genealogy](https://mathgenealogy.org/id.php?id=50286)
- 后续工作沿用的模拟玩家来自 Weyhrauch：玩家在满足前置条件的情节点里均匀随机选，被 DM 提示过的概率提高。〔全文〕 — [Nelson et al. 2006, Reinforcement Learning for Declarative Optimization-Based Drama Management, AAMAS](https://www.kmjn.org/publications/DODM_AAMAS06.pdf)

**DODM：评估函数由作者手写**
- 作者给情节点或 DM 动作加标注，用标注定义特征，最终评估函数是按作者判断加权的特征和。〔全文〕 — [Nelson et al. 2006, AAMAS](https://www.kmjn.org/publications/DODM_AAMAS06.pdf)
- 【仿真】Nelson 等人用完整 Anchorhead 复现后认为：全深度搜索因指数爆炸不可行，浅层采样搜索不总是有效，有时很差；SAS+ 对 Anchorhead 有正面作用，但不如 Tea for Three，说明最早的正面结果不能推广到任意故事。〔全文〕 — [Nelson, Mateas, Roberts, Isbell 2006, Declarative Optimization-Based Drama Management in Interactive Fiction, IEEE CG&A 26(3)](https://www.cs.uky.edu/~sgware/reading/papers/nelson2006declarative.pdf)
- 【仿真】强化学习版本（TD 学习 + SASCE 训练范式）在 Tea for Three 和 Anchorhead 子集上优于早期方法；论文明确把「在几十名真人上测试」写成未来工作，也就是当时没做。〔全文〕 — [Nelson et al. 2006, AAMAS](https://www.kmjn.org/publications/DODM_AAMAS06.pdf)
- 【仿真】同一论文报告：在 synthetic 动作集下，分数分布窄，检查后发现生成的情节几乎全部相同，DM 找到一小撮高分故事并强行让它们发生，作者自己质疑这不是想要的结果，尤其考虑重玩价值。〔全文〕 — [Nelson et al. 2006, AAMAS](https://www.kmjn.org/publications/DODM_AAMAS06.pdf)

**目标分布 vs 最大化**
- 【仿真】TTD-MDP 把目标从「找最优轨迹」改成「实现作者指定的轨迹分布」，理由是单纯优化偏向某一条轨迹，伤害重玩性。〔全文〕 — [Roberts, Nelson, Isbell, Mateas, Littman 2006, Targeting Specific Distributions of Trajectories in MDPs, AAAI-06](https://www.kmjn.org/publications/TTDMDP_AAAI06.pdf)
- 【主张 + 仿真】Nelson & Mateas 2008 反驳：优化体验质量函数并不破坏玩家能动性，写得好的体验函数可以直接把能动性写进去；TTD-MDP 主要是加了非确定性，非确定性本身不产生能动性；技术上两者是同一类搜索的变体，缓存式离线搜索能达到相近结果。实验玩家仍是「随机行动加听提示」的模拟玩家。〔全文〕 — [Nelson & Mateas 2008, Another Look at Search-Based Drama Management, AAAI-08](https://www.kmjn.org/publications/SBDM_AAAI08.pdf)

**作者杠杆**
- 【仿真】Chen 等人用决策树学习提取等价的脚本触发逻辑，证明 DODM 比手写触发规则有作者杠杆。他们顺带确认：多数 DM 研究只提出架构和抽象评估，只有较少一部分测了对玩家体验的影响。〔全文〕 — [Chen, Nelson, Mateas 2009, Evaluating the Authorial Leverage of Drama Management, AIIDE](https://www.kmjn.org/publications/Leverage_AIIDE09.pdf)

**综述框架**
- Roberts & Isbell 给出 10 条定性评判标准：速度、协调、重玩性、作者控制、玩家自主、作者负担、适应性、可理论分析（soundness）、隐形（DM 不能显得过度操纵）、可测量。并强调部分标准互相冲突。〔全文，但 PDF 上没有出版信息，发表刊物未核实；Chen 2009 把它引作 Roberts & Isbell 2008〕 — [A Survey and Qualitative Analysis of Recent Advances in Drama Management](https://www.cs.uky.edu/~sgware/reading/papers/roberts2008survey.pdf)
- Riedl & Bulitko 指出，体验管理器该如何生成和评价叙事轨迹仍是开放问题，主要维度是作者预设程度。〔全文〕 — [Riedl & Bulitko, Interactive Narrative: An Intelligent Systems Approach, AI Magazine 34(1)](https://ojs.aaai.org/index.php/aimagazine/article/view/2449)（[预印本](https://faculty.cc.gatech.edu/~riedl/pubs/aimag.pdf)）

**Façade：按张力曲线挑 beat，不做全局优化**
- 【主张】Façade 的 beat 序列器在未使用且前置满足的 beat 里，选张力效果最贴近作者指定的短期张力弧的那个（Aristotelian 张力弧），权重和优先级也参与决定；表中列了 27 个 beat。〔全文〕 — [Mateas & Stern 2005, Structuring Content in the Façade Interactive Drama Architecture, AIIDE](https://cdn.aaai.org/AIIDE/2005/AIIDE05-016.pdf)
- 【真人质性】Milam、Seif El-Nasr、Wakkary 用现象学方法研究 Façade 玩家，部分参与者因找不到清晰目标和边界而困惑，主题里出现失去控制和无归属感；也有人把缺少目标看成新的自由。〔全文节选，参与人数未抽取到〕 — [A Study of Interactive Narrative from User's Perspective](https://summit.sfu.ca/_flysystem/fedora/sfu_migrate/43/SeifEl-Nasr_Study-of-Interactive-Narrative.pdf)

**体验管理：有真人的部分**
- 【真人实验】PaSSAGE 2007：90 名大学生，每人玩固定或自适应故事之一。全体样本对「自适应更有趣」的置信度只有 74%（45 对 45），「能动性更高」71%，作者说不足以强力支持假设。效果集中在子群：女性且觉得好跟上的玩家 93%（26 对 33）。这是事后筛选子群，且没有到 0.05。〔全文〕 — [Thue, Bulitko, Spetch, Wasylishen 2007, Interactive Storytelling: A Player Modelling Approach, AIIDE](https://www.cs.uky.edu/~sgware/reading/papers/thue2007interactive.pdf)
- 【真人实验】PaSSAGE 2010：加入社会一致的角色后，每组 38 人，全体玩家 Fun 的置信度 93.7% 和 93.0%；低游戏经验子群每组 13 人，Engaging 为 96.3% 和 98.3%。单尾 t 检验，全样本 Fun 没到 95%。〔全文〕 — [Thue, Bulitko, Spetch, Webb 2010, Socially Consistent Characters in Player-Specific Stories, AIIDE](https://cdn.aaai.org/ojs/12413/12413-52-15941-1-2-20201228.pdf)
- 【真人实验 + 真人质性】C-DraGer：22 名参与者（9 名低经验），在 Anchorhead 里各玩有 DM 和无 DM 两遍，玩家事先不知道哪遍开了 DM，事后访谈并用 Grounded Theory 分析。结论是 DM 改善体验，对低经验玩家尤其明显。论文自述的卖点就是此前的 DM 工作没有在真人上验证。作者也记录了第二遍更熟练的顺序效应。〔全文节选，未抽取到效应量〕 — [Sharma, Ontañón, Mehta, Ram 2010, Drama Management and Player Modeling for Interactive Fiction Games, Computational Intelligence 26(2)](https://sites.cc.gatech.edu/fac/ashwin/papers/er-09-10.pdf)
- 【真人实验】Yu & Riedl 2014（PBCF）：先在暂时取消玩家选择的受控系统里验证，33 名测试者比较个性化与随机故事；另做了初步研究，证明 DM 能显著改变玩家走的分支。论文指出传统评价标准完全来自设计者，而这里用模型预测玩家评分。〔全文节选〕 — [Yu & Riedl, Personalized Interactive Narratives via Sequential Recommendation of Plot Points, IEEE TCIAIG](https://faculty.cc.gatech.edu/~riedl/pubs/tciaig14-yu.pdf)
- 【真人实验】Yu & Riedl 2015：Mechanical Turk 上 80 人训练，101 人测试。HER 算法把 5 分制故事评分从 3.14 提到 3.96（p<0.001），引导成功率 81.3%；只追最高预测评分的 HR 从 3.41 到 3.50，不显著（p=0.263），引导成功率 65.7%。每分支只留一个选项时 3.28 到 3.74（p=0.004，50 人，成功率 70.8%）。核心改动是把玩家走向目标的概率算进决策，而不是只追最高分。注意设计：无 DM 是前五篇，有 DM 是第六篇，且换了故事图，存在顺序混淆。〔全文〕 — [Yu & Riedl 2015, Optimizing Players' Expected Enjoyment in Interactive Stories, AIIDE](https://cdn.aaai.org/ojs/12777/12777-52-16294-1-2-20201228.pdf)
- 【真人数据 + 离线评估】Rowe、Mott、Lester 2014：300 + 153 名中学生在 Crystal Island 里遇到随机策略选的叙事改编，日志加前后问卷构成语料，再离线归纳策略，用期望累积奖励比较。注意这是用数据估的 ECR，不是把策略重新上线测真人。论文强调奖励函数难设计，并比较了不同奖励的敏感性。〔全文〕 — [Optimizing Player Experience in Interactive Narrative Planning: A Modular Reinforcement Learning Approach, AIIDE 2014](https://cdn.aaai.org/ojs/12733/12733-52-16250-1-2-20201228.pdf)
- 【仿真】Wang 等 2017：Q 网络在 LSTM 玩家模拟器产生的合成数据上训练，在 Crystal Island 里优于线性 RL 基线。〔摘要〕 — [Wang, Rowe, Min, Mott, Lester 2017, Interactive Narrative Personalization with Deep Reinforcement Learning, IJCAI](https://www.ijcai.org/proceedings/2017/538)

### Inferences
- 评估函数的来源有三代：作者手写权重（DODM）、作者给离线代理奖励（Rowe）、从玩家评分学（Yu）。有明确真人增益的是第三代，但需要几百局带评分的数据，一个新剧本起步时没有。
- Yu 2015 最值得带走的不是推荐算法，而是 HR 输给 HER：只看最优结果、不算玩家会不会配合，增益消失。对说书人来说，这等于假信息的价值要乘以「玩家真的会这么理解」的概率。
- DODM 的窄分布问题在隐藏身份游戏里比单机更严重。单机只是重玩变差，社交推理里策略稳定后玩家能读出说书人的偏好，这是我的推断，文献没有直接测过。
- 这条线所有真人实验的样本都小，且多在子群上才显著，只能当方向性证据。

### Gaps
- Weyhrauch 论文原文没读到，他的 Tea for Three 是否有真人评估未证实。
- Sharma 2010 的定量效应量没抽出来。Drexel 条目的搜索摘要提到一项 2009 年评估里主观体验平均改善 12.5%，但没有核对是否同一批数据 — [Drexel 条目](https://researchdiscovery.drexel.edu/esploro/outputs/conferenceProceeding/Evaluation-of-a-Drama-Manager-Agent/991021869011704721)
- 没找到任何把戏剧管理用在多人竞争或隐藏身份游戏、并做真人评估的论文。

## 二、游戏 AI 导演与动态难度：玩家发现之后会怎样，公平感有什么证据

### Takeaway
工业界的导演系统几乎没有公开的对照数据，留下的是设计规则。学术上 DDA 改善表现比改善乐趣可靠。关于「被发现」的证据方向是：显眼的平衡手段可能伤害自尊，但玩家对适应的感知和实际有没有适应可以完全脱钩，所以感知和客观效果必须分开测。

### Cited Findings

**Left 4 Dead AI Director**
- 【主张】算法：给每个幸存者估一个强度值（受伤按伤害加、倒地加、被拉下平台加、近处感染者死亡按距离反比加），随时间衰减，有敌人交战时不衰减；取四人最大值。Build Up 全量威胁直到越过峰值，Sustain Peak 保持 3 到 5 秒，Peak Fade 等战斗自然结束，Relax 最低威胁 30 到 45 秒或走够距离。〔幻灯片全文，文件名为 GDC2009；一条二手来源说这些幻灯片来自 AIIDE-09 斯坦福的演讲，场合未完全确认〕 — [Booth, Replayable Cooperative Game Design: Left 4 Dead](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)；[gameanim 转述](https://www.gameanim.com/?p=1071)
- 【主张】几条可搬用的约束：Boss 遭遇不受自适应节奏影响；三种 Boss 事件（Tank、Witch、无）洗牌发放且不许连续重复；特殊感染者只在幸存者看不见的区域生成；避免手摆脚本，因为玩家很快记住位置，悬念就没了；设计师不该要求每次都发生所有内容，低概率高戏剧性才让人记得住。〔幻灯片全文〕 — [Booth](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)
- 【主张】同一份幻灯片：玩家反感明显的强制手段，所以不用隐形牵绳、把掉队者传送回来、出界伤害这类；Versus 模式的经验是人类不喜欢被明确指挥。没有给出测试数据。〔幻灯片全文〕 — [Booth](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)
- 【主张，含未公开真人测试】Valve 把导演的估算强度换成皮肤电测得的真实唤醒度，幻灯片结论是实测唤醒比估算产生更高乐趣，但幻灯片文本里没有样本量和统计量。媒体说的「两倍好玩」在幻灯片里没找到，应视为媒体说法。〔幻灯片全文 + 二手〕 — [Ambinder 2011, Biofeedback in Gameplay](https://cdn.cloudflare.steamstatic.com/apps/valve/2011/ValveBiofeedback-Ambinder.pdf)

**RimWorld 说书人**
- 【主张】官方把游戏定位为故事生成器，说书人控制随机事件的时机和类型，玩家自选节奏：Randy 不可预测，Cassandra 张力稳步上升，Phoebe 最放松。〔官网〕 — [rimworldgame.com](https://rimworldgame.com/)
- 【主张，社区整理】说书人考虑殖民地财富、建筑财富、人数、动物数、近期死亡或重伤、距上次大事件的时间。有隐藏的适应分：随时间上涨，受损时下降，难度决定增长率和影响系数。人口少时增加殖民者的事件更可能发生；另有财富无关模式。部分内容是 Steam 用户分析，页面自己注明需要进一步调查。〔社区 wiki〕 — [RimWorld Wiki: AI Storytellers](https://rimworldwiki.com/wiki/AI_Storytellers)

**DDA 的基础和实验**
- 【主张】Hunicke & Chapman 2004 提出 Hamlet：用库存论预测玩家将缺什么，只干预到让系统稳定可预测，目标是把玩家留在 flow 通道。论文里的评估只是计划（打算用心率监测），没有结果。〔全文〕 — [AI for Dynamic Difficulty Adjustment in Games](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf)
- Hunicke 2005 The Case for Dynamic Difficulty Adjustment in Games（ACE 2005）的实验结果我没拿到原文；一篇 2018 年论文转述说初步结果提升玩家表现，同时保留能动感和成就感。页码在不同引用里有 429-433 和 430-431 两种。〔二手〕 — [arXiv:1806.07637 的转述](https://arxiv.org/pdf/1806.07637)；[DOI 10.1145/1178477.1178573](https://doi.org/10.1145/1178477.1178573)
- 【真人实验】221 人的受控实验：基于表现的 DDA 组表现显著更好，但乐趣和 flow 没有显著差异。〔摘要〕 — [Robb & Zhang 2022, Performance-Based Dynamic Difficulty Adjustment and Player Experience in a 2D Digital Game, Acta Ludologica 5(1)](https://actaludologica.com/performance-based-dynamic-difficulty-adjustment-and-player-experience-in-a-2d-digital-game-a-controlled-experiment/)
- 【真人实验】50 人的情感运动游戏研究：纳入生理指标不保证更好体验；调整准确度与乐趣相关 r=0.38。〔二手，来自搜索摘要〕 — [JMIR Serious Games 2021](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8204235/)
- 一篇芬兰语硕士系统综述称 DDA 总体改善体验，但三分之一的文章根本没测体验。我没找到真正的元分析。〔二手〕 — [JYX 记录](https://jyx.jyu.fi/handle/123456789/95499)

**被注意到、公平感、对 AI 的反应**
- 【真人实验】Denisova & Cairns：两次实验用的都是没有自适应 AI 的 Don't Starve，只是告诉玩家有。Study 1（21 人，组内）告知有 AI 时沉浸感显著更高（F(1,20)=7.88, p=0.011）。Study 2（40 人，组间）总分差异 p≈0.019（表格抽取时行标题不完整），若干子量表接近显著，挑战感无差异。玩家对 AI 做了什么的解释互相矛盾。〔全文〕 — [The Placebo Effect in Digital Games: Phantom Perception of Adaptive Artificial Intelligence, CHI PLAY 2015](https://www-users.york.ac.uk/~pc530/pubs/Denisova2_CHIPLAY15.pdf)
- 【真人实验】Gerling 等 2014 比较输入、计分、时间三种平衡。最显眼的输入平衡让表现最接近，但降低了强者自尊和双方关联感；后续有轮椅使用者的研究里，玩家接受度较高，不太受显眼程度影响。〔二手：作者另一学位论文的章节和搜索摘要〕 — [Effects of Balancing for Physical Abilities on Player Performance, Experience and Self-Esteem in Exergames, CHI 2014 的条目](https://unpaywall.org/10.1145%2F2556288.2556963)；[arXiv:2012.03309 中的讨论](https://arxiv.org/pdf/2012.03309)
- 【真人实验】VR 运动游戏，14 对玩家组内比较：自适应版的公平感显著更高，胜任感和动机问卷无差异；访谈里玩家说比分接近带来动机。样本很小，工作坊论文。〔摘要〕 — [Mantz et al. 2026, Balancing Group Exergames in Virtual Reality: Fairness through Dynamic Difficulty Adaptation, UMAP-WS](https://research-portal.uu.nl/en/publications/balancing-group-exergames-in-virtual-reality-fairness-through-dyn/)
- 【真人实验】Sakaue 等 2023 用判定区调整和时间操纵，在射击游戏里降低客观难度而不改变主观难度。样本量在页面上未列。〔摘要〕 — [Reducing Objective Difficulty Without Influencing Subjective Difficulty in a Video Game, MMAsia 2023](https://pure.lib.cgu.edu.tw/en/publications/reducing-objective-difficulty-without-influencing-subjective-diff/)
- 【主张】Sid Meier GDC 2010：玩家对概率的感受不等于数学，随机坏事会让玩家觉得电脑在针对自己。〔二手，媒体转录〕 — [Game Informer](https://gameinformer.com/b/news/archive/2010/03/12/sid-meier-gamers-arent-logical)；[The Strong 博物馆博客](https://www.museumofplay.org/blog/gdc-2010-game-psychology-101/)
- 【真人实验，非 GM 场景】预注册实验 3,552 人：五种双人经济博弈里，知道对方决策由 ChatGPT 做时，公平、信任、合作和收益都下降；不确定对方是人还是 AI 时没有这种负面反应。作者认为单靠透明不能防止这种效应。〔全文网页摘要〕 — [Dvorak, Stumpf, Fehrler, Fischbacher 2025, Adverse reactions to the use of large language models in social interactions, PNAS Nexus 4(4)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11997303/)

### Inferences
- L4D 导演的约束可以翻译成：导演只能动玩家看不见的东西，关键节拍不走自适应，发牌式随机加不重复规则保证结构。这和血染的「合法选项内选择」结构相同。
- L4D 调的是节奏不是胜负，这点和隐藏身份游戏差别很大。说书人的选择直接影响谁赢，所以「把局面拉近」带有橡皮筋性质，比 L4D 的 Relax 敏感得多。
- Denisova 和 Dvorak 合起来提示：标注「AI 说书人」本身就是一个实验变量，比较两种说书人时必须保持同样的告知，否则测到的可能是标签效应。
- RimWorld 让玩家自选说书人人格，把「它在搞我」变成玩家同意过的规则。这是设计推断，没有公平感数据支持。
- 血染有 L4D 没有的东西：终局翻魔典。玩家事后能看到每一步。这让「隐形」不再是唯一防线，决策要经得起赛后解释。没有文献直接测过这一点。

### Gaps
- Valve 没有公开 L4D 导演的玩家感知或公平感数据，也没有 RimWorld 的此类数据。
- 没找到 DDA 的真正元分析，也没拿到 Hunicke 2005 原文。
- 「隐藏 DDA 与事先告知 DDA」最直接的 Aalto 硕士论文只看到题目和研究问题，页面返回 403，结论未知 — [Aalto](https://aaltodoc.aalto.fi/items/940fd4e0-96c6-491a-8613-e0983008f1cf)
- 没找到「玩家发现 DDA 后信任下降」的受控研究。Baldwin 等人的多人 DDA 工作只见到作为分类框架被引用，未核实原文。
- 要求里提到的 Mark Brown，我没有找到可核实的资料，不引用。

## 三、自动平衡与接近度指标：能算什么，和真人喜好有没有关系

### Takeaway
能算的指标很多，能证明和真人喜好相关的很少。证据最强的两块：Browne 的 Ludi 把自我对局指标和真人偏好做过相关，但我只读到二手材料；体育经济学用真实收视数据证实了悬念和意外驱动观看需求，其中贝叶斯信念波动的定义可以直接搬。Game Refinement 基本是单一团队的自我验证。

### Cited Findings

**受限对局与模拟测试**
- 【仿真 + 设计案例】Jaffe 等把平衡问题改写为受限 agent 对标准 agent 的胜率，理由是 AI 的行为不能预测人，但 AI 的技能水平和人可以相比。工具用来帮助平衡教分数的卡牌游戏 Monsters Divided。结论停留在工具让设计迭代更快，没有报告指标和真人喜好的相关。〔全文〕 — [Jaffe et al. 2012, Evaluating Competitive Game Balance with Restricted Play, AIIDE](https://cdn.aaai.org/ojs/12513/12513-52-16035-1-2-20201228.pdf)
- 【仿真】Isaksen 等用蒙特卡洛、运动技能模型的玩家和生存分析预测 Flappy Bird 变体的难度，FDG 2015 获 AI 与技术方向最佳论文。相关工作坊论文用模拟 AI 产生分数分布，并用 flappybird.io 的真人数据说明存在学习效应。〔FDG 论文只到摘要；工作坊论文全文节选〕 — [Exploring Game Space Using Survival Analysis 的条目](https://nealen.net/papers.htm)；[Isaksen & Nealen 2015, Comparing Player Skill, Game Variants, and Learning Rates Using Survival Analysis](https://cdn.aaai.org/ojs/12846/12846-52-16362-1-2-20201228.pdf)
- 【仿真】Holmgård 等 2019 用演化的 MCTS 选择准则实现程序化人格做自动测试，定位是真人反馈不易得时的工具。〔摘要，与真人对比的结果未读到〕 — [Automated Playtesting with Procedural Personas, IEEE ToG 11(4)](https://www.um.edu.mt/library/oar/handle/123456789/47265)

**Browne 的 Ludi：唯一把棋类指标和真人偏好连起来的大工作**
- 【真人偏好 + 仿真】Browne & Maire 2010 用自我对局测量 57 个美学指标，让被试成对比较 79 个现有棋类，筛出相关性最好的子集，再用它从 1,389 个演化游戏里选出 19 个。〔二手，原文未取到〕书评说筛到 17 个，一条搜索摘要说 16 个（该摘要的出处页没有逐一核对），数字未定 — [Opinionated Gamers 书评](https://opinionatedgamers.com/2018/04/23/james-nathan-cameron-brownes-automatic-generation-and-evaluation-of-recombination-games/)；书目信息见 [Maastricht 条目](https://cris.maastrichtuniversity.nl/en/publications/evolutionary-game-design)
- 书评列出的指标名含 Convergence、Uncertainty、Drama、Momentum、Uncertainty (late)、Killer moves、Clarity、Permanence。〔二手〕 — [Opinionated Gamers](https://opinionatedgamers.com/2018/04/23/james-nathan-cameron-brownes-automatic-generation-and-evaluation-of-recombination-games/)
- Drama 指落后方有翻盘可能的游戏，出处是后来的数字考古论文。〔全文节选，但这里是转述定义〕 — [Browne et al.（编）2019, Foundations of Digital Archæoludology, Dagstuhl Research Meeting 19153 报告](https://arxiv.org/pdf/1905.13516)
- 演化出的 Yavalath 被报告排进全部抽象棋类前 2.5%，这是 Humies 奖项总结里的说法。〔二手〕 — [Computer designed board game wins 2012 Humies](https://sig.sigevo.org/article4-Computer-designed-board-game-wins-2012-Humies)

**Game Refinement**
- 【仿真/记录统计】Iida 一系指标 R=√B/D（B 平均分支，D 平均长度），报告「成熟」游戏落在 0.07 到 0.08：国际象棋 0.074、围棋 0.076、篮球 0.073、足球 0.073。〔二手〕 — [MCAIT2021 页面](https://ftsm.ukm.my/mcait2021/eproceeding/files/basic-html/page234.html)；[Possible Interpretations for Game Refinement Measure](https://dl.ifip.org/hal-01771292v1)
- 该数值来自对局记录，后续多是物理类比解释。我没搜到独立团队用玩家乐趣调查验证它的工作。〔二手〕 — [Iida 与 Khalid 2020, IEEE Access 的 DOAJ 条目（页面 403，只见搜索摘要）](https://doaj.org/article/298bd2db7f01496295b74c09bf831e3b)

**悬念、意外与胶着：真人证据最硬的一块**
- 【理论】Ely、Frankel、Kamenica 定义：某一期的悬念是下一期信念的方差，意外是当前信念偏离上一期信念的程度；研究如何安排信息披露使贝叶斯观众的悬念或意外最大。〔摘要〕 — [Suspense and Surprise, Journal of Political Economy 123(1), 2015](https://ideas.repec.org/a/ucp/jpolec/doi10.1086-677350.html)
- 【真人场外】Wimbledon：80 场男单、8,563 个分钟观测，用赔率信念度量，悬念和意外都驱动收视，意外通常更重要，比赛后段影响更大。〔摘要〕 — [Bizzozero, Flepp, Franck 2016, The Importance of Suspense and Surprise in Entertainment Demand, JEBO 130](https://ideas.repec.org/p/zrh/wpaper/357.html)
- 【真人场外】英超分钟级收视约 5 万观测：悬念、意外和震惊（赛前与当前胜率之差）在控制传统不确定性后仍显著。〔摘要〕 — [Buraimo, Forrest, McHale, Tena 2020, Unscripted Drama, Economic Inquiry 58(2)](https://ideas.repec.org/a/bla/ecinqu/v58y2020i2p881-896.html)
- 【真人实验】Abuhamdeh 等操纵比分接近度：不确定性越高越有乐趣，由悬念中介；大比分胜利胜任感最高但不如胶着好玩。这是直接玩的人，不是观众；72 名本科生的数字来自媒体转述。发表年份来源不一（2014/2015）。〔二手和摘要〕 — [Enjoying the possibility of defeat, Motivation and Emotion](https://scholar.usuhs.edu/en/publications/enjoying-the-possibility-of-defeat-outcome-uncertainty-suspense-a/)；[BPS 转述](https://bps.org.uk/research-digest/why-risk-losing-more-fun-easy-win)
- 体育里的结果不确定性假说证据混杂，Jang、Kim、Lee 指出结果随模型设定变化。〔摘要〕 — [Uncertainty of Outcome Hypothesis, Review of Industrial Organization 62(3), 2023](https://ideas.repec.org/a/kap/revind/v62y2023i3d10.1007_s11151-023-09899-w.html)

**隐藏身份游戏本身的平衡理论**
- 【理论 + 仿真】Braverman、Etesami、Mossel：无侦探时，黑方和平民胜率相当当且仅当黑方人数约为总人数 R 的平方根量级；只要一名侦探，相当时的黑方规模就变成 R 的线性。〔摘要和定理节选〕 — [Mafia: A Theoretical Study of Players and Coalitions in a Partial Information Environment, Annals of Applied Probability 18(3), 2008](https://arxiv.org/abs/math/0609534)

### Inferences
- 能给隐藏身份游戏用的不是棋类指标，而是 Ely 的定义：局面的戏剧性等于「下一步信念会动多少」。这个定义天然支持隐藏信息，而 lead change 和 R=√B/D 都假设有可观察的领先者或完整动作空间。
- Bizzozero 的结果提示意外比悬念重要且越到后段越重要，但那是观众看比赛，不是玩家在局内。外推到玩家要打折。
- Braverman 说明信息流的小变化会改变平衡的量级，所以假信息不是微调参数，而是核心平衡杠杆。这是定性外推，模型比血染简单得多。
- Jaffe 的受限对局可以直接用来查假信息策略有没有制造支配性捷径，比如「永远不信第一晚信息」这样的受限 agent 是否反而更赢。

### Gaps
- Browne & Maire 2010 的 IEEE 全文和 QUT 博士论文都没取到（两个 URL 分别 404 和不是 PDF），Lead change 是否在 57 个指标内没有确认，相关系数也没有。
- 没找到 Game Refinement 的独立真人验证，以及「win probability swing」和玩家（不是观众）主观紧张的直接对照研究。
- 没找到 BotC 或狼人类游戏的胜率、接近度和乐趣关系的研究。

## 四、大模型 GM：什么会失败，怎么评估

### Takeaway
目前的真人研究规模小，主流结论是 LLM 适合辅助人类 GM。LLM 独立主持时失败集中在状态追踪、常识推理、编造工具结果，还有被玩家话术绕过规则。我没有找到一项让 LLM 说书人主持隐藏身份游戏并做真人评估的研究。现存血染 agent 项目要么说书人完全写死，要么没有评估。

### Cited Findings
- 【真人质性 + 使用记录】CALYPSO：先访谈 DM，再让 71 名玩家在 Discord 上使用四个月。结论是 LLM 辅助而非替代人类 DM。小幻觉 DM 可以接受，因为 DM 是把关人；大改设定不行。最常见失败是模型把别的工具调用也接过去，编出一个骰子结果而无视真实结果。〔全文〕 — [Zhu, Martin, Head, Callison-Burch 2023, CALYPSO: LLMs as Dungeon Masters' Assistants, AIIDE](https://arxiv.org/pdf/2308.07540)
- 【数据集】FIREBALL：近 25,000 场真实 D&D 会话，带真实游戏状态，给 LLM 状态后生成质量在自动指标和人工判断上都提高。〔摘要〕 — [Zhu et al. 2023, FIREBALL, ACL](https://preview.aclanthology.org/setup/2023.acl-long.229)（[arXiv](https://arxiv.org/pdf/2305.01528)）
- 【测试集，非真人】Skill Check：三类基础测试，GM-P-GM（玩家做出矛盾动作时 GM 能否拦下）、物品追踪、地图一致性。ChatGPT 和 Bard 在 GM-P-GM 上表现很低，物品和地图尚可；OpenAssistant 多数测试未完成。作者自评为初步实验。〔全文〕 — [Góngora et al., Skill Check: Some Considerations on the Evaluation of Gamemastering Models for Role-playing Games](https://arxiv.org/pdf/2309.13702)
- 【真人实验】ChatRPG：v1 提示词版试点 N=8，v2 多智能体（Narrator + Archivist）比较 N=12，配对 t 检验，v2 在沉浸、好奇等上显著更好。试点里玩家抱怨 GM 忘记刚捡的物品，游戏越长越差。〔全文节选〕 — [Jørgensen et al. 2025, Static Vs. Agentic Game Master AI for Facilitating Solo Role-Playing Experiences](https://arxiv.org/pdf/2502.19519)
- 【仿真】D&D Agents：LLM 同时扮裁判、玩家和怪物，27 个战斗场景，从函数使用、参数保真、表演、战术、状态追踪、函数效率六个方向打分。作者名单在来源间有差异；各模型的错误率数字只见于科普博客，未核实。〔摘要〕 — [Setting the DC: Tool-Grounded D&D Simulations to Test LLM Agents, NeurIPS 2025](https://neurips.cc/virtual/2025/128312)；[UCSD 新闻](https://today.ucsd.edu/story/from-chatbots-to-dice-rolls-researchers-use-dd-to-test-ais-long-term-decision-making-abilities)
- 【仿真，预印本】CoC-Seduce：玩家用叙事包装的话术绕过裁定，定义为 Rhetorical Injection。5,376 个对抗样本，22 个目标裁判模型；新版本和显式推理不能可靠提高稳健性，伪逻辑话术最有效。arXiv 现标题与搜索到的旧标题不同。〔摘要〕 — [Chen et al. 2026, Assessing Rule Adherence of LLM Adjudicators in Call of Cthulhu TRPG, arXiv:2607.02802](https://arxiv.org/abs/2607.02802)
- 【仿真，工程说明】Clocktower Radio：LLM 打血染的排名平台，说书人是规则引擎，只给模型当前合法动作；决策靠骰子和常见说书人模式，例如醉酒中毒的共情者总是拿到错误数字。它明说目的是测模型水平，不测有趣，且承认缺少人类说书人的细腻判断。评估用镜像对局和 Bradley-Terry。〔网页全文〕 — [How It Works](https://clocktower-radio.com/how-it-works)
- 【仿真，非正式】James Sullivan 让 Claude 当血染玩家，发现除非直接提示否则难以形成深度合作，还会不加质疑地采纳错误规则。这是玩家研究，不涉及说书人。〔二手〕 — [LessWrong](https://www.lesswrong.com/posts/syYBLEkj5bGswz5yf/claude-plays-blood-on-the-clocktower-how-do-ai-agents-work)
- BotC-AI：Node.js 命令行的 LLM 说书人，处理分配、昼夜、技能和投票。README 没写怎么决定信息、醉酒中毒，也没有评估结果；提到部分特殊规则需要继续开发。〔README〕 — [MilkyBoat/BotC-AI](https://github.com/MilkyBoat/BotC-AI)
- 【真人质性，创作者侧】Drama Llama 用自然语言触发器做 LLM storylet，6 名创作者参与初步研究；GamePlot 14 名设计师强调创作控制；Dramamancer 是设计案例。都不是运行时导演的玩家评估。〔二手〕 — [Drama Llama](https://alphaxiv.org/abs/2501.09099)；[GamePlot 概述](https://alphaxiv.org/overview/2411.02714v1)；[Dramamancer](https://arxiv.org/html/2601.18785v1)
- 【真人质性】Hirt & Lee 2025 用质性方法研究 TTRPG 里 AI 工具的使用及公平、偏见、安全的担忧，不是人与 AI GM 的对照。〔二手〕 — [Adventurers and Algorithms](https://journals.library.ualberta.ca/ojs.cais-acsi.ca/index.php/cais-asci/article/view/1888)

### Inferences
- 评估方法已成型的几类：情景单元测试（Skill Check）、状态保真打分（D&D Agents）、对抗话术（CoC-Seduce）、配对真人问卷加访谈（ChatRPG）。没有一类测「这局是否公平胶着」。
- 失败模式对血染的含义：LLM 不能持有事实状态，也不能输出判定结果；事实由引擎持有，LLM 最多说话。CALYPSO 里编骰子结果的问题，在说书人身上就是编造规则结果，代价更高，因为赛后魔典会揭穿。
- CoC-Seduce 这一条是隐藏身份游戏特有的高风险点：玩家本来就靠话术取胜，他们对说书人的话术会成为破坏公平的通道。

### Gaps
- 没找到 LLM 主持与人类主持在同一游戏里的受控对比。
- 没找到 LLM 按张力曲线做运行时导演的玩家研究，2024 到 2026 这方面搜索结果空白，也可能是索引问题，ACM DL 没有直接搜过。
- BotC-AI 等仓库的代码和维护情况没有深入检查。

## 五、读桌：从聊天和行为推断玩家信念，并用进导演

### Takeaway
「从行为和评分建模玩家」在戏剧管理里有真人证据；「从聊天读信念」在社交推理里已有不少工作，但多是 2025 到 2026 年的预印本，而且 LLM 聊天和人类聊天差别很大。「把读到的信念喂给一个活的导演」我没有找到任何实例。

### Cited Findings
- 【真人实验】Sharma：决策轨迹相似度能预测玩家对事件的兴趣；平均行动时间能明显区分玩家经验。模型不够把握时回退到作者规则的说法来自博客转述。〔全文节选 + 二手〕 — [Sharma et al. 2010](https://sites.cc.gatech.edu/fac/ashwin/papers/er-09-10.pdf)；[Emily Short 评述](https://emshort.blog/2009/10/01/drama-management-with-anchorhead-based-test-case/)
- 【真人实验】PaSSAGE 用五维玩法模型（Fighter、Method Actor、Storyteller、Tactician、Power Gamer）；Yu 的 PBCF 不预设维度，用 NMF 学到大约六类，预测误差平均在一分以内。这些都需要评分或大量行为。〔全文〕 — [Thue 2007](https://www.cs.uky.edu/~sgware/reading/papers/thue2007interactive.pdf)；[Yu & Riedl 2014](https://faculty.cc.gatech.edu/~riedl/pubs/tciaig14-yu.pdf)
- 【真人对局】DeepRole 把演绎推理并入 CFR，维护隐藏角色的联合信念，在 ProAvalon.com 2,189 局人机混合局里胜过人类。它不说话也不读聊天，论文明确不考虑自然语言策略。〔全文节选〕 — [Serrino et al. 2019, Finding Friend and Foe in Multi-Agent Games, NeurIPS](https://arxiv.org/pdf/1906.02330)
- 【真人转录 + 仿真，预印本】Kao：LLM Mafia Detector 分析转录预测黑方，35 局 LLM 对比 28 局人类，在 LLM 局上准确率更低。人类局平均 72.5 句、每句 5.93 词；LLM 局 268.63 句、每句 109.98 词。〔全文节选〕 — [Hidden in Plain Text, arXiv:2601.13709](https://www.arxiv.org/pdf/2601.13709)
- 【预印本】相关工作：MafiaScope 让 agent 每发言后私下回答结构化探针，对真实状态打分；另有测指控造成信念转移的工作、语句级测欺骗与检测的 WOLF，以及基于 100 多小时电视真人对局的 Beyond Survival。〔二手或摘要〕 — [MafiaScope](https://www.alphaxiv.org/abs/2607.10645.md)；[Do LLMs Trust the Accuser or the Accusation?](https://arxiv.org/pdf/2609.12446)；[WOLF](https://arxiv.org/html/2512.09187v1)；[Beyond Survival](https://arxiv.org/html/2510.11389v1)
- 【主张】Valve 用生理信号替代估算值，有正向表述但没有公开数据。〔幻灯片〕 — [Ambinder 2011](https://cdn.cloudflare.steamstatic.com/apps/valve/2011/ValveBiofeedback-Ambinder.pdf)

### Inferences
- 玩家信念有两个来源。规则可推出的部分（理性观察者会相信什么）可以用枚举算；真人实际相信的部分要从投票、提名、发言读。前者稳定，后者有噪声，投票和提名是比聊天更干净的信号。这是我的判断，文献没有比较过。
- Kao 的统计说明用 LLM 模拟的桌子训练或验证读桌模型，分布偏差很大。中文语音转写又多一层差异，要用真人局标定。
- 准确率不等于导演有用。一个读桌模型错的时候，导演会放大错误，应该设回退，只在把握高时才影响选择。

### Gaps
- 没找到在隐藏身份游戏里用聊天推断的信念驱动主持决策的系统。
- 中文社交推理语料和语音场景下的信念推断，这次没有专门检索，不代表没有。
- 没读到 Yoo & Kim（Kao 引用的人类转录研究）原文。

## 六、哪些方法能搬到「规则约束下由说书人选假信息」的隐藏身份游戏

### Takeaway
最能搬的是结构，不是算法：合法菜单加作者约束（Façade、L4D）、以信念波动为目标（Ely）、抽样而不取最优（TTD-MDP）、随机化收集真人日志后离线评估（Rowe）、盲法交叉实验（Sharma）。最不能搬的是用弱模拟玩家打分，和让 LLM 掌握判定。

### Cited Findings
- 判断依据全部来自上文各节，这一节的表是推断，不新增外部事实。外部事实依据：[Mateas & Stern 2005](https://cdn.aaai.org/AIIDE/2005/AIIDE05-016.pdf)、[Booth](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)、[Ely et al. 2015](https://ideas.repec.org/a/ucp/jpolec/doi10.1086-677350.html)、[Roberts et al. 2006](https://www.kmjn.org/publications/TTDMDP_AAAI06.pdf)、[Rowe et al. 2014](https://cdn.aaai.org/ojs/12733/12733-52-16250-1-2-20201228.pdf)、[Sharma et al. 2010](https://sites.cc.gatech.edu/fac/ashwin/papers/er-09-10.pdf)、[Yu & Riedl 2015](https://cdn.aaai.org/ojs/12777/12777-52-16294-1-2-20201228.pdf)、[Jaffe et al. 2012](https://cdn.aaai.org/ojs/12513/12513-52-16035-1-2-20201228.pdf)、[Chen et al. 2026](https://arxiv.org/abs/2607.02802)。

### Inferences

| 方法 | 在说书人里的对应 | 证据强度 | 判断 |
|---|---|---|---|
| Façade 按张力弧挑 beat | 每次判定从合法信息菜单里挑最贴近目标的一个 | 只有设计主张 | 采用结构；目标不写死成固定曲线 |
| L4D 约束 | 只动玩家看不到的；固定点不自适应（如开局配置和处决结算）；发牌式随机不连续重复 | 只有从业者主张，但产品成功 | 直接采用 |
| Ely 悬念 | 用枚举或抽样世界算阵营胜率或恶魔身份后验，看下一步信念方差 | 理论，体育收视支持 | 优先试验；信念模型未验证前只当诊断指标 |
| DODM 搜索 | 向前模拟几步打分 | 仿真，且搜索效果不稳定 | 不当主算法；分数只用来排除极差选项 |
| TTD-MDP 目标分布 | 在够好的合法选项里按分布抽，不取最优 | 仿真 | 采用思路，防止行为可被读出 |
| 个性化推荐（PBCF、HER） | 新手桌与老手桌用不同风格 | 真人，但在单人 CYOA | 暂缓，先积累数据；HER 的教训要立刻用：考虑玩家会不会这样解读 |
| Jaffe 受限对局 | 用「全信第一晚」「永不信」等 agent 查支配策略 | 仿真工具 | 采用，用于回归测试，不用于判断有趣 |
| Rowe 随机日志 + 离线评估 | 在同样合法的选项里随机化并记录，配赛后问卷 | 大样本真人数据收集，评估离线 | 采用，这是目前最现实的数据路线 |
| Sharma 盲法交叉 | 同一批人玩两种说书人，不告知，赛后翻魔典前先打分 | 小样本真人 | 采用，要平衡顺序，要避开 Denisova 式的标签效应 |
| LLM 全权说书 | 由模型决定信息和规则 | 失败证据多 | 不采用 |
| LLM 读桌和说话 | 把发言抽成结构化信号；生成台词 | 部分真人支持辅助用法 | 采用，事实和判定留在引擎 |

几条贯穿的判断：

1. 隐藏身份游戏和这些文献有三处根本差异。一是多人对抗，说书人的优化对一方有利就对另一方不利。二是决策输出是信息，要进入玩家的推理才起作用，所以价值取决于玩家怎么解读。三是赛后全部公开，决策必须经得起解释。戏剧管理文献基本没覆盖这三点。
2. 「接近」和「公平」要分开。推断上，一局一局把胜率往 50% 拉，等于惩罚打得好的一方，属于橡皮筋。文献支持的目标是过程中不确定性（Abuhamdeh、Bizzozero），不是强制胜负接近。建议把强目标放在「到后期结果仍未定」，并把修正幅度限制在规则已给说书人的自由度内。
3. 不要用会被玩家发现的模式换接近度。Booth 和 Roberts & Isbell 都强调不要显得操纵，Gerling 显示显眼平衡有代价。但 Sakaue 和 Denisova 显示感知和实际可以脱钩，所以「玩家没觉得」不能证明「系统公平」，二者都要测。
4. 模拟评估的上限是显而易见的。DODM 整条线就是在弱模拟玩家上做优化。项目记忆文件 `world-enum-prototype.md` 记录，暗流涌动世界枚举原型在洗衣妇、送葬者判定上最好和最差只差 1 到 3 个百分点，而机器人是随机选人；这个结果不能说明选择不重要，只能说明这个模拟玩家区分不出来。这和 Nelson 2006 用弱玩家模型的情形相同。
5. 证据缺口决定了最小可行研究：用现有线上局随机化合法选择，记录每个决策点的选项、枚举信念和投票，赛后加两三题的短问卷（紧张、公平、后悔被骗）。Rowe 的做法是先用真人收集随机策略数据再做策略比较。少量局数做不了策略学习，但足以校准模拟玩家。

### Gaps
- 没有任何已发表研究直接回答「说书人选哪条假信息能让局更好」，上表全是跨领域外推。
- 这些方法在 7 到 15 人语音局里的计算和样本成本没有文献支撑，需要项目内部实测。
- 随机化线上局的伦理和体验风险（玩家是否接受被实验）未研究；如果涉及真实玩家数据，要考虑告知方式，且告知本身会影响结果（见 Denisova、Dvorak）。
