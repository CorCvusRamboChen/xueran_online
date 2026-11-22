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
  // 横行霸道（Outed Evil，2026-11-19 用户发的剧本卡）的新角色。口径照集石百科，相克照官方 jinxes.json
  alchemist: { name: '炼金术士', en: 'Alchemist', team: 'townsfolk', firstNight: 1, otherNight: 0,
    ability: '你拥有一个不在场的爪牙角色的能力。（首夜说书人告诉你是哪个；之后在那个爪牙醒来的时候你醒来，像爪牙一样用能力）' },
  heretic: { name: '异端分子', en: 'Heretic', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '对调胜负结果，即使你已死亡。（你醉酒或中毒时不对调）' },
  fearmonger: { name: '恐惧之灵', en: 'Fearmonger', team: 'minion', firstNight: 1, otherNight: 1, choose: { count: 1 },
    ability: '每个夜晚，你要选择一名玩家：如果你提名他且他被处决，他的阵营落败。当你首次选择或更换目标时，所有玩家都会得知你选择了新的玩家。' },
  lleech: { name: '痢蛭', en: 'Lleech', team: 'demon', firstNight: 1, otherNight: 1, choose: { count: 1 },
    ability: '每个夜晚*，你要选择一名玩家：他死亡。在你的首个夜晚，你要选择一名存活的玩家：他中毒，只有当他处于死亡状态时你才会立即死亡。' },
  // 夜半狂欢可以把亡骨魔换成小怪宝或利维坦（2026-11-19 用户要的开关）。口径照集石百科小怪宝页
  lilmonsta: { name: '小怪宝', en: "Lil' Monsta", team: 'demon', firstNight: 0, otherNight: 0,
    ability: '每个夜晚，爪牙们选择一名爪牙：他照看小怪宝，并且「是恶魔」。每个夜晚*，可能会有一名玩家死亡。[+1 爪牙]（照看小怪宝的人死了，善良获胜）' },
};

