import { WW_ROLES, WW_PLAYERS, ragnarokWolves, RAG_PLAYERS } from './werewolf-roles.js';

export { ragnarokWolves };

// 三个剧本的全部角色：暗流涌动（Trouble Brewing，script: 'tb'）、黯月初升（Bad Moon Rising，script: 'bmr'）和梦殒春宵（Sects & Violets，script: 'snv'）。
// firstNight / otherNight 是夜晚行动顺序（0 = 这一晚不醒；各剧本各自排序），
// choose 描述该角色夜里要选什么：count 几名玩家、alive 只能选活人、notSelf 不能选自己、notLast 不能和上一夜相同、
// dead 只能选死人、role 还要选一个角色、optional 可以不用（"每局一次"的能力）。

export const ROLES = {
  // ── 镇民 ──
  washerwoman: { name: '洗衣妇', en: 'Washerwoman', team: 'townsfolk', firstNight: 20, otherNight: 0,
    ability: '首夜，你会得知两名玩家中有一人是某个特定的镇民角色。' },
  librarian: { name: '图书管理员', en: 'Librarian', team: 'townsfolk', firstNight: 21, otherNight: 0,
    ability: '首夜，你会得知两名玩家中有一人是某个特定的外来者角色（或得知场上没有外来者）。' },
  investigator: { name: '调查员', en: 'Investigator', team: 'townsfolk', firstNight: 22, otherNight: 0,
    ability: '首夜，你会得知两名玩家中有一人是某个特定的爪牙角色。' },
  chef: { name: '厨师', en: 'Chef', team: 'townsfolk', firstNight: 23, otherNight: 0,
    ability: '首夜，你会得知场上有多少对相邻而坐的邪恶玩家。' },
  empath: { name: '共情者', en: 'Empath', team: 'townsfolk', firstNight: 24, otherNight: 34,
    ability: '每个夜晚，你会得知与你相邻的两名存活玩家中有几名是邪恶的。' },
  fortuneteller: { name: '占卜师', en: 'Fortune Teller', team: 'townsfolk', firstNight: 25, otherNight: 35,
    choose: { count: 2 },
    ability: '每个夜晚，选择两名玩家：你会得知其中是否有恶魔。有一名善良玩家会被你误认为恶魔（红鲱鱼）。' },
  undertaker: { name: '送葬者', en: 'Undertaker', team: 'townsfolk', firstNight: 0, otherNight: 35.5, // 官方顺序：共情者 → 占卜师 → 送葬者 → 管家
    ability: '除首夜外的每个夜晚，你会得知今天白天被处决的玩家的角色。' },
  monk: { name: '僧侣', en: 'Monk', team: 'townsfolk', firstNight: 0, otherNight: 12,
    choose: { count: 1, notSelf: true },
    ability: '除首夜外的每个夜晚，选择一名其他玩家：今晚恶魔的能力对其无效。' },
  ravenkeeper: { name: '守鸦人', en: 'Ravenkeeper', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '如果你在夜晚死亡，你会被唤醒并选择一名玩家：你会得知他的角色。' },
  virgin: { name: '贞洁者', en: 'Virgin', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '你第一次被提名时，如果提名你的是镇民，他会被立即处决。' },
  slayer: { name: '猎手', en: 'Slayer', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '每局一次，白天时你可以公开选择一名玩家：如果他是恶魔，他会死亡。（在行动面板里点「开枪」）' },
  soldier: { name: '士兵', en: 'Soldier', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '恶魔的能力对你无效。' },
  mayor: { name: '镇长', en: 'Mayor', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '如果只剩三名玩家存活且当天没有人被处决，你的阵营获胜。如果你在夜晚即将死亡，可能会有另一名玩家代替你死亡。' },

  // ── 外来者 ──
  butler: { name: '管家', en: 'Butler', team: 'outsider', firstNight: 26, otherNight: 36,
    choose: { count: 1, notSelf: true },
    ability: '每个夜晚，选择一名其他玩家作为你的主人：明天白天，只有他投票时你才能投票。' },
  drunk: { name: '酒鬼', en: 'Drunk', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '你不知道自己是酒鬼。你以为自己是某个镇民角色，但你的能力不会生效。' },
  recluse: { name: '陌客', en: 'Recluse', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '你可能会被当作邪恶阵营、爪牙或恶魔，即使你已死亡。' },
  saint: { name: '圣徒', en: 'Saint', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '如果你被处决，你的阵营落败。' },

  // ── 爪牙 ──
  poisoner: { name: '投毒者', en: 'Poisoner', team: 'minion', firstNight: 10, otherNight: 10,
    choose: { count: 1 },
    ability: '每个夜晚，选择一名玩家：他在今晚和明天白天中毒（能力失效、得到的信息可能是假的）。' },
  spy: { name: '间谍', en: 'Spy', team: 'minion', firstNight: 40, otherNight: 40,
    ability: '每个夜晚，你可以查看魔典。你可能会被当作善良阵营、镇民或外来者，即使你已死亡。' },
  scarletwoman: { name: '红唇女郎', en: 'Scarlet Woman', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '如果存活玩家有五名或更多时恶魔死亡，你变成那个恶魔。' },
  baron: { name: '男爵', en: 'Baron', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '场上会额外多出两名外来者。[+2 外来者]' },

  // ── 恶魔 ──
  imp: { name: '小恶魔', en: 'Imp', team: 'demon', firstNight: 0, otherNight: 20,
    choose: { count: 1 },
    ability: '除首夜外的每个夜晚，选择一名玩家：他死亡。如果你选择了自己，你死亡，并由一名爪牙变成小恶魔。' },
};

