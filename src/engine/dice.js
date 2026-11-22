// 说书人的骰子：判定不写死，掷一次，各种情况给加减值。所有数字都在这一张表里，以后用真实对局的数据调的就是它。
//
// base 是什么都不看时的概率，其余每一项是一条加减值：情况的值 × 这里的数。
// 点数加在对数几率上（不是直接加概率），所以 90% 再加多少也到不了 100%。
// 概率永远留在 5%–95%：一件事总发生或总不发生，就没有数据能告诉我们换个做法会怎样。
//
// 表里没写的情况权重是 0：照样记进决策日志，但不影响结果（影子信号）。
// 先看它有没有用，再给它权重，玩家标记就是这样。
//
// 疯狂判定（mutant、madness）故意没有 balance：疯狂处决算当天的处决，能决定涡流局今天有没有处决，不能看谁领先。
export const MIN_PROB = 0.05;
export const MAX_PROB = 0.95;

const OFFLINE = -2.5; // 掉线的人没法证明自己
const ROOKIE = -0.7;  // 战绩里打过的局很少（被房主标成新手的不重复算，看 Room.signals）
const VETERAN = 0.4;  // 老手从严

/** 要不要做：掷一次。 */
export const DICE = {
  misregister: { base: 0.6, balance: 1.3 },        // 陌客页「你通常会被当作邪恶玩家」、间谍页「通常是说书人在说谎」（11-18 照百科从 0.3 提到 0.6）         // 两种错误登记都帮邪恶：善良领先时多发生
  mayorBounce: { base: 0.85, balance: -1.0 },      // 镇长页「我们建议你让镇长活到最后一天」（11-18 从 0.5 提到 0.85）        // 替死保护镇长，帮善良：善良领先时少替
  mayorBounceMinion: { base: 0.5 },                 // 邪恶大优时让爪牙替死
  deadLies: { base: 0.5, balance: 1 },
  // 官方《给说书人的建议》：邪恶碾压时「你可以在一些夜晚给一名酒鬼共情者提供正确的信息」。只在邪恶明显领先时掷（storyteller.drunkTruth）
  drunkTruth: { base: 0.25, balance: -1 },              // 房规：死了还拿信息，这次给假的
  pacifist: { base: 0.45, balance: -1.5, used: -0.9 }, // 每局别救太多次
  shabaloth: { base: 0.25, balance: -1.4 },
  // 修补匠：官方百科建议死在能制造混乱的夜里——恶魔被驱魔人挡住时假装恶魔还在杀、多死一个让人以为是沙巴洛斯 / 珀。
  // 用户 2026-11-09：当晚死人多、大家猜的恶魔不一致、白天有人造谣时都多死一点。base 从 0.12 降到 0.08，
  // 大多数夜里本来就有一个人死（crowd=1 → 约 15%），平均下来和原来差不多，只是死在更乱的夜里
  tinker: { base: 0.08, balance: 1.1, crowd: 0.7, blocked: 1.2, gossip: 0.8, demonSplit: 0.8 },
  // 水手选了镇民：官方惯例让那个镇民醉，「通常」而已。用户 2026-11-09 要 10% 反过来让水手自己醉（当晚可能被杀，更刺激）；
  // 邪恶领先时 storyteller.sailorDrunk 不掷
  sailorFlip: { base: 0.1, balance: 1.0 },
  ftSelfHerring: { base: 0.35 },                    // 5–6 人局占卜师自己当红鲱鱼（官方占卜师页的小局建议）
  // 官方村夫页：「说书人仍然有可能向醉酒的村夫提供正确信息，以防止村夫的能力过于强大」。邪恶领先时多给一点（storyteller.idiotTruth）
  idiotTruth: { base: 0.25, balance: -0.8 },
  // 官方贵族页：「说书人很可能向你展示了一名爪牙玩家而非恶魔玩家」。善良落后时才多放出恶魔
  nobleMinion: { base: 0.85, balance: 1.0 },
  // 官方贤者页：最后一夜「可以指向一名存活玩家和一名已死亡的玩家」，前期指两个活人给邪恶留机会。
  // 健康时等于直接点出恶魔，善良落后时多给；失效时等于把善良往错的人身上推，反过来掷（storyteller.sagePair）
  sageDead: { base: 0.5, balance: -1.5 },
  // 官方博学者页：「避免提供恶魔是谁这种信息，否则可能导致游戏快速结束」。善良明显落后时才偶尔放开（storyteller.savantFacts）
  savantDemon: { base: 0.2, balance: -1.5 },
  // 2026-11-20 用户：夜半狂欢那局信息指向性太强，第二天就把恶魔打出去了。
  // 博学者的真话把邪恶圈到一两个人里（「死了 1 个人，死者里有 1 名邪恶」「X 是邪恶的」）：善良落后时才多给
  savantSharp: { base: 0.25, balance: -1.5 },
  // 能力正常的气球驾驶员看到恶魔：善良领先、前两晚少给（还有外来者、爪牙可以给）
  balloonDemon: { base: 0.5, balance: -1.5, early: -0.8 },
  mathFar: { base: 0.5 },                           // 涡流下数学家的数字离真相远一点（官方范例：六人异常，得知 3）
  boffinProof: { base: 0.75 },                      // 官方科学怪人页：「说书人通常会给恶魔一个可验证的能力」。开局定，不看局势
  // 官方麻脸巫婆页范例：最后一夜造出善良恶魔，「说书人只杀死了邪恶的恶魔」。善良落后时多照做（storyteller.pitPlan）
  pitOldDies: { base: 0.5, balance: -1.5 },
  // 官方麻脸巫婆页：造出恶魔那晚「你能在当晚杀死任意数量的玩家或阻止被恶魔攻击的玩家死亡来平衡游戏」。只在局势一边倒时掷
  pitBalance: { base: 0.5 },
  // 官方旅店老板页：醉的那个「可以是善良的或邪恶的，但几乎总会是善良的，这取决于你的游戏走向」。两人里有邪恶时掷（storyteller.innkeeperDrunk）
  innkeeperEvil: { base: 0.1, balance: -1.5 },
  gossipEvil: { base: 0.5 },
  // 牙噶巴卜（2026-11-22）：白天每说一次暗号，当晚「可能」死一人（官方：说书人可以少杀）。善良领先时多杀
  yaggKill: { base: 0.8, balance: 1.2 },
  // 军团（2026-11-23）：军团还多时多半杀军团，善良领先时偶尔杀善良（官方：杀善良通常不公平）
  legionKillGood: { base: 0.15, balance: 1.5 },
  // 诡诈杰克：黄昏两位说书人互换（整局一次）。善良领先、越往后越可能（官方：通常在善良开始弄清谁说真话时）
  knavesSwap: { base: 0.12, balance: 1.5, late: 1.2 },
  sweetheartEvil: { base: 0.5 },
  dreamerSeen: { base: 0.85 },                      // 官方：邪恶项几乎都用在场爪牙
  savantTrue: { base: 0.5 },
  balloonSame: { base: 0.7 },                       // 失效的气球驾驶员看到同类型的人（信息链断了才看得出是假的）
  // 骗人精（传奇角色，裁缝与暴乱）：每局一次，一名善良玩家可能得到错误信息。帮邪恶：善良领先时多发生
  fibbin: { base: 0.2, balance: 1.2 },
  // 旅行者的阵营（官方：大多数是善良；一名可以是邪恶，三名以上才考虑更多）。善良领先时多给邪恶；已经有邪恶旅行者就少给
  travellerEvil: { base: 0.2, balance: 1.2, evilTravellers: -2.5 },
  // 替罪羊：同阵营的人被处决，说书人决定他替不替（官方「可能」）。不看局势
  // 替罪羊页：邪恶替罪羊「几乎总是会等到恶魔被处决的时候」（被处决的是恶魔时约九成替死），善良的留到中后期
  scapegoat: { base: 0.15, demon: 3.6, late: 1.2 },
  harlotDeath: { base: 0.3 }, // 流莺：同意以后两人一起死的机会（官方：说书人选最有趣、最平衡的做法）
  priestessGood: { base: 0.75 },                    // 善良落后：女祭司多被指向拿着真信息的善良玩家
  priestessEvil: { base: 0.5 },                     // 善良领先：女祭司常被指向一个邪恶玩家（听他满嘴假话）
  goblinClaim: { base: 0.6 },                       // 机器人哥布林被提名时声明身份
  librarianNone: { base: 0.25 },                    // 失效的图书管理员被告知「没有外来者」（其实有）
  harpyKill: { base: 0.6, evil: -1.5, newbie: -1.5, rookie: ROOKIE }, // 鹰身女妖的疯狂没做到：杀人（"可能"死亡，别靠这个让邪恶自己送分）
  harpyBoth: { base: 0.25, balance: 1.5 },          // 两个都杀：善良领先时更常
  seat7Speak: { base: 0.35, nominated: 1.5, late: 1.2 }, // 7 号座位今天用掉唯一一次发言：被提名时、局势到后半段时更想说
  seat7Lie: { base: 0.5 },                          // 善良的 7 号座位也可以说谎：这里只给邪恶用，善良都说真话
  mutant: { base: 0.85, newbie: -2.1, rookie: ROOKIE, veteran: VETERAN, offline: OFFLINE, voice: -0.7 }, // voice：转写可能听错，比公开声明轻
  madness: {
    base: 0.75, evil: -1.5, newbie: -1.5, rookie: ROOKIE, veteran: VETERAN, offline: OFFLINE,
    heardFalse: 0.8,  // 听到了，大模型判定他没努力
    silent: 0.3,      // 有人在听，他一句没说
    blind: -0.4,      // 没人在听：除了没公开声明，什么依据都没有
    noMic: 0.7,       // 要他开收音，他没开
    claimed: -1,      // 没开收音，但至少公开声明了
    broke: 1.5,       // 警告过了，又说漏嘴
    tacit: 1.2,       // 默许：别人说他被洗脑 / 跳了他的角色，提醒过了还是没站出来否认（2026-11-20）
  },
};

