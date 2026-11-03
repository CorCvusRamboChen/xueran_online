// 三个剧本的夜晚顺序（照官方的夜晚顺序表）：前端「角色」页的夜间顺序说明用，黯月初升和梦殒春宵的结算顺序（engine/bmr.js、engine/snv.js）也读这里。
// 每一步：[角色 id 或步骤 id, 这一步做什么]。不是角色的步骤（爪牙信息、恶魔信息）在 STEP_NAMES 里起名字。

export const STEP_NAMES = { minioninfo: '爪牙信息', demoninfo: '恶魔信息', seat7: '7 号空座' };

export const NIGHT_ORDER = {
  tb: {
    first: [
      ['minioninfo', '7 人及以上：爪牙睁眼互认，并得知谁是恶魔'],
      ['demoninfo', '7 人及以上：恶魔得知爪牙是谁，拿到 3 个不在场的善良角色当伪装'],
      ['poisoner', '选一人中毒（到明天黄昏）'],
      ['washerwoman', '得知两人之一是某个镇民'],
      ['librarian', '得知两人之一是某个外来者（或场上没有外来者）'],
      ['investigator', '得知两人之一是某个爪牙'],
      ['chef', '得知有几对相邻的邪恶玩家'],
      ['empath', '得知两侧存活邻座里有几个邪恶'],
      ['fortuneteller', '选两人，得知其中有没有恶魔'],
      ['butler', '选一个主人'],
      ['spy', '看魔典'],
    ],
    other: [
      ['poisoner', '选一人中毒'],
      ['monk', '选一人（不能选自己），今晚不会被恶魔杀死'],
      ['scarletwoman', '恶魔今天死了：她在这时成为新的恶魔'],
      ['imp', '选一人杀死；选自己就是自杀传位'],
      ['ravenkeeper', '今晚被杀才醒：选一人，得知他的角色'],
      ['empath', '得知两侧存活邻座里有几个邪恶（恶魔已经杀完人）'],
      ['fortuneteller', '选两人，得知其中有没有恶魔'],
      ['undertaker', '得知今天被处决的人的角色'],
      ['butler', '选一个主人'],
      ['spy', '看魔典'],
    ],
    why: [
      '投毒者、僧侣排在恶魔前面：中毒和保护当晚就生效。',
      '恶魔先杀人，信息角色后醒：被杀的信息角色当晚就不醒了；共情者数的是杀完人之后的邻座。',
      '守鸦人紧跟在恶魔后面：只有今晚被杀的守鸦人才会醒。',
    ],
  },
  bmr: {
    first: [
      ['minioninfo', '7 人及以上：爪牙睁眼互认，并得知谁是恶魔'],
      ['demoninfo', '7 人及以上：恶魔得知爪牙，拿 3 个伪装；疯子也以为自己在这一步'],
      ['sailor', '选一名存活玩家：你或他醉酒到明天黄昏'],
      ['courtier', '（每局一次）选一个角色：他醉酒三天三夜'],
      ['godfather', '得知场上有哪些外来者'],
      ['devilsadvocate', '选一名存活玩家：明天他被处决也不会死'],
      ['lunatic', '以为自己是普卡的疯子：像普卡一样选一人（没有效果，真恶魔会知道他选了谁）'],
      ['pukka', '选一人中毒（下一晚毒发死亡）'],
      ['grandmother', '得知一名善良玩家（孙子）和他的角色'],
      ['chambermaid', '选两人，得知今晚其中几人因自己的能力醒过'],
    ],
    other: [
      ['sailor', '选一名存活玩家：你或他醉酒'],
      ['innkeeper', '选两人：今晚不会死，其中一人醉酒'],
      ['courtier', '（每局一次）选一个角色：他醉酒三天三夜'],
      ['gambler', '选一人猜他的角色：猜错自己死'],
      ['devilsadvocate', '选一名存活玩家（和上一晚不同）：明天他被处决也不会死'],
      ['lunatic', '以为自己是恶魔，照着恶魔的样子选人（没有效果）；真恶魔会得知他选了谁'],
      ['exorcist', '选一人（和上一晚不同）：选中恶魔的话，恶魔今晚醒不来'],
      ['zombuul', '今天白天没人死才醒：选一人杀死'],
      ['pukka', '选一人中毒；上一个中毒的人死亡'],
      ['shabaloth', '选两人杀死；上一晚吃掉的人可能被吐回来'],
      ['po', '选一人杀死，或者不选（下一晚就选三人）'],
      ['assassin', '（每局一次）选一人：他死亡，无视一切保护'],
      ['godfather', '今天白天有外来者死了才醒：选一人杀死'],
      ['professor', '（每局一次）选一名死亡的玩家：是镇民就起死回生'],
      ['gossip', '今天的声明为真：今晚有一人死亡'],
      ['tinker', '可能在任何时候死亡（说书人决定）'],
      ['moonchild', '月之子白天公开选的人如果是善良的，今晚死亡'],
      ['chambermaid', '选两人，得知今晚其中几人因自己的能力醒过'],
    ],
    why: [
      '水手、旅店老板、侍臣排在最前面：醉酒和保护当晚就生效，能挡住后面的恶魔。',
      '疯子在恶魔之前：真恶魔要先知道疯子选了谁。驱魔人也在恶魔之前：选中恶魔，恶魔今晚就醒不来。',
      '杀人集中在中间（恶魔 → 刺客 → 教父 → 造谣者 → 修补匠 → 月之子），教授排在杀人之后，才救得回今晚死的人。',
      '侍女最后：等所有人都醒过，她数的才准。',
    ],
  },
  snv: {
    first: [
      ['philosopher', '（每局一次）选一个善良角色，获得它的能力'],
      ['minioninfo', '7 人及以上：爪牙睁眼互认，并得知谁是恶魔'],
      ['demoninfo', '7 人及以上：恶魔得知爪牙是谁，拿到 3 个不在场的善良角色当伪装'],
      ['snakecharmer', '选一名存活玩家：选中恶魔就互换角色和阵营'],
      ['eviltwin', '镜像双子和对立双子互相得知对方的角色'],
      ['witch', '选一名玩家：他明天发起提名就会死'],
      ['cerenovus', '选一名玩家和一个善良角色：他明天要疯狂证明自己是这个角色'],
      ['clockmaker', '得知恶魔和最近的爪牙相隔多远'],
      ['dreamer', '选一人，看到一善一恶两个角色，他是其中之一'],
      ['seamstress', '（每局一次）选两人，得知是不是同一阵营'],
      ['mathematician', '得知有几个人的能力没有正常生效'],
    ],
    other: [
      ['philosopher', '（每局一次）选一个善良角色，获得它的能力'],
      ['pithag', '选一名玩家和一个不在场的角色：他变成它'],
      ['snakecharmer', '选一名存活玩家：选中恶魔就互换角色和阵营'],
      ['witch', '选一名玩家：他明天发起提名就会死'],
      ['cerenovus', '选一名玩家和一个善良角色：他明天要疯狂证明自己是这个角色'],
      ['fanggu', '选一人杀死；第一个被杀的外来者改为变成方古，老方古死亡'],
      ['nodashii', '选一人杀死'],
      ['vortox', '选一人杀死'],
      ['vigormortis', '选一人杀死；被杀的爪牙保留能力，邻近一名镇民中毒'],
      ['barber', '理发师今天死了：恶魔可以交换两名玩家的角色'],
      ['sweetheart', '心上人死了：一名玩家从此醉酒'],
      ['sage', '被恶魔杀死才醒：得知两名玩家，其中一名是杀他的恶魔'],
      ['clockmaker', '刚得到这个能力的人才醒：得知恶魔和最近的爪牙相隔多远'],
      ['dreamer', '选一人，看到一善一恶两个角色，他是其中之一'],
      ['flowergirl', '得知今天白天有没有恶魔投过票'],
      ['towncrier', '得知今天白天有没有爪牙发起过提名'],
      ['oracle', '得知死亡的玩家里有几名邪恶'],
      ['seamstress', '（每局一次）选两人，得知是不是同一阵营'],
      ['juggler', '得知今天白天猜对了几个'],
      ['mathematician', '得知有几个人的能力没有正常生效'],
    ],
    why: [
      '哲学家最先：选完能力当晚就能用。麻脸巫婆在舞蛇人之前：她造出的爪牙当晚就能行动。',
      '恶魔之后才是理发师：恶魔这晚杀的如果是理发师，当晚就能换角色。',
      '信息角色都在杀人之后，数学家最后：等当晚所有能力都结算完，他数的才准。',
    ],
  },
};