// ───────────────────────── 七步成诗（2025 剧本世界杯冠军）里新出现的角色 ─────────────────────────
// 来自实验性角色和其他版本。能力文字照官方百科用自己的话写，口径见 references/seat7.md；顺序看 shared/nightOrder.js。
const BS7 = {
  // 《心理博弈》（Rochambeau v11）新加的 5 个实验性角色，能力原文照集石百科（2026-11-20）。结算在 engine/rochambeau.js
  bountyhunter: { name: '赏金猎人', en: 'Bounty Hunter', team: 'townsfolk', edition: 'experimental', firstNight: 1, otherNight: 1,
    ability: '在你的首个夜晚，你会得知一名邪恶玩家。每当你得知的玩家死亡，你会在当晚得知另一名邪恶玩家。[会有一名镇民转变为邪恶阵营]' },
  acrobat: { name: '杂技演员', en: 'Acrobat', team: 'townsfolk', edition: 'experimental', firstNight: 0, otherNight: 1,
    choose: { count: 1 },
    ability: '每个夜晚*，你要选择一名玩家：如果当晚他醉酒或中毒，你死亡。' },
  lycanthrope: { name: '半兽人', en: 'Lycanthrope', team: 'townsfolk', edition: 'experimental', firstNight: 0, otherNight: 1,
    choose: { count: 1, alive: true },
    ability: '每个夜晚*，你要选择一名存活玩家：如果他是善良的，他死亡，并且当晚恶魔不会造成死亡。会有一名善良玩家始终被当作邪恶阵营。' },
  nightwatchman: { name: '守夜人', en: 'Nightwatchman', team: 'townsfolk', edition: 'experimental', firstNight: 1, otherNight: 1,
    choose: { count: 1, optional: true, once: true },
    ability: '每局游戏限一次，在夜晚时，你可以选择一名玩家：他会得知你是守夜人。' },
  hatter: { name: '帽匠', en: 'Hatter', team: 'outsider', edition: 'experimental', firstNight: 0, otherNight: 0,
    ability: '如果你死亡，当晚爪牙和恶魔玩家可以选择变成新的爪牙和恶魔角色。' },
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
  // 夜半狂欢（The Midnight Oasis，作者 Zets）用到的五个（2026-11-16）
  engineer: { name: '工程师', en: 'Engineer', team: 'townsfolk', firstNight: 1, otherNight: 1,
    choose: { count: 0, optional: true, once: true, role: true, evil: true },
    ability: '每局游戏限一次，在夜晚时，你可以选择让恶魔变成你选择的恶魔角色，或让爪牙变成你选择的爪牙角色。' },
  poppygrower: { name: '罂粟种植者', en: 'Poppy Grower', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '爪牙和恶魔互相不认识。如果你死亡，当晚他们会互相认识。' },
  atheist: { name: '无神论者', en: 'Atheist', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '说书人可以打破游戏规则，如果说书人被处决，善良阵营获胜，即使你已死亡。[无邪恶角色在场]' },
  psychopath: { name: '精神病患者', en: 'Psychopath', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '每个白天，在提名开始前，你可以公开选择一名玩家：他死亡。如果你被处决，提名你的玩家需要和你猜拳，只有你输了你才会死亡。' },
  alhadikhia: { name: '哈迪寂亚', en: 'Al-Hadikhia', team: 'demon', firstNight: 0, otherNight: 1,
    choose: { count: 3, optional: true },
    ability: '每个夜晚*，你可以选择三名玩家（所有玩家都会得知你选了谁）：他们分别秘密决定自己的生死，然后如果他们都存活则都死亡。' },
  // 裁缝与暴乱（作者 Sui）用的旧版暴乱（2024-12 改版前的 v1 文字，剧本卡上印的就是这版）
  riot: { name: '暴乱', en: 'Riot', team: 'demon', firstNight: 0, otherNight: 0,
    ability: '被提名的玩家死亡，但他可以立刻再次发起提名（第三天白天他必须这么做）。在第三个白天结束时，邪恶阵营获胜。[所有邪恶阵营都是暴乱]' },
  mezepheles: { name: '灵言师', en: 'Mezepheles', team: 'minion', firstNight: 1, otherNight: 1,
    ability: '在你的首个夜晚，你会得知一个关键词。第一个说出这个关键词的善良玩家，当晚变成邪恶阵营。（要他开着收音页说才听得到）' },
  // 2026-11-22 小剧本 Nobody Fucking Move、Chatastrophe 用到的两个（集石百科：戏法师、牙噶巴卜）
  alsaahir: { name: '戏法师', en: 'Alsaahir', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '每个白天，你可以公开进行一次谁是爪牙，谁是恶魔的猜测。如果你猜对，善良阵营获胜。' },
  // 2026-11-23 Musical Chairs 用到的三个（集石百科：异教领袖、国王、唱诗男孩）
  cultleader: { name: '异教领袖', en: 'Cult Leader', team: 'townsfolk', firstNight: 1, otherNight: 1,
    ability: '每个夜晚，你会转变为与你邻近的一名存活的玩家的阵营。每个白天，你可以提议所有玩家加入你的教派，如果所有善良玩家同意加入，你的阵营获胜。' },
  king: { name: '国王', en: 'King', team: 'townsfolk', firstNight: 0, otherNight: 1,
    ability: '每个夜晚，如果死亡的玩家数量大于或等于存活的玩家数量，你会得知一个存活的角色。恶魔知道你是国王。' },
  choirboy: { name: '唱诗男孩', en: 'Choirboy', team: 'townsfolk', firstNight: 0, otherNight: 1,
    ability: '如果恶魔杀死了国王，你会得知哪名玩家是恶魔。[+国王]' },
  // 2026-11-23 抢椅子 Will 版用到的（集石百科：街头风琴手）。结算在 engine/snv.js（夜里选醉不醉）、server/room.js（秘密投票）
  organgrinder: { name: '街头风琴手', en: 'Organ Grinder', team: 'minion', firstNight: 1, otherNight: 1, choose: { count: 0, role: true },
    ability: '所有玩家在投票时闭眼，且票数会秘密统计。每个夜晚，你要选择自己是否醉酒直到下个黄昏。' },
  // 2026-11-23 大剧本 Extension Cord、No Roles Barred 用到的两个（集石百科：解谜大师、军团）
  puzzlemaster: { name: '解谜大师', en: 'Puzzlemaster', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '一名玩家醉酒，即使你已死亡。每局游戏限一次，你可以猜测谁是那个醉酒的玩家，如果猜对了，你会得知谁是恶魔，但如果猜错了，你会得知错误的「谁是恶魔」信息。' },
  legion: { name: '军团', en: 'Legion', team: 'demon', firstNight: 0, otherNight: 1,
    ability: '每个夜晚*，可能有一名玩家死亡。如果一项提名只有邪恶玩家投票，投票无效。你也会被当作是爪牙。[多数玩家为军团]' },
  yaggababble: { name: '牙噶巴卜', en: 'Yaggababble', team: 'demon', firstNight: 1, otherNight: 1,
    ability: '在你的首个夜晚，你会得知一段秘密短语。每次你在白天公开说出这段短语，当天便可能会有一名玩家在这之后死亡。（要开着收音页说才听得到）' },
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

// 旅行者（2026-11-16 用户要的）：开局后才进来的人可以当旅行者加入，随时可以离开；阵营由说书人定，邪恶的得知恶魔是谁。
// 不算进人数配置、不算进「只剩两人存活」；对他们只能「流放」（全体举手，过所有玩家的一半），不算处决。
// 官方 15 个里先做线上自动说书做得好的 6 个，结算在 engine/travellers.js，房间流程在 server/room.js。
const TRAVELLERS = {
  thief: { name: '窃贼', en: 'Thief', team: 'traveller', edition: 'tb', firstNight: 6, otherNight: 6, choose: { count: 1, notSelf: true },
    ability: '每个夜晚，选择除你以外的一名玩家：他明天白天的投票算作负数。' },
  bureaucrat: { name: '官员', en: 'Bureaucrat', team: 'traveller', edition: 'tb', firstNight: 6, otherNight: 6, choose: { count: 1, notSelf: true },
    ability: '每个夜晚，选择除你以外的一名玩家：他明天白天的投票算作三票。' },
  gunslinger: { name: '枪手', en: 'Gunslinger', team: 'traveller', edition: 'tb', firstNight: 0, otherNight: 0,
    ability: '每个白天，在第一次投票被统计后，你可以选择一名在这次投票中投过票的玩家：他死亡。' },
  scapegoat: { name: '替罪羊', en: 'Scapegoat', team: 'traveller', edition: 'tb', firstNight: 0, otherNight: 0,
    ability: '如果你所在阵营的一名玩家被处决，你可能会代替他被处决。' },
  judge: { name: '法官', en: 'Judge', team: 'traveller', edition: 'bmr', firstNight: 0, otherNight: 0,
    ability: '每局游戏限一次，如果另一名玩家发起了提名，你可以选择强制让当前的处决成功或失败。' },
  voudon: { name: '巫毒师', en: 'Voudon', team: 'traveller', edition: 'bmr', firstNight: 0, otherNight: 0,
    ability: '只有你和已死亡的玩家可以投票。他们投票时不需要消耗投票标记。投票不需要达到半数。' },
  // 2026-11-16 补齐官方 15 个旅行者（照集石百科；夜晚顺序照官方英文总表：学徒、咖啡师、官员、窃贼、流莺、集骨者都在夜晚最前面）
  beggar: { name: '乞丐', en: 'Beggar', team: 'traveller', edition: 'tb', firstNight: 0, otherNight: 0,
    ability: '你只能使用投票标记进行投票。死亡的玩家可以把他的投票标记给你，如果他这么做，你会得知他的阵营。你不会中毒和醉酒。' },
  apprentice: { name: '学徒', en: 'Apprentice', team: 'traveller', edition: 'bmr', firstNight: 0, otherNight: 0,
    ability: '在你的首个夜晚，你会获得一个镇民能力（如果你是善良的），或一个爪牙能力（如果你是邪恶的）。' },
  matron: { name: '女舍监', en: 'Matron', team: 'traveller', edition: 'bmr', firstNight: 0, otherNight: 0,
    ability: '每个白天，你可以选择至多三对玩家交换座位。玩家不能离开自己的座位进行私聊。' },
  bishop: { name: '主教', en: 'Bishop', team: 'traveller', edition: 'bmr', firstNight: 0, otherNight: 0,
    ability: '只有说书人可以发起提名。每个白天，说书人至少要提名一名你对立阵营的玩家。' },
  // 实验性旅行者（集石百科「黑帮」）：Musical Chairs 用
  gangster: { name: '黑帮', en: 'Gangster', team: 'traveller', edition: 'exp', firstNight: 0, otherNight: 0,
    ability: '每个白天限一次，你可以杀死与你邻近的两名存活的玩家中的一名，但需要另一边那个存活的玩家同意。' },
  deviant: { name: '怪咖', en: 'Deviant', team: 'traveller', edition: 'snv', firstNight: 0, otherNight: 0,
    ability: '如果你表现得很有趣，当天你不能被流放。' },
  bonecollector: { name: '集骨者', en: 'Bone Collector', team: 'traveller', edition: 'snv', firstNight: 0, otherNight: 1, choose: { count: 1, dead: true, optional: true, once: true },
    ability: '每局游戏限一次，在夜晚时*，你可以选择一名死亡的玩家：他重新获得能力直到下个黄昏。' },
  barista: { name: '咖啡师', en: 'Barista', team: 'traveller', edition: 'snv', firstNight: 0, otherNight: 0,
    ability: '每个夜晚，直到下个黄昏：1) 一名玩家清醒且健康并获得正确信息，或 2) 一名玩家的能力生效两次。他会得知是哪一个效果。' },
  harlot: { name: '流莺', en: 'Harlot', team: 'traveller', edition: 'snv', firstNight: 0, otherNight: 1, choose: { count: 1, alive: true, notSelf: true },
    ability: '每个夜晚*，选择一名存活的玩家：如果他同意，你会得知他的角色，但是你们两个可能同时死亡。' },
  gnome: { name: '侏儒', en: 'Gnome', team: 'traveller', edition: 'experimental', firstNight: 0, otherNight: 0,
    ability: '当你加入游戏时，所有玩家会得知一名与你阵营相同的玩家。每当他被提名时，你可以杀死提名者。' },
  butcher: { name: '屠夫', en: 'Butcher', team: 'traveller', edition: 'snv', firstNight: 0, otherNight: 0,
    ability: '每个白天，在首次处决后，你可以再次发起提名。' },
};
export const TRAVELLER_IDS = Object.keys(TRAVELLERS);
// 每个剧本的旅行者（2026-11-16 用户：只用官方的，全按集石百科）：三个基础剧本照百科「旅行者」页的推荐（各五个），
// 社区剧本照它们发布的剧本 JSON 里列的。没列的剧本没有旅行者。大厅「全部角色」、技能表、夜间顺序、加入面板都读这里。
export const SCRIPT_TRAVELLERS = {
  tb: ['bureaucrat', 'beggar', 'gunslinger', 'thief', 'scapegoat'],
  bmr: ['judge', 'matron', 'voudon', 'apprentice', 'bishop'],
  snv: ['deviant', 'bonecollector', 'barista', 'harlot', 'butcher'],
  bs7: ['gnome', 'bureaucrat', 'scapegoat', 'harlot'],                // TPI 官方仓库 wc25/seat7/script.json、集石百科「七步成诗」页
  cat: ['barista', 'harlot', 'bonecollector', 'apprentice', 'beggar'], // botcscripts 第 3 号 v11.1.10
  // 夜半狂欢：剧本卡（botcscripts 104 号 v3.8.0）没列旅行者，网上也没找到别人配好的；用户 2026-11-20 同意借梦殒春宵的五个（同一套引擎、同样玩信息和疯狂）
  mo: ['deviant', 'bonecollector', 'barista', 'harlot', 'butcher'],
  ext: ['bureaucrat', 'butcher', 'matron', 'bonecollector', 'bishop'], // Extension Cord 剧本 JSON 里列的
  mc: ['gangster', 'harlot', 'matron', 'deviant', 'apprentice'],       // Musical Chairs 剧本 JSON 里列的
};
// 传奇角色（集石百科「传奇角色」页）：不是玩家拿的角色，是说书人给这一局加的全场规则；会告诉所有人加了哪些。
// 剧本里用 sentinel / ivory / fibbin / doomsayer / duchess / bootlegger 标记（夜半狂欢：哨兵、圣洁之魂；裁缝与暴乱：骗人精；小剧本：末日预言者、公爵夫人、私酒贩子）
export const FABLED = {
  sentinel: { name: '哨兵', en: 'Sentinel', flag: 'sentinel', ability: '可能会额外增加或减少一个外来者。',
    detail: '开局配置时，说书人三选一：多 1 个外来者（少 1 个镇民）、少 1 个外来者（多 1 个镇民），或者不变。外来者人数因此说不准，邪恶伪装外来者更安全。' },
  spiritofivory: { name: '圣洁之魂', en: 'Spirit of Ivory', flag: 'ivory', ability: '邪恶玩家的数量最多只会比初始设置多一名。',
    detail: '第一次有人转成邪恶照常生效；已经多出一名邪恶后，再有人要转成邪恶就不转（保持善良）。有邪恶转回善良时，限制重新放开。交换阵营不算多出邪恶。' },
  fibbin: { name: '骗人精', en: 'Fibbin', flag: 'fibbin', ability: '每局游戏限一次，一名善良玩家可能会得知错误的信息。',
    detail: '说书人整局最多用一次：让某个善良玩家拿到一条假信息。用掉以后，所有善良玩家的信息都按正常处理。' },
  // 2026-11-22（集石百科「末日预言者」「公爵夫人」；私酒贩子是剧本卡上写的自定义规则）
  doomsayer: { name: '末日预言者', en: 'Doomsayer', flag: 'doomsayer', ability: '如果大于等于四名玩家存活，每名当前存活的玩家可以公开要求你杀死一名与他阵营相同的玩家（每名玩家限一次）。',
    detail: '白天任何时候，存活的玩家可以点「末日预言者」公开使用（每人每局一次，活人不到 4 个就不能用）。说书人挑一名和他同阵营的存活玩家，那人当场死亡（可能是他自己）。' },
  duchess: { name: '公爵夫人', en: 'Duchess', flag: 'duchess', ability: '每个白天，三名玩家可以一起拜访你。当晚*，他们会得知他们之中有几个是邪恶的，但其中一人的信息是错的。',
    detail: '白天点「拜访公爵夫人」报名，黄昏时正好三个人报名才算数（多了少了今晚都不拜访）。当晚三人各自得知三人里有几个邪恶，其中一人（说书人选）的数字是错的。' },
  // 奇遇角色（Loric，2026-03 官方新出；集石百科「诡诈杰克」）
  knaves: { name: '诡诈杰克', en: 'Knaves', flag: 'knaves', ability: '场上有两位说书人：一人说真话，一人说假话。每局游戏限一次，他们可能会在黄昏互换。',
    detail: '能力给的信息（夜里醒来、白天找说书人）由你选的那位说书人给：说真话的给真的，说假话的给假的。点「找说书人甲 / 乙」随时换。规则、提名投票、爪牙恶魔信息这些两位都说真话。整局最多一次，两位会在某个黄昏悄悄互换。醉酒中毒的人两位都可能给假。' },
  // 2026-11-23 抢椅子 Will 版（botcscripts 995 号 12.0.0，作者 Will）的自制传奇角色，和推荐的园丁
  musicalchairs: { name: '抢椅子', en: 'Musical Chairs', flag: 'chairs', ability: '所有玩家开局都是善良。每个夜晚出信息前，每名玩家可以选择和另一名玩家或一个空座位交换：连角色带阵营一起换。每名玩家整局限换 2 次。[-1 爪牙，+1 外来者或镇民]',
    detail: '角色是跟着座位走的：邪恶角色开局都放在没人坐的空座位上，所有玩家坐的都是善良座位。每晚入夜前大家悄悄决定换不换：和一名活着的玩家换，或者换到一个空座位上（换之前不知道那里是什么）。换完你就是那个座位的角色和阵营，原来的角色留在对方或那个空座位上；被换的人会得知自己的新角色，但不知道是谁换的。空座位上的利维坦也算在场。' },
  gardener: { name: '园丁', en: 'Gardener', flag: 'gardener', ability: '说书人指定一名或多名玩家的角色。',
    detail: '房主开局可以在排版台给玩家指定角色。' },
  bootlegger: { name: '私酒贩子', en: 'Bootlegger', flag: 'bootlegger', ability: '这个剧本有自定义的角色或规则。',
    detail: '本剧本的自定义规则：炼金术士拿到的是一个不在场的爪牙的能力（这里本来就这样做）。' },
};
/** 这个剧本加了哪些传奇角色（id 列表）。 */
export const fabledOf = (script) => Object.keys(FABLED).filter((id) => SCRIPTS[script]?.[FABLED[id].flag]);

/** 这个剧本的旅行者（没列的剧本是空的）。 */
export const travellersOf = (script) => (SCRIPT_TRAVELLERS[script] ?? []).filter((id) => TRAVELLER_IDS.includes(id));

// 不是角色，只是夜里的一个选择：哈迪寂亚选中的人悄悄决定活还是死（选「角色」ah_live / ah_die）。结算在 engine/snv.js
const PROMPT_ONLY = {
  ah_choice: { name: '哈迪寂亚选中了你', en: 'Al-Hadikhia', team: 'demon', firstNight: 0, otherNight: 0, choose: { count: 0, role: true },
    ability: '悄悄选择：活下去，还是死去。如果被选中的三个人最后都活着，三个人一起死。' },
  ah_live: { name: '活下去', en: 'Live', team: 'townsfolk', firstNight: 0, otherNight: 0, ability: '' },
  ah_die: { name: '死去', en: 'Die', team: 'townsfolk', firstNight: 0, otherNight: 0, ability: '' },
  lm_sit: { name: '照看小怪宝', en: "Lil' Monsta", team: 'minion', firstNight: 0, otherNight: 0, choose: { count: 1, alive: true },
    ability: '你们爪牙决定今晚由谁照看小怪宝：选一名活着的爪牙（可以选自己）。照看的人「是恶魔」，他死了善良获胜。' },
  og_drunk: { name: '醉酒到黄昏', en: 'Drunk until dusk', team: 'minion', firstNight: 0, otherNight: 0, ability: '' },
  og_sober: { name: '保持清醒', en: 'Stay sober', team: 'minion', firstNight: 0, otherNight: 0, ability: '' },
  harlot_ask: { name: '流莺选中了你', en: 'Harlot', team: 'traveller', firstNight: 0, otherNight: 0, choose: { count: 0, role: true },
    ability: '流莺想知道你的角色。同意的话，她会得知你的角色，但你们两个可能同时死亡。' },
  harlot_yes: { name: '同意', en: 'Yes', team: 'townsfolk', firstNight: 0, otherNight: 0, ability: '' },
  // 全员失忆：只给本人看的角色卡（他只知道自己是哪一类）
  amn_townsfolk: { name: '失忆的镇民', en: 'Amnesiac Townsfolk', team: 'townsfolk', firstNight: 0, otherNight: 0,
    ability: '你是镇民，但你不知道自己是哪个角色。你的能力照常生效。每个白天，你可以问说书人一次关于自己能力或角色的问题，得知你猜得有多准（完美 / 接近 / 有关 / 无关）。' },
  amn_outsider: { name: '失忆的外来者', en: 'Amnesiac Outsider', team: 'outsider', firstNight: 0, otherNight: 0,
    ability: '你是外来者，但你不知道自己是哪个角色。你的能力照常生效。每个白天，你可以问说书人一次关于自己能力或角色的问题，得知你猜得有多准（完美 / 接近 / 有关 / 无关）。' },
  amn_minion: { name: '失忆的爪牙', en: 'Amnesiac Minion', team: 'minion', firstNight: 0, otherNight: 0,
    ability: '你是爪牙，但你不知道自己是哪个角色。你的能力照常生效。每个白天，你可以问说书人一次关于自己能力或角色的问题，得知你猜得有多准（完美 / 接近 / 有关 / 无关）。' },
  amn_demon: { name: '失忆的恶魔', en: 'Amnesiac Demon', team: 'demon', firstNight: 0, otherNight: 0,
    ability: '你是恶魔，但你不知道自己是哪个角色。你的能力照常生效。每个白天，你可以问说书人一次关于自己能力或角色的问题，得知你猜得有多准（完美 / 接近 / 有关 / 无关）。' },
  hatter_pick: { name: '帽匠的茶会', en: 'Hatter', team: 'minion', firstNight: 0, otherNight: 0, choose: { count: 0, role: true, optional: true },
    ability: '帽匠死了：你可以换成剧本里另一个同类型、不在场的角色，也可以不换。' },
  harlot_no: { name: '拒绝', en: 'No', team: 'townsfolk', firstNight: 0, otherNight: 0, ability: '' },
};

for (const [id, r] of Object.entries(ROLES)) r.script = 'tb';
for (const [id, r] of Object.entries(BMR)) { r.script = 'bmr'; ROLES[id] = r; }
for (const [id, r] of Object.entries(SNV)) { r.script = 'snv'; ROLES[id] = r; }
for (const [id, r] of Object.entries(LUF)) { r.script = 'luf'; ROLES[id] = r; }
for (const [id, r] of Object.entries(BS7)) { r.script = 'bs7'; ROLES[id] = r; }
for (const [id, r] of Object.entries(EXP)) { r.script = 'exp'; ROLES[id] = r; }
for (const [id, r] of Object.entries(AMNESIAC_ONLY)) { r.script = 'amnesiac'; r.virtual = true; ROLES[id] = r; }
for (const [id, r] of Object.entries(PROMPT_ONLY)) { r.script = 'prompt'; r.virtual = true; ROLES[id] = r; }
for (const [id, r] of Object.entries(TRAVELLERS)) { r.script = 'traveller'; ROLES[id] = r; } // 不属于任何剧本的角色名单（rolesOf 不列），旅行者面板单独列
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
  // 2026-11-22 又加六个 5–6 人小剧本（角色表取自 botcscripts.com 的剧本 JSON；相克照官方 Djinn 表）
  // Over the River（Andrew Nathenson）：官方出的第三个小剧本（bloodontheclocktower.com/teensyville）
  otr: { id: 'otr', name: '去外婆家', en: 'Over the River', engine: 'snv', teensy: true, players: [5, 6],
    roles: ['grandmother', 'clockmaker', 'innkeeper', 'snakecharmer', 'professor', 'slayer', 'lunatic', 'recluse', 'godfather', 'spy', 'imp'] },
  // A Lleech of Distrust v2.1.1（OJ，官方推荐）：botcscripts 收藏最多的小剧本。相克：猎手射中痢蛭的宿主，宿主死亡
  lod: { id: 'lod', name: '疑心痢蛭', en: 'A Lleech of Distrust', engine: 'snv', teensy: true, players: [5, 6], sentinel: true,
    roles: ['pixie', 'undertaker', 'exorcist', 'fisherman', 'slayer', 'juggler', 'drunk', 'lunatic', 'devilsadvocate', 'marionette', 'lleech'] },
  // Late Night Drive By v1.6.0（Aero，官方推荐）：两个恶魔
  lnd: { id: 'lnd', name: '深夜飞车', en: 'Late Night Drive By', engine: 'snv', teensy: true, players: [5, 6],
    roles: ['snakecharmer', 'lycanthrope', 'slayer', 'fool', 'alchemist', 'minstrel', 'tinker', 'recluse', 'golem', 'godfather', 'psychopath', 'scarletwoman', 'pukka', 'imp'] },
  // Race to the Bottom v1.2.1（Evin Donohoe，官方推荐）：涡流 + 传奇角色末日预言者、哨兵
  rtb: { id: 'rtb', name: '逐底竞赛', en: 'Race to the Bottom', engine: 'snv', teensy: true, players: [5, 6], sentinel: true, doomsayer: true,
    roles: ['clockmaker', 'empath', 'dreamer', 'slayer', 'courtier', 'mayor', 'lunatic', 'klutz', 'scarletwoman', 'spy', 'vortox'] },
  // Nobody Fucking Move v1.0.1（Brockwell，当月推荐剧本）：传奇角色私酒贩子（自定义规则：炼金术士拿不在场的爪牙能力）、公爵夫人、哨兵
  nfm: { id: 'nfm', name: '谁都别动', en: 'Nobody Fucking Move', engine: 'snv', teensy: true, players: [5, 6], sentinel: true, duchess: true, bootlegger: true,
    roles: ['snakecharmer', 'alsaahir', 'slayer', 'philosopher', 'alchemist', 'virgin', 'heretic', 'damsel', 'klutz', 'psychopath', 'goblin', 'boomdandy', 'pukka', 'vortox'] },
  // Musical Chairs v1.0.1（Chuji，botcscripts 995 号）：抢椅子——舞蛇人、麻脸巫婆、理发师、方古、哲学家都在换角色；
  // 新角色异教领袖、国王、唱诗男孩，旅行者黑帮。相克：麻脸巫婆把邪恶玩家变成异教领袖，他不会因自己的能力变善良
  mc: { id: 'mc', name: '抢椅子', en: 'Musical Chairs', engine: 'snv',
    roles: ['investigator', 'librarian', 'cultleader', 'empath', 'sailor', 'king', 'snakecharmer', 'savant', 'amnesiac', 'philosopher', 'choirboy', 'tealady', 'fool',
      'acrobat', 'barber', 'drunk', 'recluse', 'pithag', 'devilsadvocate', 'poisoner', 'marionette', 'fanggu', 'nodashii', 'vigormortis', 'lleech'] },
  // Musical Chairs 12.0.0（Will，同在 botcscripts 995 号下）：自制传奇角色「抢椅子」——角色跟着座位走，邪恶角色开局都在空座位上，
  // 每晚可以和玩家或空座位交换（每人两次）。相克：利维坦在场时祖母的孙子被处决，邪恶获胜；哲学家拿到赏金猎人的能力，可能有一名镇民转为邪恶
  mcw: { id: 'mcw', name: '抢椅子 · 空座位', en: 'Musical Chairs (Will)', engine: 'snv', chairs: true, gardener: true,
    roles: ['washerwoman', 'clockmaker', 'grandmother', 'bountyhunter', 'empath', 'dreamer', 'villageidiot', 'snakecharmer', 'fortuneteller', 'artist', 'juggler', 'fisherman', 'philosopher',
      'puzzlemaster', 'recluse', 'mutant', 'lunatic', 'baron', 'eviltwin', 'organgrinder', 'mastermind', 'leviathan'] },
  // 2026-11-23 三个大剧本（角色表取自 botcscripts.com 的剧本 JSON；相克照官方 Djinn 表）
  // Extension Cord v5.1.1（Viva La Sam，当月推荐剧本，botcscripts 收藏第二多）：解谜大师、传奇角色哨兵
  ext: { id: 'ext', name: '延长线', en: 'Extension Cord', engine: 'snv', sentinel: true,
    roles: ['investigator', 'pixie', 'empath', 'mathematician', 'dreamer', 'oracle', 'monk', 'huntsman', 'artist', 'fisherman', 'soldier', 'cannibal', 'ravenkeeper',
      'recluse', 'barber', 'mutant', 'damsel', 'puzzlemaster', 'poisoner', 'spy', 'marionette', 'boomdandy', 'scarletwoman', 'nodashii'] },
  // No Roles Barred v1.0.1（Andrew Pichot，No Rolls Barred 剧本比赛冠军）：恶魔是小怪宝、军团或涡流
  nrb: { id: 'nrb', name: '百无禁忌', en: 'No Roles Barred', engine: 'snv',
    roles: ['alchemist', 'noble', 'pixie', 'bountyhunter', 'balloonist', 'empath', 'snakecharmer', 'gossip', 'amnesiac', 'artist', 'philosopher', 'huntsman', 'poppygrower',
      'goon', 'mutant', 'damsel', 'drunk', 'godfather', 'poisoner', 'fearmonger', 'goblin', 'boomdandy', 'lilmonsta', 'legion', 'vortox'] },
  // The Minotaur's Labyrinth v3.0.0（Urban Minotaur）：四个恶魔，加奇遇角色诡诈杰克（两位说书人一真一假）
  mino: { id: 'mino', name: '米诺陶迷宫', en: "The Minotaur's Labyrinth", engine: 'snv', knaves: true,
    roles: ['investigator', 'clockmaker', 'mathematician', 'fortuneteller', 'towncrier', 'monk', 'savant', 'seamstress', 'professor', 'slayer', 'fisherman', 'cannibal', 'ravenkeeper',
      'recluse', 'klutz', 'mutant', 'politician', 'godfather', 'witch', 'cerenovus', 'scarletwoman', 'imp', 'shabaloth', 'po', 'fanggu'] },
  // Chatastrophe v1.1.0（TieGuyTravis）：2025 Beardy Does Teensies 比赛冠军。牙噶巴卜要听语音：全员收音。相克：洗脑师可以让人疯狂地证明自己是哥布林
  chat: { id: 'chat', name: '话多成灾', en: 'Chatastrophe', engine: 'snv', teensy: true, players: [5, 6], sentinel: true,
    roles: ['highpriestess', 'savant', 'artist', 'fisherman', 'juggler', 'amnesiac', 'lunatic', 'drunk', 'cerenovus', 'goblin', 'yaggababble', 'lleech'] },
  // 2025 剧本世界杯冠军（作者 TrashWarlock）。灯神规则：7 号座位没有人坐，由说书人替它做决定，每局可以替它发言一次（seat7）。
  // players 是真人（含机器人）的人数，开局时再插进 7 号空座；旅行者没有做。
  bs7: { id: 'bs7', name: '七步成诗', en: 'The Ballad of Seat 7', engine: 'snv', seat7: true, players: [6, 14],
    roles: ['noble', 'librarian', 'shugenja', 'balloonist', 'villageidiot', 'dreamer', 'oracle', 'innkeeper', 'seamstress', 'fisherman', 'farmer', 'virgin', 'magician',
      'drunk', 'recluse', 'saint', 'damsel', 'harpy', 'boomdandy', 'scarletwoman', 'boffin', 'baron', 'pukka', 'imp', 'vigormortis'] },
  // 最有名的自定义剧本之一（作者 Emily，v11.1），只用三个基础剧本和实验性角色；中文名是本项目起的（官方没有译名）
  // 中文社区叫《瓦釜雷鸣》（钟楼剧本博物馆第 15 期，剧本卡写 Catfishing、作者 Emily）；2026-11-20 用户叫它瓦釜雷鸣，名字从本项目起的「冒名钓鱼」改过来
  cat: { id: 'cat', name: '瓦釜雷鸣', en: 'Catfishing', engine: 'snv',
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
  // 裁缝与暴乱（作者 Sui，美术 Lei；用户 2026-11-15 从杭州说书人的帖子里要的极速板子）：所有善良都是女裁缝，所有邪恶都是暴乱（旧版），
  // 传奇角色骗人精（每局一次，一名善良玩家可能得到错误信息）。口径见 references/community.md
  sar: { id: 'sar', name: '裁缝与暴乱', en: 'Seamstresses & Riot', engine: 'snv', riot: true, fibbin: true, roles: ['seamstress', 'riot'] },
  // 夜半狂欢（The Midnight Oasis，作者 Zets，钟楼剧本博物馆美术；用户 2026-11-16 发来剧本卡）：「旋转木马」快速上手剧本，7–15 人。
  // 传奇角色：哨兵（外来者可能 ±1）、圣洁之魂（邪恶玩家最多比开局多一名）。口径见 references/community.md
  mo: { id: 'mo', name: '夜半狂欢', en: 'The Midnight Oasis', engine: 'snv', players: [7, 15], sentinel: true, ivory: true, demonSwap: ['lilmonsta', 'leviathan'], // 房间设置可以把亡骨魔换成这两个
    roles: ['noble', 'snakecharmer', 'balloonist', 'huntsman', 'engineer', 'fisherman', 'professor', 'savant', 'amnesiac', 'farmer', 'cannibal', 'poppygrower', 'atheist',
      'drunk', 'barber', 'golem', 'damsel', 'poisoner', 'psychopath', 'mezepheles', 'pithag', 'alhadikhia', 'vigormortis'] },
  // 横行霸道（Outed Evil v4.5.0，作者 Manny，美术 Lei & 摸鱼；染钟楼谜团剧本世界杯第二名；用户 2026-11-19 发来剧本卡）：7–15 人。
  // 坏人会「出头」：恐惧之灵换目标全场都知道、精神病患者白天当众杀人、哥布林自曝。传奇角色哨兵。口径见 references/community.md
  oe: { id: 'oe', name: '横行霸道', en: 'Outed Evil', engine: 'snv', players: [7, 15], sentinel: true,
    roles: ['alchemist', 'sailor', 'general', 'fortuneteller', 'snakecharmer', 'monk', 'savant', 'juggler', 'fisherman', 'huntsman', 'tealady', 'cannibal', 'poppygrower',
      'damsel', 'politician', 'barber', 'goon', 'heretic', 'poisoner', 'fearmonger', 'goblin', 'devilsadvocate', 'psychopath', 'lleech', 'imp'] },
  // 心理博弈（Rochambeau v11.0.0，作者 Habby，剧本世界杯 32 强；botcscripts 87 号；2026-11-20 用户：按 v11 做）。
  // v11 改动：莽夫换成陌客；私酒贩子规则：麻脸巫婆 + 利维坦的相克不生效（我们本来就没做这条相克）。中文社区常玩 v9，角色不一样
  roc: { id: 'roc', name: '心理博弈', en: 'Rochambeau', engine: 'snv', players: [5, 15],
    roles: ['noble', 'bountyhunter', 'highpriestess', 'towncrier', 'innkeeper', 'gambler', 'acrobat', 'lycanthrope', 'gossip', 'nightwatchman', 'seamstress', 'cannibal', 'mayor',
      'tinker', 'recluse', 'moonchild', 'hatter', 'godfather', 'poisoner', 'pithag', 'assassin', 'widow', 'po', 'vigormortis', 'leviathan'] },
  // 全员失忆（2026-11-20 用户：娱乐本；网上没有固定的角色表，是一种玩法，见 engine/allAmnesiac.js）：角色从三个官方剧本里发，roles 在下面补
  amn: { id: 'amn', name: '全员失忆', en: 'All Amnesiacs', engine: 'snv', players: [5, 15], allAmnesiac: true, roles: [] },
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
export const rolesOf = (script, team, swap = SWAP[script]) => (SCRIPTS[script]?.roles ?? Object.keys(ROLES)).filter((id) => ROLES[id] && inScript(id, script))
  .map((id) => swapRole(id, swap)).filter((id) => !team || ROLES[id].team === team);
/**
 * 夜半狂欢的恶魔开关（2026-11-19 用户）：这局把亡骨魔换成了谁（'lilmonsta' / 'leviathan'，null 不换）。
 * 引擎用 game.scriptRoles()（每局自己的）；前端只有一局，用 setDemonSwap 记下来，技能表、角色页、夜晚顺序都跟着换。
 */
const SWAP = {};
export const swapRole = (id, swap) => (id === 'vigormortis' && swap && swap !== 'vigormortis' && ROLES[swap] ? swap : id);
export const setDemonSwap = (script, swap) => { if (swap && swap !== 'vigormortis' && SCRIPTS[script]?.demonSwap?.includes(swap)) SWAP[script] = swap; else delete SWAP[script]; };
/** 剧本的人数范围。 */
export const playersOf = (script) => SCRIPTS[script]?.players ?? [MIN_PLAYERS, MAX_PLAYERS];

export const TEAM_NAME = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔', traveller: '旅行者' };

export const byTeam = (team) => rolesOf('tb', team); // 下面这几个列表是暗流涌动的（老代码在用）
export const TOWNSFOLK = byTeam('townsfolk');
export const OUTSIDERS = byTeam('outsider');
export const MINIONS = byTeam('minion');
export const DEMONS = byTeam('demon');
export const BMR_TOWNSFOLK = rolesOf('bmr', 'townsfolk');
export const BMR_OUTSIDERS = rolesOf('bmr', 'outsider');
export const BMR_MINIONS = rolesOf('bmr', 'minion');
export const BMR_DEMONS = rolesOf('bmr', 'demon');

/** 有无神论者的剧本里，活人可以提名说书人：被提名的「玩家」id 用这个。 */
export const ST_NOMINEE = 'storyteller';

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

// 全员失忆的角色池：三个官方剧本的全部角色，去掉必须先知道自己是谁才玩得了的杂耍艺人（第一天要公开猜）、畸形秀演员（不能让人信自己是外来者）
SCRIPTS.amn.roles = [...new Set(['tb', 'bmr', 'snv'].flatMap((k) => rolesOf(k)))].filter((r) => !['juggler', 'mutant'].includes(r));
