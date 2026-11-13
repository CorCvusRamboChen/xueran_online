// 狼人杀（娱乐模式，script: 'ww'）的角色和人数配置。不是血染钟楼的角色：规则在 werewolf.js，和血染的引擎互不相干。
// team 借血染的两类（townsfolk = 好人、demon = 狼人），只为了界面上的颜色和阵营判断能直接用；
// side 才是狼人杀自己的分法：wolf 狼人 / god 神职 / villager 平民（屠边看神职和平民）。
// 能力文字是照经典「预女猎守」网杀规则用自己的话写的。

export const WW_ROLES = {
  ww_wolf: { name: '狼人', en: 'Werewolf', team: 'demon', side: 'wolf', firstNight: 0, otherNight: 0,
    ability: '狼人互相认识。每晚和同伴商量刀一名玩家（可以空刀，也可以刀自己人）。所有神职或所有平民出局，狼人获胜。' },
  ww_seer: { name: '预言家', en: 'Seer', team: 'townsfolk', side: 'god', firstNight: 0, otherNight: 0,
    ability: '每晚查验一名其他存活玩家，得知他是好人还是狼人。' },
  ww_witch: { name: '女巫', en: 'Witch', team: 'townsfolk', side: 'god', firstNight: 0, otherNight: 0,
    ability: '有一瓶解药和一瓶毒药，整局各用一次。夜里先得知今晚谁被刀（解药用掉后不再得知），可以救他或毒一名玩家；同一晚只能用一瓶。只有首夜可以救自己。' },
  ww_hunter: { name: '猎人', en: 'Hunter', team: 'townsfolk', side: 'god', firstNight: 0, otherNight: 0,
    ability: '出局时可以开枪带走一名存活玩家（也可以不开）。被女巫毒死不能开枪。' },
  ww_guard: { name: '守卫', en: 'Guard', team: 'townsfolk', side: 'god', firstNight: 0, otherNight: 0,
    ability: '每晚守护一名玩家（可以守自己，也可以空守）：他今晚不会被狼人刀死。不能连续两晚守同一人。同一人被守又被女巫救，反而会死（奶穿）。' },
  ww_villager: { name: '平民', en: 'Villager', team: 'townsfolk', side: 'villager', firstNight: 0, otherNight: 0,
    ability: '没有技能。白天靠发言和投票找出狼人。' },
};

export const WW_GODS = ['ww_seer', 'ww_witch', 'ww_hunter', 'ww_guard'];

/**
 * 人数配置：9 人「预女猎 3 狼 3 民」、12 人「预女猎守 4 狼 4 民」是最常见的标准板子，其余人数按比例增减（狼人大约占四分之一到三分之一）。
 * 10 人起加守卫；6 人只有预言家和女巫。
 */
export const WW_SETUPS = {
  6: { wolves: 2, villagers: 2, gods: ['ww_seer', 'ww_witch'] },
  7: { wolves: 2, villagers: 2, gods: ['ww_seer', 'ww_witch', 'ww_hunter'] },
  8: { wolves: 2, villagers: 3, gods: ['ww_seer', 'ww_witch', 'ww_hunter'] },
  9: { wolves: 3, villagers: 3, gods: ['ww_seer', 'ww_witch', 'ww_hunter'] },
  10: { wolves: 3, villagers: 3, gods: WW_GODS },
  11: { wolves: 3, villagers: 4, gods: WW_GODS },
  12: { wolves: 4, villagers: 4, gods: WW_GODS },
  13: { wolves: 4, villagers: 5, gods: WW_GODS },
  14: { wolves: 5, villagers: 5, gods: WW_GODS },
  15: { wolves: 5, villagers: 6, gods: WW_GODS },
};
export const WW_PLAYERS = [6, 15];

/**
 * 诸神黄昏（娱乐模式，script: 'rag'）：狼人杀的板子，只有狼人和猎人。按人数定几只狼，其余全是猎人。
 * 用户 2026-11-04 定的玩法：猎人出局开一枪打谁谁死，被打死的猎人接着开。2026-11-11 用户：它是狼人杀的板子，走狼人杀的底层。
 */
export const ragnarokWolves = (n) => (n <= 6 ? 1 : n <= 9 ? 2 : n <= 12 ? 3 : 4);
export const RAG_PLAYERS = [5, 15];
/** 诸神黄昏里两个角色的能力说法（标准板子的说法提到神职、平民、女巫，这里都没有）。 */
export const RAG_ABILITY = {
  ww_wolf: '狼人互相认识。每晚和同伴一起刀一名玩家（可以空刀）。猎人全部出局，狼人获胜。',
  ww_hunter: '出局时（被刀或被放逐）可以开枪带走一名存活玩家，也可以不开。被你带走的猎人也能接着开枪。狼人全部出局，好人获胜。',
};
export const abilityIn = (id, script) => (script === 'rag' && RAG_ABILITY[id]) || WW_ROLES[id]?.ability;