// ───────────────────────── 黯月初升 ─────────────────────────
const BMR = {
  // ── 镇民 ──
  grandmother: { name: '祖母', en: 'Grandmother', team: 'townsfolk', firstNight: 10, otherNight: 19,
    ability: '在你的首个夜晚，你会得知一名善良玩家和他的角色。如果恶魔杀死了他，你也会死亡。' },
  sailor: { name: '水手', en: 'Sailor', team: 'townsfolk', firstNight: 5, otherNight: 2,
    choose: { count: 1, alive: true },
    ability: '每个夜晚，你要选择一名存活的玩家：你或他之一会醉酒直到下个黄昏。你不会死亡。' },
  chambermaid: { name: '侍女', en: 'Chambermaid', team: 'townsfolk', firstNight: 11, otherNight: 20,
    choose: { count: 2, alive: true, notSelf: true },
    ability: '每个夜晚，你要选择除你以外的两名存活的玩家：你会得知他们中有几人在当晚因其自身能力而被唤醒。' },
  exorcist: { name: '驱魔人', en: 'Exorcist', team: 'townsfolk', firstNight: 0, otherNight: 8,
    choose: { count: 1, notLast: true },
    ability: '每个夜晚*，你要选择一名玩家（与上个夜晚不同）：如果你选中了恶魔，他会得知你是驱魔人，但他当晚不会因其自身能力而被唤醒。' },
  innkeeper: { name: '旅店老板', en: 'Innkeeper', team: 'townsfolk', firstNight: 0, otherNight: 3,
    choose: { count: 2 },
    ability: '每个夜晚*，你要选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个黄昏。' },
  gambler: { name: '赌徒', en: 'Gambler', team: 'townsfolk', firstNight: 0, otherNight: 5,
    choose: { count: 1, role: true },
    ability: '每个夜晚*，你要选择一名玩家并猜测该玩家的角色：如果你猜错了，你会死亡。' },
  gossip: { name: '造谣者', en: 'Gossip', team: 'townsfolk', firstNight: 0, otherNight: 16,
    ability: '每个白天，你可以公开发表一个声明。如果该声明正确，在当晚会有一名玩家死亡。（在行动面板里点「发表声明」）' },
  courtier: { name: '侍臣', en: 'Courtier', team: 'townsfolk', firstNight: 6, otherNight: 4,
    choose: { count: 0, role: true, optional: true, once: true },
    ability: '每局游戏限一次，在夜晚时，你可以选择一个角色：如果该角色在场，该角色之一从当晚开始醉酒三天三夜。' },
  professor: { name: '教授', en: 'Professor', team: 'townsfolk', firstNight: 0, otherNight: 15,
    choose: { count: 1, dead: true, optional: true, once: true },
    ability: '每局游戏限一次，在夜晚时*，你可以选择一名死亡的玩家：如果他是镇民，你会将他起死回生。' },
  minstrel: { name: '吟游诗人', en: 'Minstrel', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '当一名爪牙死于处决时，除了你和旅行者以外的所有其他玩家醉酒直到明天黄昏。' },
  tealady: { name: '茶艺师', en: 'Tea Lady', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '如果与你邻近的两名存活的玩家是善良的，他们不会死亡。' },
  pacifist: { name: '和平主义者', en: 'Pacifist', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '被处决的善良玩家可能不会死亡。' },
  fool: { name: '弄臣', en: 'Fool', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '当你首次将要死亡时，你不会死亡。' },
  // ── 外来者 ──
  tinker: { name: '修补匠', en: 'Tinker', team: 'outsider', firstNight: 0, otherNight: 17,
    ability: '你随时可能死亡。' },
  moonchild: { name: '月之子', en: 'Moonchild', team: 'outsider', firstNight: 0, otherNight: 18,
    ability: '当你得知你死亡时，你要公开选择一名存活的玩家。如果他是善良的，在当晚他会死亡。' },
  goon: { name: '莽夫', en: 'Goon', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '每个夜晚，首个使用其自身能力选择了你的玩家会醉酒直到下个黄昏。你会转变为他的阵营。' },
  lunatic: { name: '疯子', en: 'Lunatic', team: 'outsider', firstNight: 4, otherNight: 7,
    ability: '你以为你是一个恶魔，但其实你不是。恶魔知道你是疯子以及你在每个夜晚选择了哪些玩家。' },
  // ── 爪牙 ──
  godfather: { name: '教父', en: 'Godfather', team: 'minion', firstNight: 7, otherNight: 14,
    choose: { count: 1 },
    ability: '在你的首个夜晚，你会得知有哪些外来者角色在场。如果有外来者在白天死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡。[-1 或 +1 外来者]' },
  devilsadvocate: { name: '魔鬼代言人', en: "Devil's Advocate", team: 'minion', firstNight: 8, otherNight: 6,
    choose: { count: 1, alive: true, notLast: true },
    ability: '每个夜晚，你要选择一名存活的玩家（与上个夜晚不同）：如果明天白天他被处决，他不会死亡。' },
  assassin: { name: '刺客', en: 'Assassin', team: 'minion', firstNight: 0, otherNight: 13,
    choose: { count: 1, optional: true, once: true },
    ability: '每局游戏限一次，在夜晚时*，你可以选择一名玩家：他死亡，即使因为任何原因让他不会死亡。' },
  mastermind: { name: '主谋', en: 'Mastermind', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '如果恶魔因为死于处决而因此导致游戏结束时，再额外进行一个夜晚和一个白天。在那个白天如果有玩家被处决，他的阵营落败。' },
  // ── 恶魔 ──
  zombuul: { name: '僵怖', en: 'Zombuul', team: 'demon', firstNight: 0, otherNight: 9,
    choose: { count: 1 },
    ability: '每个夜晚*，如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡。当你首次死亡后，你仍存活，但会被当作死亡。' },
  pukka: { name: '普卡', en: 'Pukka', team: 'demon', firstNight: 9, otherNight: 10,
    choose: { count: 1 },
    ability: '每个夜晚，你要选择一名玩家：他中毒。上个因你的能力中毒的玩家会死亡并恢复健康。' },
  shabaloth: { name: '沙巴洛斯', en: 'Shabaloth', team: 'demon', firstNight: 0, otherNight: 11,
    choose: { count: 2 },
    ability: '每个夜晚*，你要选择两名玩家：他们死亡。你上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。' },
  po: { name: '珀', en: 'Po', team: 'demon', firstNight: 0, otherNight: 12,
    choose: { count: 1, optional: true },
    ability: '每个夜晚*，你可以选择一名玩家：他死亡。如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。' },
};
// ───────────────────────── 梦殒春宵 ─────────────────────────
// 能力文字是照官方规则用自己的话写的。firstNight / otherNight 只表示这一晚醒不醒，具体顺序看 shared/nightOrder.js。
// choose 里多出来的：good 只能选善良角色。
const SNV = {
  // ── 镇民 ──
  clockmaker: { name: '钟表匠', en: 'Clockmaker', team: 'townsfolk', firstNight: 1, otherNight: 1,
    ability: '你的首个夜晚，你会得知恶魔和最近的爪牙相隔多远（邻座是 1）。' },
  dreamer: { name: '筑梦师', en: 'Dreamer', team: 'townsfolk', firstNight: 1, otherNight: 1,
    choose: { count: 1, notSelf: true },
    ability: '每个夜晚，选一名其他玩家：你会看到一个善良角色和一个邪恶角色，他是其中之一。' },
  snakecharmer: { name: '舞蛇人', en: 'Snake Charmer', team: 'townsfolk', firstNight: 1, otherNight: 1,
    choose: { count: 1, alive: true },
    ability: '每个夜晚，选一名存活的玩家：如果选中恶魔，你们互换角色和阵营，对方中毒。' },
  mathematician: { name: '数学家', en: 'Mathematician', team: 'townsfolk', firstNight: 1, otherNight: 1,
    ability: '每个夜晚，你会得知从上个黎明到现在，有几名玩家的能力被别人的能力弄得没有正常生效。' },
  flowergirl: { name: '卖花女孩', en: 'Flowergirl', team: 'townsfolk', firstNight: 0, otherNight: 1,
    ability: '除首夜外的每个夜晚，你会得知今天白天有没有恶魔投过票。' },
  towncrier: { name: '城镇公告员', en: 'Town Crier', team: 'townsfolk', firstNight: 0, otherNight: 1,
    ability: '除首夜外的每个夜晚，你会得知今天白天有没有爪牙发起过提名。' },
  oracle: { name: '神谕者', en: 'Oracle', team: 'townsfolk', firstNight: 0, otherNight: 1,
    ability: '除首夜外的每个夜晚，你会得知死亡的玩家里有几名是邪恶的。' },
  savant: { name: '博学者', en: 'Savant', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '每个白天，你可以私下问说书人一次，得到两条信息：一条真，一条假。（在行动面板里点「询问说书人」）' },
  seamstress: { name: '女裁缝', en: 'Seamstress', team: 'townsfolk', firstNight: 1, otherNight: 1,
    choose: { count: 2, notSelf: true, optional: true, once: true },
    ability: '每局一次，夜里你可以选两名其他玩家：你会得知他们是不是同一阵营。' },
  philosopher: { name: '哲学家', en: 'Philosopher', team: 'townsfolk', firstNight: 1, otherNight: 1,
    choose: { count: 0, role: true, good: true, optional: true, once: true },
    ability: '每局一次，夜里你可以选一个善良角色：你获得它的能力。如果这个角色在场，它的持有者醉酒。' },
  artist: { name: '艺术家', en: 'Artist', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '每局一次，白天你可以私下问说书人一个是非问题，得到答案。（在行动面板里点「提问」）' },
  juggler: { name: '杂耍艺人', en: 'Juggler', team: 'townsfolk', firstNight: 0, otherNight: 1,
    ability: '你的首个白天，可以公开猜最多五次玩家的角色，当晚得知猜对了几个。（在行动面板里点「公开猜测」）' },
  sage: { name: '贤者', en: 'Sage', team: 'townsfolk', firstNight: 0, otherNight: 1,
    ability: '如果恶魔杀死了你，当晚你会得知两名玩家，其中一名是杀你的恶魔。' },
  // ── 外来者 ──
  mutant: { name: '畸形秀演员', en: 'Mutant', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '如果你「疯狂」地证明自己是外来者，你可能被处决。' },
  sweetheart: { name: '心上人', en: 'Sweetheart', team: 'outsider', firstNight: 0, otherNight: 1,
    ability: '你死亡时，会有一名玩家从此醉酒。' },
  barber: { name: '理发师', en: 'Barber', team: 'outsider', firstNight: 0, otherNight: 1,
    ability: '你死亡的当晚，恶魔可以选两名玩家（不能选其他恶魔）交换角色。' },
  klutz: { name: '呆瓜', en: 'Klutz', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '你得知自己死亡时，要公开选一名存活的玩家：如果他是邪恶的，你的阵营落败。' },
  // ── 爪牙 ──
  eviltwin: { name: '镜像双子', en: 'Evil Twin', team: 'minion', firstNight: 1, otherNight: 0,
    ability: '你和一名对立阵营的玩家互相知道对方的角色。善良的那位被处决，邪恶获胜。你们都活着时，善良无法获胜。' },
  witch: { name: '女巫', en: 'Witch', team: 'minion', firstNight: 1, otherNight: 1,
    choose: { count: 1 },
    ability: '每个夜晚，选一名玩家：他明天白天发起提名就会死亡。只剩三名存活玩家时，你失去这个能力。' },
  cerenovus: { name: '洗脑师', en: 'Cerenovus', team: 'minion', firstNight: 1, otherNight: 1,
    choose: { count: 1, role: true, good: true },
    ability: '每个夜晚，选一名玩家和一个善良角色：他明天白天和夜晚要「疯狂」地证明自己是这个角色，不然可能被处决。' },
  pithag: { name: '麻脸巫婆', en: 'Pit-Hag', team: 'minion', firstNight: 0, otherNight: 1,
    choose: { count: 1, role: true },
    ability: '除首夜外的每个夜晚，选一名玩家和一个角色：如果这个角色不在场，他变成它。如果因此造出恶魔，当晚的死亡由说书人决定。' },
  // ── 恶魔 ──
  fanggu: { name: '方古', en: 'Fang Gu', team: 'demon', firstNight: 0, otherNight: 1,
    choose: { count: 1 },
    ability: '除首夜外的每个夜晚，选一名玩家：他死亡。第一个被你这样杀死的外来者改为变成邪恶的方古，你代替他死亡。[+1 外来者]' },
  vigormortis: { name: '亡骨魔', en: 'Vigormortis', team: 'demon', firstNight: 0, otherNight: 1,
    choose: { count: 1 },
    ability: '除首夜外的每个夜晚，选一名玩家：他死亡。被你杀死的爪牙保留能力，并让他邻近的一名镇民中毒。[-1 外来者]' },
  nodashii: { name: '诺-达鲺', en: 'No Dashii', team: 'demon', firstNight: 0, otherNight: 1,
    choose: { count: 1 },
    ability: '除首夜外的每个夜晚，选一名玩家：他死亡。你两侧最近的两名镇民中毒。' },
  vortox: { name: '涡流', en: 'Vortox', team: 'demon', firstNight: 0, otherNight: 1,
    choose: { count: 1 },
    ability: '除首夜外的每个夜晚，选一名玩家：他死亡。镇民的能力都产生错误信息。白天没有人被处决，邪恶获胜。' },
};
// ───────────────────────── 窃窃私语里新出现的角色（官方实验性角色） ─────────────────────────
// 能力文字照官方规则用自己的话写。顺序看 shared/nightOrder.js。
const LUF = {
  balloonist: { name: '气球驾驶员', en: 'Balloonist', team: 'townsfolk', firstNight: 1, otherNight: 1,
    ability: '每个夜晚，你会得知一名玩家，他和你上一晚得知的那名玩家角色类型不同。[+0 或 +1 外来者]' },
  amnesiac: { name: '失忆者', en: 'Amnesiac', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '你不知道自己的能力是什么。每个白天可以私下猜一次，说书人会告诉你猜得有多准。（在行动面板里点「猜我的能力」）' },
  fisherman: { name: '渔夫', en: 'Fisherman', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '每局一次，白天你可以私下请说书人给一条帮你的阵营获胜的建议。（在行动面板里点「请教说书人」）' },
  cannibal: { name: '食人族', en: 'Cannibal', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '你拥有最近一个死于处决的玩家的能力（你不会被告知是什么）。如果他是邪恶的，你中毒，直到下一个善良玩家死于处决。' },
  widow: { name: '寡妇', en: 'Widow', team: 'minion', firstNight: 1, otherNight: 0,
    choose: { count: 1 },
    ability: '你的首个夜晚，你会看到魔典，并选一名玩家：他中毒，直到你死亡。之后会有一名善良玩家得知寡妇在场。' },
  goblin: { name: '哥布林', en: 'Goblin', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '如果你被提名后、投票前公开声明自己是哥布林，并且当天被处决，你的阵营获胜。（被提名时点「我是哥布林」）' },
  leviathan: { name: '利维坦', en: 'Leviathan', team: 'demon', firstNight: 0, otherNight: 0,
    ability: '你不杀人。所有人都知道利维坦在场。如果有超过一名善良玩家被处决，邪恶获胜；第五个白天结束时，邪恶获胜。' },
};

