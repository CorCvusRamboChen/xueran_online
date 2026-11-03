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
  misregister: { base: 0.3, balance: 1.3 },         // 两种错误登记都帮邪恶：善良领先时多发生
  mayorBounce: { base: 0.5, balance: -1.7 },        // 替死保护镇长，帮善良：善良领先时少替
  mayorBounceMinion: { base: 0.5 },                 // 邪恶大优时让爪牙替死
  deadLies: { base: 0.5, balance: 1 },              // 房规：死了还拿信息，这次给假的
  pacifist: { base: 0.45, balance: -1.5, used: -0.9 }, // 每局别救太多次
  shabaloth: { base: 0.25, balance: -1.4 },
  tinker: { base: 0.12, balance: 1.1 },
  gossipEvil: { base: 0.5 },
  sweetheartEvil: { base: 0.5 },
  dreamerSeen: { base: 0.85 },                      // 官方：邪恶项几乎都用在场爪牙
  savantTrue: { base: 0.5 },
  balloonSame: { base: 0.7 },                       // 失效的气球驾驶员看到同类型的人（信息链断了才看得出是假的）
  fishStrong: { base: 0.3, balance: -2 },           // 渔夫的建议直指恶魔：善良落后时多给
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
  },
};

/** 挑谁：每个候选一个分数，分数高的更容易被抽中。 */
export const DRAW = {
  // hits 最多算 2 次（共 -1）：比 newbie 轻，老手被挑得再多也不会轮到新手更容易被挑
  redHerring: { newbie: -1 },                 // 新手被红鲱鱼坑了很难自己想明白
  mayorVictim: { newbie: -2, hits: -0.5 },
  gossipVictim: { hits: -0.5 },               // 新手在 gossipVictim() 里直接排除，这个人会死
  sweetheartDrunk: { newbie: -2, hits: -0.5 },
  innkeeperDrunk: { newbie: -2, hits: -0.5 },
  starpassHeir: { heat: -2 },                 // 被怀疑最少的最值得接任
  vigSide: { pressure: 1.5 },                 // 善良领先毒拿信息的，邪恶领先毒不拿信息的
  farmerHeir: { newbie: 0.5 },                // 新手接农夫：多一个有能力的活人，不受罪
  boomSurvivor: { pressure: 1.5 },            // 炸弹人引爆后留谁：往落后的一方偏（善良落后多留善良）
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