// 两个小剧本（照官方夜晚顺序一览里这些角色的先后）。7 人以下没有爪牙信息和恶魔信息。
NIGHT_ORDER.ngj = {
  first: [
    ['investigator', '得知两人之一是某个爪牙'],
    ['empath', '得知两侧存活邻座里有几个邪恶'],
    ['clockmaker', '得知恶魔和最近的爪牙相隔多远'],
    ['chambermaid', '选两人，得知今晚其中几人因自己的能力醒过'],
  ],
  other: [
    ['scarletwoman', '恶魔今天死了：她在这时成为新的恶魔'],
    ['imp', '选一人杀死；选自己就是自杀传位'],
    ['sage', '被恶魔杀死才醒：得知两名玩家，其中一名是杀他的恶魔'],
    ['empath', '得知两侧存活邻座里有几个邪恶'],
    ['chambermaid', '选两人，得知今晚其中几人因自己的能力醒过'],
  ],
  why: [
    '人少（5–6 人），没有爪牙信息和恶魔信息：恶魔不知道谁是爪牙，爪牙也不知道谁是恶魔。',
    '恶魔先杀人，信息角色后醒；侍女最后，等所有人都醒过她数的才准。',
  ],
};
NIGHT_ORDER.luf = {
  first: [
    ['amnesiac', '按说书人给他定的能力，在那个能力该醒的时候醒（他自己不知道是什么能力）'],
    ['widow', '看魔典，选一人中毒；之后一名善良玩家得知寡妇在场'],
    ['balloonist', '得知一名玩家'],
  ],
  other: [
    ['amnesiac', '按说书人给他定的能力，在那个能力该醒的时候醒'],
    ['cannibal', '有了被处决的人的能力：在那个能力该醒的时候醒（他自己不知道是什么能力）'],
    ['balloonist', '得知一名玩家，和上一晚得知的人角色类型不同'],
  ],
  why: [
    '利维坦不杀人：夜里没有人死，一切都靠白天的处决。',
    '寡妇最先，她下的毒当晚就让信息出错。失忆者和食人族的能力是隐藏的，按那个能力的顺序醒。',
    '天亮时说书人宣布「利维坦在场，现在是第几天」。',
  ],
};