// ───────────────────────── 七步成诗（2025 剧本世界杯冠军）里新出现的角色 ─────────────────────────
// 来自实验性角色和其他版本。能力文字照官方百科用自己的话写，口径见 references/seat7.md；顺序看 shared/nightOrder.js。
const BS7 = {
  noble: { name: '贵族', en: 'Noble', team: 'townsfolk', firstNight: 1, otherNight: 0,
    ability: '在你的首个夜晚，你会得知三名玩家：其中有且只有一名是邪恶的。' },
  shugenja: { name: '修行者', en: 'Shugenja', team: 'townsfolk', firstNight: 1, otherNight: 0,
    ability: '在你的首个夜晚，你会得知离你最近的邪恶玩家在你的顺时针还是逆时针方向（两边一样近时由说书人决定）。' },
  villageidiot: { name: '村夫', en: 'Village Idiot', team: 'townsfolk', firstNight: 1, otherNight: 1,
    choose: { count: 1 },
    ability: '每个夜晚，选择一名玩家：你会得知他的阵营。[+0~2 村夫；有多名村夫时其中一名醉酒]' },
  farmer: { name: '农夫', en: 'Farmer', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '如果你在夜晚死亡，一名存活的善良玩家会变成农夫。' },
  magician: { name: '魔术师', en: 'Magician', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '恶魔会以为你是爪牙，爪牙会以为你是恶魔。' },
  damsel: { name: '落难少女', en: 'Damsel', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '所有爪牙都知道落难少女在场。每局一次，爪牙可以公开猜谁是落难少女：猜中了，你的阵营落败。' },
  harpy: { name: '鹰身女妖', en: 'Harpy', team: 'minion', firstNight: 1, otherNight: 1,
    choose: { count: 2 },
    ability: '每个夜晚，选择两名玩家：明天第一名玩家要「疯狂」地证明第二名玩家是邪恶的，否则他们之中可能有人死亡。' },
  boomdandy: { name: '炸弹人', en: 'Boomdandy', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '如果你被处决，除三名玩家以外的所有人死亡。倒数十声后，被最多玩家指着的人死亡。' },
  boffin: { name: '科学怪人', en: 'Boffin', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '恶魔拥有一个不在场的善良角色的能力（即使恶魔醉酒或中毒）。你和恶魔都知道是哪个能力。' },
};

