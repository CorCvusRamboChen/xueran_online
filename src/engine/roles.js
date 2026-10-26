// 两个剧本的全部角色：暗流涌动（Trouble Brewing，script: 'tb'）和黯月初升（Bad Moon Rising，script: 'bmr'）。
// firstNight / otherNight 是夜晚行动顺序（0 = 这一晚不醒；两个剧本各自排序），
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
for (const [id, r] of Object.entries(ROLES)) r.script = 'tb';
for (const [id, r] of Object.entries(BMR)) { r.script = 'bmr'; ROLES[id] = r; }

export const SCRIPTS = {
  tb: { id: 'tb', name: '暗流涌动', en: 'Trouble Brewing' },
  bmr: { id: 'bmr', name: '黯月初升', en: 'Bad Moon Rising' },
};
/** 某个剧本某个类型的角色 id 列表。 */
export const rolesOf = (script, team) => Object.keys(ROLES).filter((id) => ROLES[id].script === script && (!team || ROLES[id].team === team));

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