// 诸神黄昏（娱乐模式）：只有猎手和小恶魔
NIGHT_ORDER.rag = {
  first: [['minioninfo', '狼人睁眼互认（人少也认）']],
  other: [['imp', '每只狼人各选一个人杀死；选自己就是自杀（没有爪牙接任）']],
  why: ['猎手没有夜里的能力；白天每人可以开一枪，打中狼人，狼人就死。', '狼人全死好人赢；存活的狼人追平好人，狼人赢。'],
};

// 七步成诗（2025 剧本世界杯冠军）：按官方剧本页的夜晚顺序
NIGHT_ORDER.bs7 = {
  first: [
    ['seat7', '7 号座位没有人坐：轮到它的角色时，由说书人替它选'],
    ['boffin', '恶魔和科学怪人得知恶魔拿到了哪个不在场的善良角色的能力'],
    ['minioninfo', '7 人及以上：爪牙互认、得知恶魔；有魔术师时爪牙会看到两个「恶魔」'],
    ['demoninfo', '7 人及以上：恶魔得知爪牙（魔术师也混在里面）和 3 个伪装'],
    ['harpy', '选两人：明天第一人要疯狂地证明第二人是邪恶的'],
    ['pukka', '选一人中毒'],
    ['damsel', '爪牙得知落难少女在场（人少也告诉）'],
    ['librarian', '得知两人之一是某个外来者（或场上没有外来者）'],
    ['dreamer', '选一人，得知一善一恶两个角色，其中一个是他的'],
    ['seamstress', '每局一次：选两人，得知是不是同一阵营'],
    ['noble', '得知三人，其中恰好一人是邪恶的'],
    ['balloonist', '得知一名玩家'],
    ['shugenja', '得知最近的邪恶玩家在顺时针还是逆时针'],
    ['villageidiot', '每个村夫各选一人，得知他的阵营'],
  ],
  other: [
    ['innkeeper', '选两人：今晚不会死，其中一人醉酒到明天黄昏'],
    ['harpy', '选两人：明天第一人要疯狂地证明第二人是邪恶的'],
    ['scarletwoman', '恶魔今天死了：她在这时成为新的恶魔'],
    ['imp', '选一人杀死；选自己就是自杀传位'],
    ['pukka', '选一人中毒；上一个被毒的人死亡并恢复健康'],
    ['vigormortis', '选一人杀死；杀死的爪牙保留能力'],
    ['farmer', '农夫今晚死了：一名存活的善良玩家醒来，变成农夫'],
    ['dreamer', '选一人，得知一善一恶两个角色'],
    ['oracle', '得知死人里有几个邪恶'],
    ['seamstress', '每局一次：选两人，得知是不是同一阵营'],
    ['balloonist', '得知一名玩家，和上一晚得知的人角色类型不同'],
    ['villageidiot', '每个村夫各选一人，得知他的阵营'],
  ],
  why: [
    '灯神规则：7 号座位不由玩家入座，仍然发角色；它每晚的选择、白天唯一一次发言（公开或私下，可以说谎、可以提名），都由说书人替它决定。',
    '旅店老板最先：他保护的人当晚谁也杀不死。恶魔之后才是信息，数到的死人才准。',
    '鹰身女妖的疯狂到她下一次选人为止；没疯狂证明的话，说书人可以白天杀死其中一人或两人。',
  ],
};