// ───────────────────────── 实验性角色（Uncertain Death 等社区剧本用到的）─────────────────────────
// 能力文字照官方中文百科（提线木偶页）用自己的话写。
const EXP = {
  marionette: { name: '提线木偶', en: 'Marionette', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '你以为你是一个善良角色，但其实你不是。恶魔知道你是提线木偶。你与恶魔相邻。' },
  // 下面五个是 2026-11-14 为 Harold Holt's Revenge、Onion Pies、Trust 加的（口径见 references/community.md）
  pixie: { name: '小精灵', en: 'Pixie', team: 'townsfolk', firstNight: 1, otherNight: 0,
    ability: '在你的首个夜晚，你会得知一个在场的镇民角色。如果你「疯狂」地证明你是这个角色，他死亡时你获得他的能力。' },
  general: { name: '将军', en: 'General', team: 'townsfolk', firstNight: 1, otherNight: 1,
    ability: '每个夜晚，你会得知说书人认为哪个阵营正在获胜：善良、邪恶，或者都不是。' },
  politician: { name: '政客', en: 'Politician', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '如果你是对你的阵营落败负最大责任的人，你转变阵营并获胜，即使你已死亡。' },
  ogre: { name: '食人魔', en: 'Ogre', team: 'outsider', firstNight: 1, otherNight: 0,
    choose: { count: 1, notSelf: true },
    ability: '在你的首个夜晚，选择一名其他玩家：你变成他的阵营（你不知道是哪个），即使你醉酒或中毒。' },
  // 瞒天过海（Boozling）用到的三个（2026-11-14）
  highpriestess: { name: '女祭司', en: 'High Priestess', team: 'townsfolk', firstNight: 1, otherNight: 1,
    ability: '每个夜晚，你会得知说书人认为你最应该和谁聊一聊。' },
  huntsman: { name: '巡山人', en: 'Huntsman', team: 'townsfolk', firstNight: 1, otherNight: 1,
    choose: { count: 1, alive: true, optional: true, once: true },
    ability: '每局一次，在夜晚时，你可以选择一名存活的玩家：如果他是落难少女，他变成一个不在场的镇民。[+落难少女]' },
  golem: { name: '魔像', en: 'Golem', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '你整局只能提名一次。你提名时，如果被提名的人不是恶魔，他死亡。' },
  mezepheles: { name: '灵言师', en: 'Mezepheles', team: 'minion', firstNight: 1, otherNight: 1,
    ability: '在你的首个夜晚，你会得知一个关键词。第一个说出这个关键词的善良玩家，当晚变成邪恶阵营。（要他开着收音页说才听得到）' },
};

