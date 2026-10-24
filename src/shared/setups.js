// 官方百科「给新手说书人的推荐配置（八人游戏）」。房主在大厅可以一键套用（只在 8 人时可选）。
// drunkAs：酒鬼以为自己是谁（暗流涌动配置 1 里的"酒鬼（调查员）"）。

export const SETUPS = {
  tb: [
    { name: '信息爆炸', roles: ['chef', 'empath', 'fortuneteller', 'undertaker', 'virgin', 'drunk', 'scarletwoman', 'imp'], drunkAs: 'investigator',
      note: '善良方信息很多，邪恶方相对安全。酒鬼以为自己是调查员（拿假信息，提名贞洁者不会被处决）。' },
    { name: '安静对局', roles: ['slayer', 'ravenkeeper', 'mayor', 'fortuneteller', 'empath', 'saint', 'poisoner', 'imp'],
      note: '慢慢验证圣徒、猎手、镇长；投毒者有很多目标。镇长夜里被刀可以换人死。' },
    { name: '逻辑链（进阶）', roles: ['washerwoman', 'slayer', 'virgin', 'undertaker', 'fortuneteller', 'recluse', 'spy', 'imp'],
      note: '陌客、间谍的误登记让逻辑链更深；串起来就能赢。' },
  ],
  bmr: [
    { name: '新手第一局', roles: ['gambler', 'professor', 'minstrel', 'pacifist', 'fool', 'tinker', 'assassin', 'shabaloth'],
      note: '最直白的一套。说书人要把握和平主义者、修补匠、沙巴洛斯反刍的时机。' },
    { name: '信息量爆炸', roles: ['gambler', 'courtier', 'chambermaid', 'grandmother', 'tinker', 'moonchild', 'godfather', 'zombuul'],
      note: '冒险换信息，整合信息抓僵怖；修补匠、月之子、教父制造额外死亡。' },
    { name: '邪恶狂欢', roles: ['chambermaid', 'innkeeper', 'minstrel', 'exorcist', 'fool', 'lunatic', 'assassin', 'pukka'],
      note: '刺客和普卡能杀本来不会死的人；疯子以为自己是恶魔。' },
    { name: '保命大战', roles: ['innkeeper', 'tealady', 'pacifist', 'professor', 'fool', 'tinker', 'devilsadvocate', 'shabaloth'],
      note: '双方都有很多保命手段，死人还可能复活。' },
    { name: '难题', roles: ['sailor', 'chambermaid', 'minstrel', 'courtier', 'gambler', 'goon', 'mastermind', 'po'],
      note: '珀一夜多杀，主谋让恶魔被处决后还多一天；侍臣是关键。' },
  ],
};
