// 推荐配置（别人排好的整套角色）。人数 = roles 的长度。房主选「推荐预设」时，人数对得上的话大部分局从这里挑。
// official：官方的推荐配置（官方百科 / 集石百科「给新手说书人的推荐配置（八人游戏）」），挑的时候权重更高。
// 其余是社区整理的各人数板子（游民星空），source 是出处；人数都按官方人数表（含男爵 / 教父的调整）核对过。
// drunkAs：酒鬼以为自己是谁（暗流涌动配置 1 里的"酒鬼（调查员）"）。

export const SETUPS = {
  tb: [
    { name: '信息爆炸', official: true, roles: ['chef', 'empath', 'fortuneteller', 'undertaker', 'virgin', 'drunk', 'scarletwoman', 'imp'], drunkAs: 'investigator',
      note: '善良方信息很多，邪恶方相对安全。酒鬼以为自己是调查员（拿假信息，提名贞洁者不会被处决）。' },
    { name: '安静对局', official: true, roles: ['slayer', 'ravenkeeper', 'mayor', 'fortuneteller', 'empath', 'saint', 'poisoner', 'imp'],
      note: '慢慢验证圣徒、猎手、镇长；投毒者有很多目标。镇长夜里被刀可以换人死。' },
    { name: '逻辑链（进阶）', official: true, roles: ['washerwoman', 'slayer', 'virgin', 'undertaker', 'fortuneteller', 'recluse', 'spy', 'imp'],
      note: '陌客、间谍的误登记让逻辑链更深；串起来就能赢。' },
    // ── 社区整理的各人数板子（游民星空「暗流涌动 N 人板子推荐」），人数按官方人数表核对过 ──
    { name: "新手局1", roles: ["virgin", "soldier", "fortuneteller", "imp", "chef", "mayor", "poisoner"],
      note: "信息位少、可抗推身份多，恶魔容易撑到决胜阶段，适合新手上手", source: "https://www.gamersky.com/handbook/202204/1474758.shtml" },
    { name: "新手局2", roles: ["imp", "librarian", "undertaker", "monk", "virgin", "fortuneteller", "poisoner"],
      note: "纯新手向，场上信息不多，邪恶方较容易拖到最后", source: "https://www.gamersky.com/handbook/202204/1474758_2.shtml" },
    { name: "外来拼多多", roles: ["baron", "soldier", "virgin", "drunk", "ravenkeeper", "recluse", "imp"], drunkAs: "fortuneteller",
      note: "男爵带来两名外来者，信息位少，恶魔与男爵可配合编故事，隐士善恶由说书人临场定", source: "https://www.gamersky.com/handbook/202204/1474758_3.shtml" },
    { name: "间谍", roles: ["spy", "empath", "undertaker", "ravenkeeper", "imp", "virgin", "monk"],
      note: "没有投毒者、全靠间谍偷看魔典打配合，好人信息较多，适合能看懂魔典的进阶玩家", source: "https://www.gamersky.com/handbook/202204/1474758_4.shtml" },
    { name: "毒雾", roles: ["poisoner", "imp", "chef", "librarian", "virgin", "empath", "undertaker"],
      note: "偏向好人，厨师首夜信息很关键，投毒者必须精准毒共情者或送葬者", source: "https://www.gamersky.com/handbook/202204/1474758_5.shtml" },
    { name: "痛苦的隐士", roles: ["virgin", "empath", "recluse", "poisoner", "washerwoman", "chef", "monk", "imp"],
      note: "隐士与投毒者相邻让厨师得到相邻信息，首夜即替恶魔铺好故事，好人缺占卜师，需靠贞洁者和僧侣", source: "https://www.gamersky.com/handbook/202204/1474844.shtml" },
    { name: "神秘的醉鬼（醉鬼可调整）", roles: ["soldier", "imp", "virgin", "ravenkeeper", "drunk", "empath", "washerwoman", "poisoner"], drunkAs: "monk",
      note: "以共情者为核心视角，洗衣妇指认共情者、僧侣守护他；酒鬼位置可调整（原文也建议给贞洁者或守鸦人）", source: "https://www.gamersky.com/handbook/202204/1474844_2.shtml" },
    { name: "共情醉鬼（多信息位）", roles: ["virgin", "ravenkeeper", "drunk", "poisoner", "librarian", "fortuneteller", "undertaker", "imp"], drunkAs: "empath",
      note: "信息位多、偏新手，酒鬼放在共情者上平衡局势，邪恶弱势时也可改给贞洁者", source: "https://www.gamersky.com/handbook/202204/1474844_3.shtml" },
    { name: "外来者拼多多（多个外来者）", roles: ["drunk", "undertaker", "monk", "butler", "imp", "baron", "recluse", "empath"], drunkAs: "slayer",
      note: "男爵局外来者多、好人只有两个信息位，酒鬼放杀手防止过早射中恶魔，适合进阶局", source: "https://www.gamersky.com/handbook/202204/1474844_4.shtml" },
    { name: "多人醉酒（新手专属）", roles: ["poisoner", "washerwoman", "monk", "undertaker", "imp", "virgin", "drunk", "fortuneteller"], drunkAs: "librarian",
      note: "新手向、信息位多，酒鬼可随局势放在任一镇民上，好人劣势时说书人可酌情给真信息", source: "https://www.gamersky.com/handbook/202204/1474844_5.shtml" },
    { name: "醉生梦死（多信息位）", roles: ["librarian", "fortuneteller", "chef", "imp", "virgin", "mayor", "drunk", "poisoner"], drunkAs: "empath",
      note: "信息位充足、新老玩家皆宜，邪恶方建议交给有经验的玩家", source: "https://www.gamersky.com/handbook/202204/1474844_6.shtml" },
    { name: "你猜我喝没喝多", roles: ["empath", "ravenkeeper", "slayer", "poisoner", "imp", "washerwoman", "virgin", "drunk"], drunkAs: "fortuneteller",
      note: "醉酒位可灵活调整，多留黄昏私聊时间给恶魔和爪牙", source: "https://www.gamersky.com/handbook/202204/1474844_7.shtml" },
    { name: "云里雾里", roles: ["virgin", "monk", "empath", "undertaker", "imp", "spy", "drunk", "chef"], drunkAs: "librarian",
      note: "醉酒的图书管理员给出假外来者信息替恶魔打掩护，间谍拿魔典信息，讲故事空间大", source: "https://www.gamersky.com/handbook/202204/1474844_8.shtml" },
    { name: "喝多了的调查员", roles: ["drunk", "mayor", "fortuneteller", "virgin", "poisoner", "washerwoman", "imp", "ravenkeeper"], drunkAs: "investigator",
      note: "醉酒调查员给出错误爪牙信息，信息位不多，投毒者不失误便容易进决赛圈", source: "https://www.gamersky.com/handbook/202204/1474844_9.shtml" },
    { name: "醉酒的圣女", roles: ["fortuneteller", "saint", "monk", "poisoner", "drunk", "soldier", "chef", "imp", "undertaker"], drunkAs: "virgin",
      note: "只有占卜师每夜主动查验，恶魔伪装难被聚焦，好人需靠夜间死亡信息推理；酒鬼也可放厨师", source: "https://www.gamersky.com/handbook/202204/1474916.shtml" },
    { name: "酒鬼在哪", roles: ["imp", "soldier", "librarian", "virgin", "poisoner", "recluse", "empath", "drunk", "ravenkeeper"], drunkAs: "slayer",
      note: "图书管理员指出杀手/共情者中有酒鬼，隐士被当作好人误导，焦点在“谁是酒鬼”", source: "https://www.gamersky.com/handbook/202204/1474916_2.shtml" },
    { name: "被污的圣徒", roles: ["saint", "fortuneteller", "empath", "ravenkeeper", "drunk", "imp", "undertaker", "spy", "washerwoman"], drunkAs: "investigator",
      note: "圣徒是占卜师的干扰项，醉酒调查员再给假信息，专门让圣徒背锅；邪恶方宜伪装外来者", source: "https://www.gamersky.com/handbook/202204/1474916_3.shtml" },
    { name: "醉酒共情 恶魔圣徒", roles: ["chef", "poisoner", "saint", "drunk", "monk", "undertaker", "fortuneteller", "mayor", "imp"], drunkAs: "empath",
      note: "醉酒共情者首夜报错、圣徒是占卜干扰项，胜负常取决于圣徒会不会被处决", source: "https://www.gamersky.com/handbook/202204/1474916_4.shtml" },
    { name: "共情和占星的内斗", roles: ["chef", "empath", "recluse", "drunk", "mayor", "spy", "virgin", "imp", "librarian"], drunkAs: "fortuneteller",
      note: "醉酒占卜师搅局、间谍提供魔典信息，恶魔可精准刀人，好人宜前期少处决多分析", source: "https://www.gamersky.com/handbook/202204/1474916_5.shtml" },
    { name: "管理员喝多了", roles: ["poisoner", "drunk", "empath", "recluse", "baron", "soldier", "fortuneteller", "imp", "monk", "virgin"], drunkAs: "librarian",
      note: "醉酒图书管理员误导开局，隐士对共情者显示为善良，贞洁者是占卜干扰项，好人需少处决、靠夜间死亡判断", source: "https://www.gamersky.com/handbook/202204/1474989.shtml" },
    { name: "标准（无外来者）", roles: ["poisoner", "chef", "empath", "monk", "scarletwoman", "soldier", "fortuneteller", "imp", "ravenkeeper", "virgin"],
      note: "无外来者的标准局，恶魔可伪装外来者假装有男爵，贞洁者为占卜干扰项", source: "https://www.gamersky.com/handbook/202204/1474989_2.shtml" },
    { name: "酒鬼去哪儿了（新手）", roles: ["virgin", "poisoner", "drunk", "recluse", "soldier", "baron", "fortuneteller", "imp", "undertaker", "chef"], drunkAs: "slayer",
      note: "新手向男爵局，邪恶方可冒充外来者，酒鬼可放杀手或送葬者", source: "https://www.gamersky.com/handbook/202204/1474989_3.shtml" },
    { name: "重铸市长荣光", roles: ["virgin", "poisoner", "undertaker", "soldier", "fortuneteller", "mayor", "washerwoman", "imp", "scarletwoman", "monk"],
      note: "红唇女郎提高邪恶容错，好人信息较可靠，市长是翻盘点；士兵或市长当占卜干扰项", source: "https://www.gamersky.com/handbook/202204/1474989_4.shtml" },
    { name: "第五套（有间谍）", roles: ["spy", "empath", "chef", "soldier", "fortuneteller", "monk", "poisoner", "mayor", "virgin", "imp"],
      note: "间谍+投毒者组合，邪恶可精准击杀信息位并假造男爵，好人后期靠市长翻盘", source: "https://www.gamersky.com/handbook/202204/1474989_5.shtml" },
    { name: "陷入危机的小恶魔", roles: ["chef", "imp", "recluse", "baron", "drunk", "scarletwoman", "fortuneteller", "virgin", "ravenkeeper", "saint", "undertaker"], drunkAs: "empath",
      note: "醉酒共情者帮两侧爪牙隐藏，但厨师信息对恶魔很致命，恶魔需由老手担任；圣徒为干扰项", source: "https://www.gamersky.com/handbook/202204/1475040.shtml" },
    { name: "戏剧效果拉满", roles: ["imp", "fortuneteller", "monk", "spy", "drunk", "poisoner", "washerwoman", "undertaker", "librarian", "virgin", "ravenkeeper"], drunkAs: "empath",
      note: "图书管理员开局点出两大信息位中有酒鬼，说书人让两者信息互相矛盾制造戏剧性，不建议新手", source: "https://www.gamersky.com/handbook/202204/1475040_2.shtml" },
    { name: "厨师和圣女不得不说的故事", roles: ["spy", "scarletwoman", "virgin", "fortuneteller", "monk", "ravenkeeper", "librarian", "imp", "washerwoman", "drunk", "empath"], drunkAs: "chef",
      note: "醉酒厨师报假连坐，真贞洁者可被邪恶主动撞来误导，守鸦人或贞洁者当占卜干扰项", source: "https://www.gamersky.com/handbook/202204/1475040_3.shtml" },
    { name: "无助的圣人", roles: ["scarletwoman", "empath", "saint", "imp", "chef", "poisoner", "fortuneteller", "ravenkeeper", "investigator", "undertaker", "monk"],
      note: "共情者、调查员和占卜师的信息都指向圣徒，好人要辨别圣徒真假；投毒者须经验丰富", source: "https://www.gamersky.com/handbook/202204/1475040_4.shtml" },
    { name: "酒鬼调查员", roles: ["spy", "chef", "baron", "empath", "recluse", "imp", "ravenkeeper", "virgin", "saint", "fortuneteller", "drunk"], drunkAs: "investigator",
      note: "醉酒调查员报假投毒者，男爵在场，恶魔还可伪装外来者进一步混淆", source: "https://www.gamersky.com/handbook/202204/1475040_5.shtml" },
    { name: "灾祸滋生11人局复盘（实战配置）", roles: ["empath", "recluse", "investigator", "imp", "undertaker", "washerwoman", "fortuneteller", "chef", "poisoner", "scarletwoman", "librarian"],
      note: "实战复盘配置：投毒者盲毒调查员，红唇女郎跳圣徒假造男爵，恶魔与红唇先后自刀拖到胜利", source: "https://www.gamersky.com/handbook/202207/1498593.shtml" },
    { name: "好人必须输", roles: ["monk", "recluse", "empath", "spy", "butler", "fortuneteller", "imp", "drunk", "saint", "baron", "undertaker", "chef"], drunkAs: "investigator",
      note: "四外来者男爵局，醉酒调查员故意报假男爵位，圣徒是占卜干扰项，对好人很不友好", source: "https://www.gamersky.com/handbook/202204/1475110.shtml" },
    { name: "共情是酒鬼", roles: ["undertaker", "imp", "drunk", "scarletwoman", "fortuneteller", "virgin", "recluse", "ravenkeeper", "slayer", "poisoner", "monk", "washerwoman"], drunkAs: "empath",
      note: "新手向标准局，洗衣妇首夜替醉酒共情者“证身”，恶魔伪装宜给市长+士兵", source: "https://www.gamersky.com/handbook/202204/1475110_2.shtml" },
    { name: "连坐大法好啊！坏人三连坐", roles: ["baron", "recluse", "undertaker", "empath", "drunk", "virgin", "saint", "fortuneteller", "librarian", "butler", "scarletwoman", "imp"], drunkAs: "chef",
      note: "三名邪恶连坐但醉酒厨师报无连坐，邪恶方宜拿调查员伪装去污蔑他人，进阶局", source: "https://www.gamersky.com/handbook/202204/1475110_3.shtml" },
    { name: "间谍和投毒者的高光时刻", roles: ["chef", "empath", "drunk", "spy", "virgin", "mayor", "imp", "fortuneteller", "saint", "poisoner", "ravenkeeper", "soldier"], drunkAs: "undertaker",
      note: "双方较均衡：送葬者醉酒、士兵为干扰项，邪恶可装外来者或毒信息位，好人可走市长胜利线", source: "https://www.gamersky.com/handbook/202204/1475110_4.shtml" },
    { name: "四个外来者的故事", roles: ["baron", "saint", "recluse", "imp", "undertaker", "investigator", "poisoner", "chef", "monk", "drunk", "empath", "butler"], drunkAs: "fortuneteller",
      note: "醉酒占卜师、圣徒为干扰项，强信息少，靠僧侣保护和送葬者锁定身份", source: "https://www.gamersky.com/handbook/202204/1475110_5.shtml" },
    { name: "酒鬼大厨重出江湖", roles: ["virgin", "drunk", "baron", "recluse", "empath", "fortuneteller", "imp", "poisoner", "investigator", "mayor", "scarletwoman", "soldier", "monk"], drunkAs: "chef",
      note: "醉酒厨师报无连坐干扰判断，隐士显示为善良，好人可靠士兵和僧侣保市长取胜", source: "https://www.gamersky.com/handbook/202204/1475157.shtml" },
    { name: "兴风作浪的恶魔", roles: ["baron", "chef", "ravenkeeper", "spy", "fortuneteller", "virgin", "scarletwoman", "undertaker", "drunk", "imp", "recluse", "empath", "monk"], drunkAs: "librarian",
      note: "醉酒图书管理员报“无外来者”，场上却有男爵和隐士，好人需在两人间取舍；有僧侣与较多信息位", source: "https://www.gamersky.com/handbook/202204/1475157_3.shtml" },
    { name: "绝处逢生的间谍", roles: ["poisoner", "librarian", "baron", "imp", "investigator", "empath", "spy", "undertaker", "fortuneteller", "ravenkeeper", "saint", "virgin", "recluse"],
      note: "核心是间谍：图书管理员、调查员和占卜师的信息让间谍身份扑朔迷离；原文称可视局势加入酒鬼", source: "https://www.gamersky.com/handbook/202204/1475157_4.shtml" },
    { name: "我们需要厨师", roles: ["scarletwoman", "imp", "virgin", "fortuneteller", "mayor", "poisoner", "spy", "monk", "washerwoman", "ravenkeeper", "undertaker", "librarian", "investigator"],
      note: "无外来者、邪恶有两对连坐但场上没有厨师，可把厨师给恶魔当伪装，送葬者为干扰项", source: "https://www.gamersky.com/handbook/202204/1475157_5.shtml" },
    { name: "醉酒的僧侣", roles: ["drunk", "saint", "undertaker", "baron", "butler", "imp", "investigator", "spy", "washerwoman", "empath", "mayor", "scarletwoman", "chef", "fortuneteller"], drunkAs: "monk",
      note: "醉酒僧侣守护无效、圣徒为占卜干扰项，中后期易出意外；邪恶宜拿一套外来者伪装", source: "https://www.gamersky.com/handbook/202204/1475182_3.shtml" },
    { name: "外来者就是恶魔", roles: ["imp", "drunk", "mayor", "scarletwoman", "fortuneteller", "monk", "ravenkeeper", "poisoner", "virgin", "spy", "soldier", "chef", "empath", "undertaker"], drunkAs: "investigator",
      note: "醉酒调查员报假男爵，恶魔方至少拿两个外来者伪装去扰乱信息", source: "https://www.gamersky.com/handbook/202204/1475182_4.shtml" },
    { name: "究竟有没有外来者", roles: ["empath", "undertaker", "fortuneteller", "spy", "virgin", "scarletwoman", "monk", "drunk", "washerwoman", "investigator", "imp", "ravenkeeper", "poisoner", "chef"], drunkAs: "librarian",
      note: "醉酒图书管理员报无外来者，恶魔再穿外来者伪装让好人以为有男爵；僧侣为占卜干扰项", source: "https://www.gamersky.com/handbook/202204/1475182_5.shtml" },
    { name: "醉酒的共情 无辜的僧侣", roles: ["drunk", "monk", "baron", "investigator", "scarletwoman", "ravenkeeper", "virgin", "fortuneteller", "butler", "washerwoman", "imp", "chef", "saint", "spy", "recluse"], drunkAs: "empath",
      note: "醉酒共情者反复报两侧有邪恶，坑害僧侣和隐士；调查员报男爵让好人意识到有酒鬼，后期可翻盘", source: "https://www.gamersky.com/handbook/202204/1475258_3.shtml" },
    { name: "混乱的厨师1", roles: ["spy", "soldier", "empath", "ravenkeeper", "poisoner", "washerwoman", "drunk", "scarletwoman", "fortuneteller", "monk", "librarian", "recluse", "virgin", "imp", "undertaker"], drunkAs: "chef",
      note: "醉酒厨师报三对连坐误导好人，恶魔要设法冒充市长，送葬者为占卜干扰项", source: "https://www.gamersky.com/handbook/202204/1475258_4.shtml" },
  ],
  bmr: [
    { name: '新手第一局', official: true, roles: ['gambler', 'professor', 'minstrel', 'pacifist', 'fool', 'tinker', 'assassin', 'shabaloth'],
      note: '最直白的一套。说书人要把握和平主义者、修补匠、沙巴洛斯反刍的时机。' },
    { name: '信息量爆炸', official: true, roles: ['gambler', 'courtier', 'chambermaid', 'grandmother', 'tinker', 'moonchild', 'godfather', 'zombuul'],
      note: '冒险换信息，整合信息抓僵怖；修补匠、月之子、教父制造额外死亡。' },
    { name: '邪恶狂欢', official: true, roles: ['chambermaid', 'innkeeper', 'minstrel', 'exorcist', 'fool', 'lunatic', 'assassin', 'pukka'],
      note: '刺客和普卡能杀本来不会死的人；疯子以为自己是恶魔。' },
    { name: '保命大战', official: true, roles: ['innkeeper', 'tealady', 'pacifist', 'professor', 'fool', 'tinker', 'devilsadvocate', 'shabaloth'],
      note: '双方都有很多保命手段，死人还可能复活。' },
    { name: '难题', official: true, roles: ['sailor', 'chambermaid', 'minstrel', 'courtier', 'gambler', 'goon', 'mastermind', 'po'],
      note: '珀一夜多杀，主谋让恶魔被处决后还多一天；侍臣是关键。' },
    // ── 社区整理的板子（游民星空），人数核对过 ──
    { name: "血月升起9人板子", roles: ["zombuul", "godfather", "lunatic", "grandmother", "professor", "sailor", "innkeeper", "gambler", "minstrel"],
      note: "进阶向：僵怖+教父，教父让外来者减为一名（疯子），六名镇民偏保护与信息", source: "https://www.gamersky.com/handbook/202208/1506132.shtml" },
  ],
};

/** 这个人数的推荐配置。 */
export const presetsFor = (script, n) => (SETUPS[script] ?? []).filter((x) => x.roles.length === n);

/** 按权重挑一套（官方的权重 3，其他 1）；这个人数没有就返回 null。 */
export function pickPreset(script, n, rng = Math.random) {
  const list = presetsFor(script, n);
  if (!list.length) return null;
  const w = list.map((x) => (x.official ? 3 : 1));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r < 0) return list[i]; }
  return list.at(-1);
}

/** 「推荐预设」模式下，这个人数有推荐配置时用推荐配置的概率（其余用 AI 配置，免得总是那几套）。 */
export const PRESET_SHARE = 0.8;