// ───────────────────────── 失忆者专用的原创能力 ─────────────────────────
// 官方：失忆者的能力可以是现有能力、类似的能力或原创能力。这几个是在现有能力上改的变种，只会作为失忆者的隐藏能力出现，
// 不属于任何剧本（script: 'amnesiac'，rolesOf / inScript 都不会列出来）。结算在 engine/snv.js。
const AMNESIAC_ONLY = {
  amn_gun: { name: '一发子弹', en: 'Loaded Gun', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '每局一次，白天你可以公开向一名玩家开枪：他死亡，不管他是谁。' },
  amn_judge: { name: '审判之枪', en: 'Judgement', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '每局一次，白天你可以公开向一名玩家开枪：如果他是邪恶的，他死亡。' },
  amn_pardon: { name: '特赦', en: 'Pardon', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '每局一次，白天有人在处决台上时，你可以公开特赦：他走下处决台，今天不再处决任何人。' },
  amn_detect: { name: '恶魔探测', en: 'Demon Sense', team: 'townsfolk', firstNight: 1, otherNight: 1,
    choose: { count: 2 },
    ability: '每个夜晚，选择两名玩家：你会得知他们之中有没有恶魔。' },
  amn_echo: { name: '处决回声', en: 'Echo', team: 'townsfolk', firstNight: 0, otherNight: 1,
    ability: '除首夜外的每个夜晚，如果今天白天有人被处决，你会得知他是不是善良的。' },
};

