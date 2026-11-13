# 人类说书人怎么带梦殒春宵（Sects & Violets）：可供程序模仿的做法

调研日期 2026-10-31。

**读这份笔记前要知道的三件事**

1. **置信度标记**：[高] 官方百科「How to Run」或设计师 Steven Medway 本人文字，且写给说书人。[中] 官方百科但写给玩家（如「伪装成 X」「Tips」），是我借用过来的；或两个以上社区来源一致。[低] 单一社区文章、中文攻略或搜索摘要。
2. **来源缺口很大**：Reddit 不允许抓取（WebSearch 直接拒绝该域名，redlib 镜像在维护）；知乎 403；B 站验证码；BGG 403；YouTube 和播客只有标题没有文字稿；bloodontheclocktower.com 多次 429。所以「老说书人的第一手经验帖」大多没拿到，英文实战经验主要靠官方百科和几篇 Substack。最值得人工补读的三份见最后一节 Gaps。
3. **网页内容经过摘要模型转述**，引文来自抓取结果，没有逐字对原文。写给谁、在哪个小节，我对关键条目做了二次核实（已注明）。

本地基线不重复：`.claude/skills/botc-storyteller/references/sects-and-violets.md`（角色规则）、`design/wiki-raw/rules/给说书人的建议.txt`（帮弱势方、不破坏规则、出错不补偿、拖到最后一天）、`疯狂规则如何运作？——疯狂的小精灵.txt`（Steve 的「像判幽默一样判疯狂」、优先看最近言行）、`设计师的平衡天书.txt`。下文只在需要对照时提到它们。

---

## 问题一：怎么给醉酒中毒的玩家规划假世界，提前多久，信息互相矛盾怎么办

### Takeaway
没有找到任何官方或知名说书人写过的「假世界规划法」。能确认的是一组零散原则：假信息是选项不是义务；先想它对邪恶的伪装有什么用；真正的目标是制造冲突而不是让人相信；要保留可解的路径。「提前多久」没有可靠来源，下面的流程是我的归纳。