/** 挑谁：每个候选一个分数，分数高的更容易被抽中。 */
export const DRAW = {
  // hits 最多算 2 次（共 -1）：比 newbie 轻，老手被挑得再多也不会轮到新手更容易被挑
  redHerring: { newbie: -1 },                 // 新手被红鲱鱼坑了很难自己想明白
  mayorVictim: { newbie: -2, hits: -0.5 },
  gossipVictim: { hits: -0.5 },
  puzzleDrunk: { newbie: -1 },                 // 解谜大师弄醉谁：新手少挨（醉了自己不知道）
  legionVictim: { hits: -0.5 },
  yaggVictim: { hits: -0.5, trusted: 1.2, info: 0.6, suspected: -1, newbie: -1 }, // 牙噶巴卜：照聪明的恶魔挑（杀被信任的、报了信息的，留被怀疑的）
  doomVictim: { hits: -0.5, newbie: -1.5, self: 0.3 },        // 末日预言者：说书人挑同阵营的谁死（能不挑新手就不挑）               // 新手在 gossipVictim() 里直接排除，这个人会死
  sweetheartDrunk: { newbie: -2, hits: -0.5 },
  innkeeperDrunk: { newbie: -2, hits: -0.5 },
  starpassHeir: { heat: -2 },                 // 被怀疑最少的最值得接任
  vigSide: { pressure: 1.5 },                 // 善良领先毒拿信息的，邪恶领先毒不拿信息的
  // 新手接农夫：多一个有能力的活人，不受罪。lift：接班对善良的好处 ×（-局势），官方农夫页：
  // 接班的是外来者说明说书人在帮善良，是能力已经用掉的人说明势均力敌，是强力角色说明善良快赢了
  farmerHeir: { newbie: 0.5, lift: 1.5 },
  boomSurvivor: { pressure: 1.5 },            // 炸弹人引爆后留谁：往落后的一方偏（善良落后多留善良）
  shugenjaTie: { pressure: 1.5 },            // 修行者两边一样近：善良落后多指恶魔那一侧，领先多指爪牙那一侧（官方：说书人决定）
  pitVictim: { newbie: -2, hits: -0.5 },      // 麻脸巫婆那晚说书人多杀的人：别总挑新手、同一个人
  // 无神论者局（2026-11-19 用户：要胜过真人说书人）：假恶魔照聪明的真恶魔杀人。
  // 杀大家信任的、在指认假恶魔的、在报信息的；留着被怀疑的人背锅；在推「处决说书人」的人真邪恶最想留着，基本不杀
  atheistKill: { trusted: 1.5, accuser: 1.4, info: 0.7, suspected: -2, stVoice: -3, newbie: -1, hits: -0.5 },
  // 假恶魔被处决后挑下一个「恶魔」：大家越不怀疑越像藏得好的恶魔，故事才能接着讲
  atheistDemon: { suspected: -1.5, trusted: -0.5 },
  // 小怪宝（夜半狂欢的恶魔开关）：说书人替恶魔杀人，和聪明的恶魔一样挑；爪牙没定照看的人时，说书人挑最不被怀疑的，多半不换人
  monstaKill: { trusted: 1.2, accuser: 1.2, info: 0.6, suspected: -1, newbie: -1, hits: -0.5 },
  monstaSitter: { suspected: -2, keep: 0.7 },
};

const logit = (p) => Math.log(p / (1 - p));
const squash = (x) => 1 / (1 + Math.exp(-x));
const asNumber = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0);

/** 这些情况下，这个判定的概率。 */
export function chanceOf(kind, features = {}) {
  const w = DICE[kind];
  if (!w) throw new Error(`骰子表里没有 ${kind}`);
  let x = logit(w.base);
  for (const [name, v] of Object.entries(features)) if (name !== 'base' && w[name]) x += w[name] * asNumber(v);
  return Math.min(MAX_PROB, Math.max(MIN_PROB, squash(x)));
}

/** 候选的概率：分数差 1 大约是 2.7 倍的机会。候选少于两个时不用抽。 */
export function drawOdds(kind, list) {
  const w = DRAW[kind];
  if (!w) throw new Error(`骰子表里没有 ${kind}`);
  const score = (features) => Object.entries(features).reduce((s, [name, v]) => s + (w[name] ?? 0) * asNumber(v), 0);
  const odds = list.map((features) => Math.exp(score(features)));
  const total = odds.reduce((a, b) => a + b, 0);
  return odds.map((v) => v / total);
}