for (const [id, r] of Object.entries(ROLES)) r.script = 'tb';
for (const [id, r] of Object.entries(BMR)) { r.script = 'bmr'; ROLES[id] = r; }
for (const [id, r] of Object.entries(SNV)) { r.script = 'snv'; ROLES[id] = r; }
for (const [id, r] of Object.entries(LUF)) { r.script = 'luf'; ROLES[id] = r; }
for (const [id, r] of Object.entries(BS7)) { r.script = 'bs7'; ROLES[id] = r; }
for (const [id, r] of Object.entries(EXP)) { r.script = 'exp'; ROLES[id] = r; }
for (const [id, r] of Object.entries(AMNESIAC_ONLY)) { r.script = 'amnesiac'; r.virtual = true; ROLES[id] = r; }
for (const [id, r] of Object.entries(WW_ROLES)) { r.script = 'ww'; r.virtual = true; ROLES[id] = r; } // 狼人杀的角色：不是血染的角色，说书人的角色列表里不列

/**
 * 剧本。engine：用哪套规则引擎（两个小剧本借梦殒春宵那套：它的醉酒中毒、换角色、阵营单独记都是通用的）；
 * map：用哪张地图（小剧本用前两张图的变体，见 shared/maps/）；roles：角色从各个剧本挑出来的，按官方剧本页的顺序；
 * players：人数范围（官方的汀西维尔小剧本是 5–6 人）。
 */