### Cited Findings
- [高] 中毒者也可以拿到真信息，且这时不算「能力未生效」：中毒的共情者拿到真信息不计入数学家 — [Mathematician](https://wiki.bloodontheclocktower.com/Mathematician)
- [高] 假信息的目标不是被相信：「it just needs to conflict with the other information at the table」，高手攻击的是许多推论共同依赖的前提，而不是末端结论（Medway，本文写给邪恶玩家，他在结尾说这个系列也能帮说书人给玩家创造更多乐趣） — [Behind the Curtain #3](https://www.tumblr.com/bloodontheclocktower/184354999130/behind-the-curtain-3-strategy-beginner)
- [高] 筑梦师是官方给出的「假信息选择」最清楚的样本：How to Run 和 Examples 都写明，选中邪恶玩家时，帮邪恶就展示他正在伪装的角色，或展示 Snake Charmer / Sage / Mutant / Klutz 这类「不方便跳身份」的角色，帮善良就展示另一个善良角色。邪恶项「almost always show real Dreamers in-play Minions」（这句在「伪装成筑梦师」小节但写明是说书人的做法，已二次核实） — [Dreamer](https://wiki.bloodontheclocktower.com/Dreamer)
- [低] 决定给中毒者什么时，第一步先看它对邪恶方的影响：假信息可以藏恶魔，真信息也可能帮邪恶诬陷圣徒（作者 Danielle，社区客座文） — [herefor.games](https://herefor.games/knowledge/blood-on-the-clock-tower-story-teller-tips/)
- [低] 邪恶不太可能赢时，给中毒的守鸦人看某个邪恶玩家正在伪装的角色（Penny Brookes） — [Zatu](https://zatu.com/blogs/how-to-play/blood-on-the-clocktower-storytellers-guide)
- [低] 好的说书人会预判玩家的解法，并卡时机用假信息打断；「The best storytellers have a knife's-edge sense of balance.」 — [3thanguy7](https://3thanguy7aov.substack.com/p/some-thoughts-on-blood-on-the-clocktower)
- [低] 假信息要「hard to detect, but not completely impossible to solve」（Squ4ll） — [Script Studies #1](https://squ4ll.substack.com/p/script-studies-1-helping-evil-blend)
- [低] 按「形状」看假信息：纵向（同一人全程，如酒鬼、诺-达鲺）好解，二维（每晚换人，如投毒者）近乎任意；太少太容易解，太多变成无解，后者更该怪说书人而不是剧本。亡骨魔的假信息可追溯 — [Hystrex](https://hystrex.substack.com/p/misinformation-in-blood-on-the-clocktower)
- [低] 新手说书人的减负法：把每次决定缩到规则允许的小选项集（如 0/1/2），真实局面放在魔典里不放脑子里（Kaylee Kim，自述只带过头几局，说明这是新手做法） — [Kaylee Kim](https://blog.kayleesk.com/storytelling-botc/)
- [低] 指定酒鬼是一次重要决定：新手恶魔邻座时把共情者做成酒鬼，减轻新手压力；两人都是老手就换别人（Brendan H，279 局，其中约 170 局说书，主要带新人） — [hamiltonianurst](https://hamiltonianurst.substack.com/p/the-shortest-possible-pitch-for-why)

### Inferences
以下是我的归纳，不是来源的说法。

- 「伪世界」最简单的实现：**把邪恶方已公开的伪装当成事实，算一遍每个信息角色在那个世界里该拿到什么，再把这个结果给中毒者。** 这同时满足 Medway 的「制造冲突」、官方「配合邪恶伪装」和筑梦师示例。
- 信息互相矛盾在 S&V 里不是事故，是目的。要避免的只有一种情况：矛盾找不到任何解释。程序可以每晚检查：是否仍存在至少一个与全部已发信息相容的世界，且这个世界包含真实局面。
- 提前量的合理假设：首夜定一条主线，之后每晚只做一步调整，因为角色和阵营会变，提前排多夜意义不大。无来源支持，需要实测。
- 程序可用的打分顺序：合法 → 对邪恶伪装的帮助 → 打击的前提有多关键 → 是否还留有解 → 是否破坏局面均衡。

### Gaps
- 没找到任何人写「我提前几晚规划」。
- 搜索摘要提到一条中文说法「醉酒中毒若 100% 给错，玩家能从规律推出状态」，未能定位到原文，不能引用。
- 「两名中毒者的假信息是否要彼此印证」这类细节没有来源。

---

## 问题二：涡流局怎么选假信息，没处决的日子怎么用

### Takeaway
涡流下「错」是硬规则，说书人只能选「错成什么」。很多信息是二值的（女裁缝、卖花女孩、公告员、艺术家），根本没得选；真正的选择在数字和多选项信息上。官方百科没有写选法。没处决就是当天黄昏邪恶获胜，这不是说书人能「使用」的工具，能动的只有疯狂处决这条线。

### Cited Findings
- [高] 只影响镇民能力信息；规则解释、角色和阵营变化（麻脸巫婆通知）不受影响。只要涡流活着，每次都必须给错 — [Vortox](https://wiki.bloodontheclocktower.com/Vortox)；[钟楼百科·涡流](https://clocktower-wiki.gstonegames.com/index.php?title=涡流)
- [高] 官方示例：贤者被杀，看到的两人都不是恶魔。博学者两条都假。筑梦师选中博学者，看到哲学家或诺-达鲺（选涡流时看到 Oracle 或 No Dashii，永远不出现涡流）。当天无人投票无人提名但畸形秀演员被处决时，卖花女孩和公告员都得到假的「是」 — [Vortox](https://wiki.bloodontheclocktower.com/Vortox)；[Dreamer](https://wiki.bloodontheclocktower.com/Dreamer)
- [高] 舞蛇人得知「谁不是恶魔」是能力的副作用，涡流下仍是真的 — [钟楼百科·涡流](https://clocktower-wiki.gstonegames.com/index.php?title=涡流)
- [高] 涡流示例里 6 个能力异常，数学家得到 4，说明数学家的数也得错 — [Mathematician](https://wiki.bloodontheclocktower.com/Mathematician)
- [高] 问艺术家「有涡流吗」永远是否；问已知为真的事（2+2=4）得到否就说明被污染 — [Artist](https://wiki.bloodontheclocktower.com/Artist)
- [高] 设计意图：好人注意到后回溯并把信息反转，才开始真正获益 — [Behind the Curtain #5](https://www.tumblr.com/bloodontheclocktower/186630757755/behind-the-curtain-5-beyond-trouble-brewing)
- [中] 玩家侧判断线：「5 or 6 pieces of information that don't match usually indicates a Vortox」；说真话的人多半是邪恶，或是舞蛇人、贤者、畸形秀演员（写给好人） — [Vortox](https://wiki.bloodontheclocktower.com/Vortox)
- [中] 涡流玩家的技巧：掺入真的、可证明的信息掩盖涡流；已被怀疑时反过来秀明显的假信息（写给恶魔玩家） — [钟楼百科·涡流](https://clocktower-wiki.gstonegames.com/index.php?title=涡流)
- [中] 假数字的合理性（均写给「伪装成该角色的邪恶玩家」，我借用为说书人选假值的参考）：
  - 钟表匠：小数字最自然，半场人数意味着正对面，多爪牙时大数字不可信 — [Clockmaker](https://wiki.bloodontheclocktower.com/Clockmaker)
  - 神谕者：从 0 缓慢上升（0, 1, 1, 1, 2），1, 2, 3 连跳可疑；跳升要贴合事件，比如处决了嫌疑人时 +1 — [Oracle](https://wiki.bloodontheclocktower.com/Oracle)
  - 数学家：0 或 1 最常见，首夜尽量 0，数字随事件变化，且可以刻意配合或冲突于某种恶魔 — [Mathematician](https://wiki.bloodontheclocktower.com/Mathematician)
- [低] 反转后仍有信息量，且因角色而异：女裁缝反转后保留的比筑梦师多；因为错到处都是，涡流依然可解 — [Hystrex](https://hystrex.substack.com/p/misinformation-in-blood-on-the-clocktower)
- [低] 涡流这类恒定效果叠加疯狂时，极难判断能力是否正常 — [Script Studies #1](https://squ4ll.substack.com/p/script-studies-1-helping-evil-blend)
- [高] 没处决即当天黄昏邪恶获胜，流放旅行者不算；百科建议好人除非确定没涡流，否则天天处决，第一天也别跳过；畸形秀演员被处决算处决（示例隐含）。百科没写说书人要不要在黄昏提醒，也没写疯狂处决 — [Vortox](https://wiki.bloodontheclocktower.com/Vortox)
- [低] 处决死亡玩家也算满足涡流条件（攻略转述） — [游民星空](https://www.gamersky.com/handbook/202204/1474559.shtml)
- [低] Scriptorium（粉丝站，疑似自动生成，只作线索）称要在开局前规划好夜晚信息，并点名博学者最难做，因为两条都要假 — [Scriptorium](https://www.botcscriptorium.com/characters/vortox/)

### Inferences
- 涡流下的选择空间，由规则推出（无来源直接这样分类）：
  - **无选择（二值）**：女裁缝、卖花女孩、公告员、艺术家（除非答「我不知道」，涡流下是否可答未查到）。
  - **小选择（数字，排除真值）**：钟表匠、神谕者、数学家、杂耍艺人。
  - **大选择（组合）**：筑梦师、贤者、博学者。这三个才是涡流局说书人真正写剧本的地方。
- 排除真值带来可被利用的特征：真值是 0 时神谕者不能说 0。程序不能简单照抄「从 0 缓升」，要先减去真值。
- 「连贯」的做法：在大选择上构造同一个假世界（比如固定一名被诬陷的善良玩家），让早期信息彼此印证，这样前两天不是立刻露馅。「5 或 6 条对不上」这条判断线说明好人预期有几天的识别过程。这是推断，无人明确这样说。
- 防立刻穿帮的最低检查：不让两条互斥的假信息在第一天就同时公开成立到「只有涡流能解释」。但这和「可解」方向相反，要留足后段反转的线索。
- 疯狂处决能决定涡流局当天有没有处决。官方基线允许「处决该疯狂而没做的玩家」结束游戏，理由是这是玩家自己的选择；但同一份基线禁止利用规则决定胜负。程序建议：判定标准不要因为今天是不是「救场/杀局」而改变。

### Gaps
- 没有任何来源写「涡流局我怎么排信息」。Cult of the Clocktower 2.6 Vortox 一集应当有，但只能取到标题：[YouTube](https://www.youtube.com/watch?v=L2yYwE-j5aQ)。
- 说书人是否该在黄昏提示「今天没处决」未找到来源。
- 百科 Vortox 页和 Scriptorium 都未说明「涡流下艺术家能否答我不知道」。

---

## 问题三：疯狂（洗脑师、畸形秀演员、麻脸巫婆造出的角色）判多严，什么时候处决

### Takeaway
官方明确不给硬标准，看意图和效果，可以放过，新手从宽老手从严。可模仿的是一组信号：是否主动声称、被问是否沉默、是否眨眼暗示、是否有私下泄露。

### Cited Findings
- [高] 洗脑师：判断的是有没有真实努力去说服大家，光暗示不够；说书人可以不处决，尤其针对邪恶玩家，防止邪恶靠这个获胜 — [Cerenovus](https://wiki.bloodontheclocktower.com/Cerenovus)
- [高] 对新手宽、对老手严（Tips 小节，写给说书人，已二次核实） — [Cerenovus](https://wiki.bloodontheclocktower.com/Cerenovus)
- [中] 破疯狂的死人也能被处决，并消耗当天处决（写给洗脑师玩家和好人，未见于 How to Run，已二次核实） — [Cerenovus](https://wiki.bloodontheclocktower.com/Cerenovus)
- [中] 把人洗成畸形秀演员是自曝洗脑师（写给洗脑师玩家，提示说书人这类夜间选择是可能出现的） — [Cerenovus](https://wiki.bloodontheclocktower.com/Cerenovus)
- [高] 畸形秀演员示例：
  - 早早宣布自己是畸形秀演员：立刻处决，当天不再提名。
  - 别人私下告诉说书人他说过某话：可立刻处决。
  - 被问时沉默约一分钟：处决。
  - 跳镇民，再眨眼说「绝对不是畸形秀演员」：可处决。
  - 夜里暗示：可当夜处决，第二天白天仍有处决。
  - 「可能是可能不是」这类含糊话也可能算在证明。
  - 可以放过，比如保留其身份的模糊性，但被放过的人会显得可疑。
  - 白天处决会挡掉博学者、艺术家、杂耍艺人使用能力。

  来源 — [Mutant](https://wiki.bloodontheclocktower.com/Mutant)
- [高] 示例：麻脸巫婆把善良双子变成畸形秀演员，两个双子都称畸形秀演员，说书人处决了他，邪恶获胜。官方承认疯狂处决能直接结束游戏 — [Evil Twin](https://wiki.bloodontheclocktower.com/Evil_Twin)
- [高] 心上人把畸形秀演员灌醉时，他可以安全跳身份，但自己不知道（官方示例） — [Sweetheart](https://wiki.bloodontheclocktower.com/Sweetheart)
- [低] 社区 FAQ 的说法：破疯狂可以等到当天结束再处决，但当天不罚之后就别再追究（搜索摘要转述，未读到原帖，来源为 r/BloodOnTheClocktower FAQ） — [redlib 镜像（当前维护中）](https://redlib.hbubli.cc/r/BloodOnTheClocktower)
- [低] Vati：洗脑师需要高水平说书，否则同时显得压迫和无聊。畸形秀演员在没有方古或利维坦的剧本里常因玩家早退而失败，在假信息静态可解时最好 — [Script Studies #1](https://squ4ll.substack.com/p/script-studies-1-helping-evil-blend)
- [低] 被质疑时的沉默同样可能被视为疯狂；邪恶玩家可不处决 — [游民星空](https://www.gamersky.com/handbook/202204/1474559.shtml)

**来源分歧**：Steve 在小精灵的帖子里（本地基线）按长期总体印象判，优先最近言行；畸形秀演员示例是「一句话就处决」。这不矛盾但尺度不同：小精灵是奖励型，持续整局，畸形秀演员和洗脑师是惩罚型，看单日或单句。百科对畸形秀演员的沉默判处决，社区 FAQ 偏向当天结算，时点细节未统一。

### Inferences
- 程序可用的判定特征：主动声称目标身份的次数和强度；被直接问时的回应；否认中是否带暗示；是否有其他玩家举报；与上一阶段说法是否矛盾；玩家经验等级。
- 两档阈值：新手要看到一次明确声称即可过；老手要在被追问时守住。
- 处决动作前三个硬检查：今天是否已有处决（官方一天一次）；此人是否善良双子；处决是否直接结束游戏。若直接结束且是邪恶玩家受益，官方允许放过，建议转人工或默认放过。
- 「放过」要低调，因为官方指出被放过的畸形秀演员本身是信息。
- 项目现状（AI 判定）的风险：转写看不到眨眼和语气，官方最依赖的信号之一拿不到。

### Gaps
- Harpy 不在 S&V，本次未查。
- 邪恶畸形秀演员（比如麻脸巫婆把邪恶玩家变成畸形秀演员）怎么判，百科没有明确说明。
- Reddit 上的实战判例拿不到。

---

## 问题四：麻脸巫婆，怎么用「当晚死亡由说书人决定」，又保持公平

### Takeaway
这是说书人最大的合法干预点，官方建议把死亡人数当成给好人的信号：恶魔换形态时 0 死，新造邪恶恶魔时死旧恶魔加一人。场上不留两个邪恶恶魔。

### Cited Findings
- [高] 造出恶魔时说书人可选择杀谁或保谁来平衡局面，额外死亡算麻脸巫婆的攻击 — [Pit-Hag](https://wiki.bloodontheclocktower.com/Pit-Hag)
- [高] 恶魔变成另一种恶魔：「it is best to make no death occur tonight」，可照常唤醒恶魔看他选谁，然后无人死亡，算是给好人的提示。是建议不是规定（已二次核实） — [Pit-Hag](https://wiki.bloodontheclocktower.com/Pit-Hag)
- [高] 新造邪恶恶魔：杀旧恶魔外加一人，以此发信号 — [Pit-Hag](https://wiki.bloodontheclocktower.com/Pit-Hag)
- [高] 造出善良恶魔：决战夜杀其中一个，其他夜可让两个都留着；对邪恶有风险。示例：决战夜把神谕者变成善良诺-达鲺，说书人只杀邪恶恶魔 — [Pit-Hag](https://wiki.bloodontheclocktower.com/Pit-Hag)
- [中] 不允许多个邪恶恶魔同时存活（Tips 小节的描述） — [Pit-Hag](https://wiki.bloodontheclocktower.com/Pit-Hag)
- [高] 由此造成的死亡不唤醒贤者，贤者「死了但没信息」本身是线索 — [Sage](https://wiki.bloodontheclocktower.com/Sage)
- [中] 好人的读法：夜里死亡多于一人暗示新恶魔；0 死暗示换形态。被麻脸巫婆变身的人往往可信，应次日公开（写给好人） — [Pit-Hag](https://wiki.bloodontheclocktower.com/Pit-Hag)
- [中] 数学家从 0 跳到 2 可能说明造出了诺-达鲺 — [Mathematician](https://wiki.bloodontheclocktower.com/Mathematician)
- [低] 攻略写法不同：「恶魔行动无效，说书人可让不超过恶魔数量的玩家死亡」，并称当晚所有恶魔对数学家都算未生效。官方英文百科和本地整理都没有这个人数上限，**与官方页不一致**，疑似旧版或攻略自述，不要采用 — [游民星空](https://www.gamersky.com/handbook/202204/1474559.shtml)

### Inferences
- 公平的核心是「死亡人数 = 诚实信号」：说书人的权力不是用来偷偷决定输赢，而是用可解读的方式公布发生了什么。程序默认走官方三个分支，只在局面严重失衡时偏离，并记录原因。
- 官方「自由」的边界：可选杀谁，不能借此把最后一个邪恶杀掉结束游戏（基线「不要利用规则使一方获胜」）。
- 选「杀哪一个」时，应优先杀已暴露、不影响信号解读的玩家。无来源，属推断。
- 麻脸巫婆是夜晚顺序靠前的角色，当晚所有后续信息都要按变化后的局面计算（本地基线）；涡流相关变化通知不受影响，所以新涡流当晚的信息要立刻按错的给。

### Gaps
- 没有找到「老说书人如何挑选额外死亡目标」的具体做法。
- 新造恶魔当晚是否算入邪恶黎明人数等细节未查。

---

## 问题五：四个恶魔的差异，以及各角色的具体选择点

### Takeaway
恶魔决定说书人的工作量：方古基本不用造假，诺-达鲺固定两人，亡骨魔说书人有选边权，涡流全错。角色的选择点集中在贤者、筑梦师、博学者、心上人和亡骨魔选边。

### Cited Findings

**恶魔**

- [高] 设计定性：方古信息基本全真（除了恶魔换人）；诺-达鲺两名镇民中毒，认出就找到恶魔；亡骨魔在爪牙夜死时镇民中毒；涡流全假 — [Sects & Violets](https://wiki.bloodontheclocktower.com/Sects_%26_Violets)；[Behind the Curtain #5](https://www.tumblr.com/bloodontheclocktower/186630757755/behind-the-curtain-5-beyond-trouble-brewing)
- [高] 方古：说书人没有裁量点，[+1 外来者]，新方古不知爪牙，爪牙最好事先商量（否则会惊讶）。数学家一直 0 暗示方古 — [Fang Gu](https://wiki.bloodontheclocktower.com/Fang_Gu)
- [高] 诺-达鲺：说书人不选谁中毒，邻座随角色变化立刻移动。百科只说这两人信息「probably false」，没写怎么给 — [No Dashii](https://wiki.bloodontheclocktower.com/No_Dashii)
- [中] 诺-达鲺的玩家技巧：别杀中毒邻座，让假信息继续流动；被怀疑时杀一个邻座，或把风向带到涡流 — [No Dashii](https://wiki.bloodontheclocktower.com/No_Dashii)
- [高] 亡骨魔：**说书人在左右两名最近镇民之间选**。示例里被杀的镜像双子坐在呆瓜和卖花女孩之间，说书人选了呆瓜另一侧的贤者（跳过外来者）。死镇民也可以被选 — [Vigormortis](https://wiki.bloodontheclocktower.com/Vigormortis)
- [中] 活着的错信息镇民有时比死掉的可信镇民伤害小，亡骨魔可据此选爪牙（写给玩家）。此前真、突然变假的信息指向亡骨魔或心上人 — [Vigormortis](https://wiki.bloodontheclocktower.com/Vigormortis)
- [高] Medway 专门加强过亡骨魔来补邪恶（S&V 早期胜率约 52-53%，好人略高，转述值） — [Behind the Curtain #7](https://www.tumblr.com/bloodontheclocktower/655025729437925376/behind-the-curtain-7-balance)

**角色**

| 角色 | 说书人的选择点 | 置信度 | 来源 |
|---|---|---|---|
| 贤者 | 早死指两名活人（给邪恶留一线生机）；决战夜可指一活一死。麻脸巫婆造成的死亡不唤醒 | 高（How to Run，已核实） | [Sage](https://wiki.bloodontheclocktower.com/Sage) |
| 筑梦师 | 真实类型的反面组里选假项；邪恶选中时帮谁取决于展示什么；邪恶项几乎都用在场爪牙 | 高 | [Dreamer](https://wiki.bloodontheclocktower.com/Dreamer) |
| 女裁缝 | 二值，无选择；检查的是同阵营而非善良；麻脸巫婆变身后按阵营算 | 高 | [Seamstress](https://wiki.bloodontheclocktower.com/Seamstress) |
| 钟表匠 | 只有首夜，中毒时选数字；百科未写规则，小数字最自然（借用） | 中 | [Clockmaker](https://wiki.bloodontheclocktower.com/Clockmaker) |
| 神谕者 | 中毒时的数字；缓升（借用）；倒放的镇民外来者标记算邪恶 | 中 | [Oracle](https://wiki.bloodontheclocktower.com/Oracle) |
| 卖花女孩 | 二值；死恶魔也算；恶魔换人时算当时的恶魔；忘记时可唤醒恶魔出示 DID YOU VOTE TODAY，恶魔须如实回答。全员投票却得「否」说明涡流或中毒 | 高 | [Flowergirl](https://wiki.bloodontheclocktower.com/Flowergirl) |
| 公告员 | 二值；忘记时唤醒爪牙问；提名旅行者后被流放不算 | 高 | [Town Crier](https://wiki.bloodontheclocktower.com/Town_Crier) |
| 舞蛇人 | 无信息要选；操作：互换标记和阵营，原恶魔永久中毒，须告知双方 | 高 | [Snake Charmer](https://wiki.bloodontheclocktower.com/Snake_Charmer) |
| 哲学家 | 无裁量，选到在场角色时持有者醉酒；之后才入场的也醉；哲学家死亡、醉酒中毒时恢复 | 高 | [Philosopher](https://wiki.bloodontheclocktower.com/Philosopher) |
| 理发师 | 恶魔选，可放弃可选自己，不能选其他恶魔；多个恶魔活着时说书人定谁选；可涉及死人；建议提醒阵营未变 | 高 | [Barber](https://wiki.bloodontheclocktower.com/Barber) |
| 镜像双子 | 说书人定善良双子；很少选旅行者；同阵营时重选；麻脸巫婆把好人变双子时他仍善良，对面才是对立双子 | 高 | [Evil Twin](https://wiki.bloodontheclocktower.com/Evil_Twin) |
| 心上人 | 通常选镇民；**邪恶大优时可选外来者、爪牙甚至恶魔**，醉恶魔当夜杀不了人 | 高（How to Run，已核实） | [Sweetheart](https://wiki.bloodontheclocktower.com/Sweetheart) |
| 博学者 | 以镇民能力能得出的东西为素材；别直接说谁是恶魔；用词要准；想不出可让他过会再来；示例可以是「戴眼镜的都是好人」 | 高 | [Savant](https://wiki.bloodontheclocktower.com/Savant) |
| 艺术家 | 答不了的问题让他换问法；「我们赢了吗」可答我不知道 | 高 | [Artist](https://wiki.bloodontheclocktower.com/Artist) |
| 杂耍艺人 | 猜时中毒、当晚健康仍给真；可在假杂耍时假装动标记配合邪恶 | 高 | [Juggler](https://wiki.bloodontheclocktower.com/Juggler) |
| 女巫 | 每次死亡后都检查是否到三人，到了立刻解除 | 高 | [Witch](https://wiki.bloodontheclocktower.com/Witch) |

### Inferences
- **说书人的合法杠杆清单**（可做成程序的配置）：亡骨魔选边、心上人醉谁、麻脸巫婆当夜死亡、双子配对、筑梦师展示项、贤者两人、博学者内容、涡流以外所有中毒者的信息。
- 方古局说书人几乎没有假信息杠杆，只有心上人和麻脸巫婆；平衡只能靠后两者和时间。
- 诺-达鲺的两名中毒者是唯一的破局路径，假信息不要彻底融入主线，要留一点「只有这两人反常」的痕迹。
- 贤者「两活人」是个有趣的约束：程序不能在早期为了刺激而指死人。

### Gaps
- 百科未写诺-达鲺邻座具体该给什么。
- 女裁缝、钟表匠中毒时的选值没有说书人向的文字。
- 涡流下贤者是否可以指死人未查到。

---

## 问题六：怎么平衡一边倒的局，不做什么，怎么读场

### Takeaway
官方和社区一致：帮弱势方，用合法杠杆，目标是决战日。分歧在于「能不能给玩家提示」「说书人算不算公正裁判」。读场方法几乎没有成文，只有人数粗算和按经验调整。

### Cited Findings
- [高] Medway：说书人只有犯大错或故意破坏才会真正失衡；一般帮邪恶伪装、好好带局，就平衡了。大部分失衡来自一方打得更好。胜率统计比败者抱怨可靠。好人随机处决也有约 45-55% 胜率 — [Behind the Curtain #7](https://www.tumblr.com/bloodontheclocktower/655025729437925376/behind-the-curtain-7-balance)
- [低] 工具是假信息和何时结束白天，**不是**拉人给策略建议，也不是破坏规则（Penny Brookes） — [Zatu](https://zatu.com/blogs/how-to-play/blood-on-the-clocktower-storytellers-guide)
- [低] 时间是杠杆：好人时间无限时邪恶跟不上，尤其最后三人；太短又不好玩（Kaylee Kim，新手） — [Kaylee Kim](https://blog.kayleesk.com/storytelling-botc/)
- [低] 读场粗算：1 恶魔约等于 3 镇民，1 爪牙约等于 2 镇民，3 红 3 蓝时蓝方可能已难挽回；但不能只看人数，要结合发言和死人关键票（作者蒹葭自己的推断） — [游民星空说书人手册](https://www.gamersky.com/handbook/202204/1478895_3.shtml)
- [低] 按经验调整解读：新手是好人也常显可疑，老手行为反常；留意大嗓门压过安静玩家，并给安静玩家开口的理由。目标是「preserve player agency while making a fun and exciting experience for everyone」 — [hamiltonianurst](https://hamiltonianurst.substack.com/p/the-shortest-possible-pitch-for-why)
- [低] 判断玩家类型，在他们之间走动，分析心理预测走向；核心比喻「混乱中立的端水大师」 — [静电森林·机核](https://www.gcores.com/articles/150747)
- [低] 说书人通常帮落后方，但看准邪恶何时不再落后是难题 — [3thanguy7](https://3thanguy7aov.substack.com/p/some-thoughts-on-blood-on-the-clocktower)
- [低] 每个夜晚和白天结束都复查魔典标记；夜末请该醒没醒的举手 — [herefor.games](https://herefor.games/knowledge/blood-on-the-clock-tower-story-teller-tips/)

**来源分歧**

- **能不能给玩家提示**：蒹葭主张可以给落后方建议（提示恶魔选不在场角色、示意投毒者重选，最多三次），并说只要规则没禁止，说书人的话就是规则 — [游民星空](https://www.gamersky.com/handbook/202204/1478895_3.shtml)。这与 Zatu 的「不给策略建议」以及本地官方建议「让玩家们自己做决定」相反。**程序应采用后者。**
- **说书人是不是公正裁判**：静电森林认为说书人不是公正裁决者，而是调停人 — [机核](https://www.gcores.com/articles/150747)；官方建议说要偏袒弱势，但公平同样重要；Medway 甚至认为说书人的平衡作用没大家想的那么大。三者其实针对不同层面：单局体验、规则执行、长期胜率。
- **犯错怎么办**：官方基线是继续，不补偿；herefor.games 说若严重影响一方可考虑重开 — [herefor.games](https://herefor.games/knowledge/blood-on-the-clock-tower-story-teller-tips/)。
- **中后期加酒鬼**：蒹葭提到可在一两轮后放醉酒标记，但他自己也说这违反官方规则，不建议成熟说书人这样做 — [游民星空](https://www.gamersky.com/handbook/202204/1478895_3.shtml)。本地官方基线明确禁止。**不要模仿。**

**明确的不做清单**（官方基线加上述来源）：不改规则、不改人数配置、不偷偷加减角色、不用规则漏洞终局、不直接在博学者处说谁是恶魔、不留两个邪恶恶魔、不因失误补偿、不在胜负未定时提前结束。

### Inferences
- 「最接近的局」可量化：模拟若干种后续，估计善良获胜概率；离 0.5 太远才动杠杆，并设**单局干预次数上限**，防止程序变成连续作弊。
- 动杠杆顺序：优先用「本来就要做的选择」（信息内容），其次是心上人和亡骨魔选边，最后才是麻脸巫婆死亡。
- 读场在线上环境反而有优势：发言量、投票一致度、被提名频率都可计算；但「是否迷茫」靠发言内容判断，模型可做，要校准。
- 不确定时帮邪恶（官方基线）可作为程序的默认平局规则。

### Gaps
- 「tracking the grimoire」作为术语没找到专门文章。
- 读场的成文方法极少；Ben Burns、Edd Gabriel 的说书播客只有标题。

---

## 问题七：S&V 怎么配板，镜像双子加涡流等组合的坑

### Takeaway
官方只说 S&V 比前两个难，要先带熟前两个。具体搭配坑点大多由规则推出，没有成文的「Evil Twin + Vortox 坑点」文章。

### Cited Findings
- [高] S&V 比暗流涌动更难带，建议先熟悉前两个剧本 — [Behind the Curtain #5](https://www.tumblr.com/bloodontheclocktower/186630757755/behind-the-curtain-5-beyond-trouble-brewing)
- [高] 自定义剧本要在需要时用 Sentinel、Spirit of Ivory、Fibbin、Duchess 等来补平衡，这比配板更常是问题；传奇只在需要修正时加 — [Behind the Curtain #7](https://www.tumblr.com/bloodontheclocktower/655025729437925376/behind-the-curtain-7-balance)
- [高] 镜像双子关键坑：善良双子被处决即邪恶胜，示例是麻脸巫婆把善良双子变成畸形秀演员后被疯狂处决 — [Evil Twin](https://wiki.bloodontheclocktower.com/Evil_Twin)
- [低] 公告员页提示判断双子前先排除涡流或能力失灵（只有这一处相关文字） — [Town Crier](https://wiki.bloodontheclocktower.com/Town_Crier)
- [中] 理发师可用来换走已知的畸形秀演员，让他无法承认被换；恶魔变成心上人对邪恶很强 — [Barber](https://wiki.bloodontheclocktower.com/Barber)
- [中] 方古转化心上人，心上人没死，不触发醉酒 — [Fang Gu](https://wiki.bloodontheclocktower.com/Fang_Gu)
- [低] 配板不宜完全随机，说书人预设势均力敌的角色和座次（蒹葭） — [游民星空](https://www.gamersky.com/handbook/202204/1478895_3.shtml)
- [低] 攻略列出的「狂野」八人配置：钟表匠、哲学家、卖花女孩、数学家、贤者、畸形秀演员、洗脑师、涡流（原文用旧译名，我按角色对应；该页其他四套的恶魔译名不确定，未列出；页面说四套实给五套；官方出处未核实） — [游民星空](https://www.gamersky.com/handbook/202204/1474559.shtml)
- [低] S&V 的镇民多为持续信息，投毒者这类外来强假信息在此类剧本上过强（Vati） — [Script Studies #1](https://squ4ll.substack.com/p/script-studies-1-helping-evil-blend)

### Inferences
以下组合判断来自规则推演，不是来源原话：

- **涡流 + 镜像双子**：好人必须天天处决，同时不能处决善良双子，两人都活着时好人赢不了。双重处决压力对好人很重，少人局要避开。女裁缝反转后是少数能分清双子的手段。
- **涡流 + 双子的互知信息**：双子是爪牙能力，互相知道的信息在涡流下是真的，不要写成假的。
- **涡流 + 畸形秀演员 / 洗脑师**：疯狂处决会满足当天处决，也会挡掉博学者、艺术家、杂耍艺人。上面攻略列出的「狂野」配置正是这个组合，建议只给熟练玩家。
- **亡骨魔 + 外来者**：[-1 外来者] 让外来者伪装多了空间，也让畸形秀演员和心上人出现概率下降。
- **方古 + 畸形秀演员**：Vati 说没有方古或利维坦的剧本上，畸形秀演员常因玩家早退而失败；具体机理摘要没有展开，我的理解是方古的外来者转化给了他留下来的理由，待验证。
- 配板程序的检查项：人数至少 7（本地基线）；是否存在涡流加双子的双重压力；是否同时有 3 个以上需要说书人判定的疯狂来源；哲学家选到在场角色后信息量是否够；线上环境要考虑疯狂难以被 AI 判定。

### Gaps
- 没有找到专门的 S&V 配板文章或「组合坑点」清单。
- 最值得人工补读的三份材料：
  1. 知乎《如何成为血染钟楼紫罗兰教派最通透的说书人？》（标题完全对题，403 未读到）：[zhuanlan.zhihu.com/p/512619355](https://zhuanlan.zhihu.com/p/512619355)
  2. The Script 播客 S&V 一集，Edd Gabriel 谈说书人选择：[thescript botc](https://creators.spotify.com/pod/profile/thescript-botc)
  3. Cult of the Clocktower 2.6 Vortox：[YouTube](https://www.youtube.com/watch?v=L2yYwE-j5aQ)