/**
 * 小剧本的结算步骤（engine/snv.js 用）：这套引擎认得的所有角色按官方总表排好；不在场的步骤自动跳过。
 * 失忆者、食人族拿到的能力也按这张表的位置醒。
 */
export const MIX_STEPS = {
  first: ['philosopher', 'sailor', 'courtier', 'poisoner', 'widow', 'godfatherInfo', 'devilsadvocate', 'snakecharmer', 'eviltwin', 'witch', 'cerenovus', 'harpy', 'pukka', 'grandmother',
    'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'clockmaker', 'dreamer', 'amn_detect', 'seamstress', 'noble', 'balloonist', 'shugenja', 'villageidiot',
    'butler', 'chambermaid', 'mathematician', 'spy'],
  other: ['philosopher', 'sailor', 'innkeeper', 'courtier', 'gambler', 'poisoner', 'monk', 'devilsadvocate', 'exorcist', 'pithag', 'snakecharmer', 'witch', 'cerenovus', 'harpy',
    'zombuul', 'imp', 'fanggu', 'nodashii', 'vortox', 'vigormortis', 'pukka', 'shabaloth', 'po', 'assassin', 'godfather',
    'barber', 'sweetheart', 'sage', 'farmer', 'professor', 'gossip', 'tinker', 'moonchild', 'ravenkeeper', 'clockmaker', 'empath', 'fortuneteller', 'undertaker', 'dreamer', 'amn_detect', 'amn_echo', 'flowergirl', 'towncrier', 'oracle', 'seamstress',
    'juggler', 'balloonist', 'villageidiot', 'butler', 'chambermaid', 'mathematician', 'spy'],
};

/** 黯月初升的结算步骤（engine/bmr.js 用）：去掉不是角色的信息步骤；教父首夜那一步是"得知外来者"。 */
export const BMR_STEPS = {
  first: NIGHT_ORDER.bmr.first.map(([id]) => id).filter((id) => !STEP_NAMES[id]).map((id) => (id === 'godfather' ? 'godfatherInfo' : id)),
  other: NIGHT_ORDER.bmr.other.map(([id]) => id),
};

/** 梦殒春宵的结算步骤（engine/snv.js 用）。 */
export const SNV_STEPS = {
  first: NIGHT_ORDER.snv.first.map(([id]) => id).filter((id) => !STEP_NAMES[id]),
  other: NIGHT_ORDER.snv.other.map(([id]) => id),
};