export const SCRIPTS = {
  tb: { id: 'tb', name: '暗流涌动', en: 'Trouble Brewing', engine: 'tb' },
  bmr: { id: 'bmr', name: '黯月初升', en: 'Bad Moon Rising', engine: 'bmr' },
  snv: { id: 'snv', name: '梦殒春宵', en: 'Sects & Violets', engine: 'snv' },
  ngj: { id: 'ngj', name: '无上愉悦', en: 'No Greater Joy', engine: 'snv', teensy: true, players: [5, 6],
    roles: ['clockmaker', 'investigator', 'empath', 'chambermaid', 'artist', 'sage', 'drunk', 'klutz', 'scarletwoman', 'baron', 'imp'] },
  luf: { id: 'luf', name: '窃窃私语', en: 'Laissez un Faire', engine: 'snv', teensy: true, players: [5, 6],
    roles: ['balloonist', 'savant', 'amnesiac', 'fisherman', 'artist', 'cannibal', 'mutant', 'lunatic', 'widow', 'goblin', 'leviathan'] },
  // 2025 剧本世界杯冠军（作者 TrashWarlock）。灯神规则：7 号座位没有人坐，由说书人替它做决定，每局可以替它发言一次（seat7）。
  // players 是真人（含机器人）的人数，开局时再插进 7 号空座；旅行者没有做。
  bs7: { id: 'bs7', name: '七步成诗', en: 'The Ballad of Seat 7', engine: 'snv', seat7: true, players: [6, 14],
    roles: ['noble', 'librarian', 'shugenja', 'balloonist', 'villageidiot', 'dreamer', 'oracle', 'innkeeper', 'seamstress', 'fisherman', 'farmer', 'virgin', 'magician',
      'drunk', 'recluse', 'saint', 'damsel', 'harpy', 'boomdandy', 'scarletwoman', 'boffin', 'baron', 'pukka', 'imp', 'vigormortis'] },
  // 最有名的自定义剧本之一（作者 Emily，v11.1），只用三个基础剧本和实验性角色；中文名是本项目起的（官方没有译名）
  cat: { id: 'cat', name: '冒名钓鱼', en: 'Catfishing', engine: 'snv',
    roles: ['investigator', 'chef', 'grandmother', 'balloonist', 'dreamer', 'fortuneteller', 'snakecharmer', 'gambler', 'savant', 'philosopher', 'ravenkeeper', 'amnesiac', 'cannibal',
      'drunk', 'recluse', 'sweetheart', 'mutant', 'lunatic', 'godfather', 'cerenovus', 'pithag', 'widow', 'imp', 'vigormortis', 'fanggu'] },
  // 社区热门剧本 Uncertain Death（作者 Matt，botcscripts 1.0.1，三份推荐名单都有）。中文名是本项目起的。2026-11-11 用户要的
  ucd: { id: 'ucd', name: '生死未卜', en: 'Uncertain Death', engine: 'snv',
    roles: ['clockmaker', 'grandmother', 'librarian', 'empath', 'fortuneteller', 'exorcist', 'flowergirl', 'oracle', 'undertaker', 'artist', 'slayer', 'seamstress', 'monk',
      'lunatic', 'mutant', 'sweetheart', 'recluse', 'godfather', 'assassin', 'scarletwoman', 'marionette', 'nodashii', 'pukka'] },
  // 官方推荐的 Everyone Can Play（作者 Ben Burns，TPI）：只用三个基础剧本的角色，老手当谜题、新手也能上手。中文名是本项目起的
  ecp: { id: 'ecp', name: '人人可玩', en: 'Everyone Can Play', engine: 'snv',
    roles: ['librarian', 'clockmaker', 'chef', 'grandmother', 'fortuneteller', 'empath', 'monk', 'undertaker', 'gambler', 'artist', 'fool', 'ravenkeeper', 'mayor',
      'drunk', 'recluse', 'saint', 'moonchild', 'baron', 'poisoner', 'assassin', 'devilsadvocate', 'imp'] },
  // 娱乐模式（用户 2026-11-04 要的「只有猎人和狼人的板子」）。2026-11-11 用户：这是狼人杀的板子，猎人和狼人都是狼人杀的角色，
  // 走狼人杀的引擎（engine/werewolf.js，script 传 'rag'）。旧的血染版（猎手 + 小恶魔）只留着读老存档
  // 2026-11-14 用户挑的四个热门社区剧本（中文名除「大诚小镇」外是本项目起的；角色表对过多份公开的剧本 JSON）
  hhr: { id: 'hhr', name: '哈罗德的复仇', en: "Harold Holt's Revenge", engine: 'snv',
    roles: ['librarian', 'investigator', 'shugenja', 'balloonist', 'dreamer', 'snakecharmer', 'towncrier', 'slayer', 'savant', 'amnesiac', 'seamstress', 'courtier', 'magician',
      'mutant', 'damsel', 'lunatic', 'politician', 'cerenovus', 'pithag', 'baron', 'goblin', 'marionette', 'leviathan'] },
  pie: { id: 'pie', name: '洋葱派', en: 'Onion Pies', engine: 'snv',
    roles: ['noble', 'chef', 'washerwoman', 'librarian', 'pixie', 'empath', 'fortuneteller', 'monk', 'slayer', 'soldier', 'ravenkeeper', 'virgin', 'cannibal', 'mayor',
      'ogre', 'saint', 'recluse', 'drunk', 'poisoner', 'spy', 'baron', 'scarletwoman', 'marionette', 'imp'] },
  trust: { id: 'trust', name: '大诚小镇', en: 'Trust', engine: 'snv',
    roles: ['noble', 'librarian', 'pixie', 'general', 'fortuneteller', 'oracle', 'monk', 'seamstress', 'philosopher', 'magician', 'ravenkeeper', 'mayor', 'cannibal',
      'recluse', 'drunk', 'politician', 'lunatic', 'cerenovus', 'baron', 'mezepheles', 'marionette', 'imp', 'vigormortis'] },
  twv: { id: 'twv', name: '暗流紫罗兰', en: 'Trouble with Violets', engine: 'snv',
    roles: ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor',
      'butler', 'drunk', 'recluse', 'saint', 'eviltwin', 'witch', 'cerenovus', 'pithag', 'fanggu', 'vigormortis', 'nodashii', 'vortox'] },
  // 2022 剧本世界杯冠军（作者 Lau），v9。集石的官方中文名是「瞒天过海」；B 站「染钟楼」中文社区说 v9 改顺了、适合新手进阶
  booz: { id: 'booz', name: '瞒天过海', en: 'Boozling', engine: 'snv',
    roles: ['noble', 'pixie', 'highpriestess', 'balloonist', 'fortuneteller', 'oracle', 'savant', 'philosopher', 'huntsman', 'fisherman', 'slayer', 'sage', 'cannibal',
      'drunk', 'mutant', 'damsel', 'klutz', 'golem', 'baron', 'cerenovus', 'scarletwoman', 'marionette', 'nodashii', 'fanggu', 'imp'] },
  rag: { id: 'rag', name: '诸神黄昏', en: 'Ragnarök', engine: 'ww', werewolf: true, ragnarok: true, players: RAG_PLAYERS, roles: ['ww_hunter', 'ww_wolf'] },
  // 娱乐模式：经典网杀「预女猎守」，不是血染。规则和人数表在 werewolf.js / werewolf-roles.js，房间流程在 server/werewolfRoom.js
  ww: { id: 'ww', name: '狼人杀', en: 'Werewolf', engine: 'ww', werewolf: true, players: WW_PLAYERS, roles: Object.keys(WW_ROLES) },
  // 娱乐模式（用户 2026-11-04 要的）：不是血染，是《抵抗组织：阿瓦隆》原版规则。没有血染角色，规则和角色都在 engine/avalon.js
  avalon: { id: 'avalon', name: '阿瓦隆', en: 'Avalon', engine: 'avalon', avalon: true, players: [5, 10], roles: [] },
  // 娱乐模式「暗印」（原创，用户 2026-11-05 要的）：后颈的花色自己看不到，同屋私聊才能互相看，夜里写错就爆炸。规则在 engine/mark.js
  mark: { id: 'mark', name: '暗印', en: 'The Unseen Mark', engine: 'mark', mark: true, players: [5, 15], roles: [] },
};
/** 剧本用的规则引擎：'tb' | 'bmr' | 'snv' | 'ww'（狼人杀）| 'avalon'。 */
export const engineOf = (script) => SCRIPTS[script]?.engine ?? 'tb';
/** 这个角色在不在这个剧本里。 */
export const inScript = (id, script) => (SCRIPTS[script ?? 'tb']?.roles ? SCRIPTS[script].roles.includes(id) : (ROLES[id]?.script ?? 'tb') === (script ?? 'tb'));
/** 某个剧本某个类型的角色 id 列表（小剧本按剧本页的顺序）。 */
export const rolesOf = (script, team) => (SCRIPTS[script]?.roles ?? Object.keys(ROLES)).filter((id) => ROLES[id] && inScript(id, script) && (!team || ROLES[id].team === team));
/** 剧本的人数范围。 */
export const playersOf = (script) => SCRIPTS[script]?.players ?? [MIN_PLAYERS, MAX_PLAYERS];

export const TEAM_NAME = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };

export const byTeam = (team) => rolesOf('tb', team); // 下面这几个列表是暗流涌动的（老代码在用）
export const TOWNSFOLK = byTeam('townsfolk');
export const OUTSIDERS = byTeam('outsider');
export const MINIONS = byTeam('minion');
export const DEMONS = byTeam('demon');
export const BMR_TOWNSFOLK = rolesOf('bmr', 'townsfolk');
export const BMR_OUTSIDERS = rolesOf('bmr', 'outsider');
export const BMR_MINIONS = rolesOf('bmr', 'minion');
export const BMR_DEMONS = rolesOf('bmr', 'demon');

export const isEvilRole = (id) => ['minion', 'demon'].includes(ROLES[id].team);

// 人数 → [镇民, 外来者, 爪牙, 恶魔]
export const DISTRIBUTION = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
  10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1],
  13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
};
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

export function roleLabel(id) {
  const r = ROLES[id];
  return `${r.name}（${TEAM_NAME[r.team]}）`;
}
