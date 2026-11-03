// 血染钟楼 · 梦殒春宵（Sects & Violets）的规则。作为方法混进 Game（game.js 在 engine === 'snv' 时调用这里）。
// 规则口径见 .claude/skills/botc-storyteller/references/sects-and-violets.md。
// 两个官方小剧本《无上愉悦》《窃窃私语》也用这套（见 roles.js 的 SCRIPTS）：它们从三个剧本里挑角色，
// 借来的暗流涌动、黯月初升角色（调查员、共情者、侍女、酒鬼、红唇女郎、男爵、小恶魔、疯子）和新角色都写在这里。
// 口径见 references/teensy.md。
//
// 状态模型：
// · 角色和能力分开：p.role 是真实角色，abilityOf(p) 是他现在用的能力（哲学家获得能力后 p.gained 记着是谁的）。
// · 阵营 p.evil 单独记：舞蛇人、方古会换阵营；麻脸巫婆、理发师换角色不换阵营（所以会有善良的恶魔、邪恶的镇民）。
// · 醉酒/中毒/诅咒是"效果" this.fx：{ kind, target, source, until, why }，和黯月初升一样，来源死了或失效了效果就停。
//   source 为 null 的效果不看来源（舞蛇人的毒、心上人的醉酒）。诺-达鲺和亡骨魔的毒不存，每次按座位现算（座位和角色一变就跟着变）。
// · this.abnormal：从上个黎明到现在能力没有正常生效的人（数学家用），在 flag() 里记。
// · 夜里角色会变：舞蛇人换了恶魔、麻脸巫婆造了爪牙、理发师换了角色，新角色当晚还轮得到就要现选。
//   结算停在这一步，返回 { pause: 他的 id }，选完再调一次 resolveNight() 接着走（this.midNight 记着停在哪）。

import { ROLES, rolesOf, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, isEvilRole, SCRIPTS, inScript, playersOf } from './roles.js';
import { SNV_STEPS, MIX_STEPS } from '../shared/nightOrder.js';

const team = (p) => ROLES[p.role].team;
const shuffle = (arr, rng) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (arr, n, rng) => shuffle(arr, rng).slice(0, n);
const pickOne = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const listsOf = (script) => ({ tf: rolesOf(script, 'townsfolk'), out: rolesOf(script, 'outsider'), min: rolesOf(script, 'minion'), dem: rolesOf(script, 'demon') });
const T = listsOf('snv');
const goodOf = (script) => { const l = listsOf(script); return [...l.tf, ...l.out]; };
/**
 * 失忆者的隐藏能力从这里挑：这套引擎能结算的镇民能力（官方：可以是任何现有能力，最好慢慢猜得出来）。不在场的优先。
 * · 夜里有动静的：醒来拿到裸的结果，慢慢猜。调查员、钟表匠只有首夜一条，女裁缝每局一次，难猜一点。
 * · 白天要自己去用的（猎手的枪、博学者、艺术家、渔夫）：猜到「完美」以后行动面板才出现对应的按钮（AMNESIAC_DAY）。
 * 不放被动的（贤者、士兵）和会换角色的（舞蛇人、哲学家）。
 */
export const AMNESIAC_POOL = ['empath', 'dreamer', 'chambermaid', 'flowergirl', 'towncrier', 'oracle', 'mathematician', 'investigator', 'clockmaker', 'seamstress', 'balloonist',
  'slayer', 'savant', 'artist', 'fisherman',
  'amn_gun', 'amn_judge', 'amn_pardon', 'amn_detect', 'amn_echo']; // 最后一行是失忆者专用的原创变种（roles.js 的 AMNESIAC_ONLY）
export const AMNESIAC_DAY = new Set(['slayer', 'savant', 'artist', 'fisherman', 'amn_gun', 'amn_judge', 'amn_pardon']);
/** 开枪类能力：打中什么人才会死。 */
const GUNS = { slayer: 'demon', amn_gun: 'anyone', amn_judge: 'evil' };
const JUGGLES = 5;
export const MAX_DECLARES = 2; // 每人每天公开声明几次（免得刷屏）

/** 恶魔的 3 个伪装：官方说"三个不在场的善良角色"；外来者在这个剧本里常常要藏，伪装以镇民为主。 */
export function pickBluffsSNV(exclude, rng, script = 'snv') {
  const L = listsOf(script);
  const tf = shuffle(L.tf.filter((r) => !exclude.has(r)), rng);
  const out = shuffle(L.out.filter((r) => !exclude.has(r)), rng);
  const k = out.length && rng() < 0.35 ? 1 : 0;
  const pick = [...tf.slice(0, 3 - k), ...out.slice(0, k)];
  if (pick.length < 3) pick.push(...out.slice(k, k + 3 - pick.length));
  return shuffle(pick, rng);
}

/** 这个恶魔让人数表怎么变（方古 +1 外来者，亡骨魔 -1 外来者）。 */
export function demonShift(demon, t, o) {
  if (demon === 'fanggu') return [t - 1, o + 1];
  if (demon === 'vigormortis' && o > 0) return [t + 1, o - 1];
  return [t, o];
}

/** 按人数随机出一套角色。exclude：这些角色不出。 */
export function rollSNV(n, rng, { exclude = null } = {}) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`人数需在 ${MIN_PLAYERS}–${MAX_PLAYERS} 之间`);
  const ok = (r) => !exclude?.has(r);
  const [t0, o0, m] = DISTRIBUTION[n];
  const demon = pickOne(T.dem.filter(ok), rng);
  const [t, o] = demonShift(demon, t0, o0);
  return shuffle([...sample(T.tf.filter(ok), t, rng), ...sample(T.out.filter(ok), o, rng), ...sample(T.min.filter(ok), m, rng), demon], rng);
}

/**
 * 小剧本（5–6 人）随机出一套。官方：男爵通常加两个外来者，但这两个剧本只有两个外来者，已有一个时只加一个；
 * 气球驾驶员在场时说书人可以多放一个外来者（这里一半一半）。
 */
export function rollTeensy(script, n, rng, { exclude = null } = {}) {
  const [lo, hi] = playersOf(script);
  if (n < lo || n > hi) throw new Error(`《${SCRIPTS[script].name}》是 ${lo}–${hi} 人的小剧本`);
  const ok = (r) => !exclude?.has(r);
  const L = listsOf(script);
  let [t, o, m] = DISTRIBUTION[n];
  const out = L.out.filter(ok);
  const minions = sample(L.min.filter(ok), m, rng);
  const demon = pickOne(L.dem.filter(ok), rng);
  if (minions.includes('baron')) { const add = Math.max(0, Math.min(2, out.length - o)); t -= add; o += add; }
  let towns = sample(L.tf.filter(ok), t, rng);
  if (towns.includes('balloonist') && o < out.length && rng() < 0.5) {
    const drop = pickOne(towns.filter((r) => r !== 'balloonist'), rng);
    towns = towns.filter((r) => r !== drop); o += 1;
  }
  return shuffle([...towns, ...sample(out, o, rng), ...minions, demon], rng);
}

/**
 * 自选角色的大剧本（七步成诗这种从各剧本挑角色的）按人数随机出一套。人数表照标准的，再按场上角色调：
 * 男爵 +2 外来者（外来者不够就少加），亡骨魔 -1、方古 +1 外来者，气球驾驶员一半一半 +1 外来者，
 * 村夫再把 0–2 个别的镇民换成村夫（官方：可以有多个村夫，有多个时其中一个醉酒，见 setupSNV）。
 */
export function rollMixed(script, n, rng, { exclude = null } = {}) {
  const ok = (r) => !exclude?.has(r);
  const L = listsOf(script);
  let [t, o, m] = DISTRIBUTION[n];
  const out = L.out.filter(ok);
  const minions = sample(L.min.filter(ok), m, rng);
  const demon = pickOne(L.dem.filter(ok), rng);
  if (minions.includes('baron')) { const add = Math.max(0, Math.min(2, out.length - o)); t -= add; o += add; }
  if (minions.includes('godfather')) { if (o === 0 || (o < out.length && rng() < 0.5)) { t -= 1; o += 1; } else { t += 1; o -= 1; } }
  [t, o] = demonShift(demon, t, o);
  if (o > out.length) { t += o - out.length; o = out.length; }
  let towns = sample(L.tf.filter(ok), t, rng);
  if (towns.includes('balloonist') && o < out.length && rng() < 0.5) {
    const drop = pickOne(towns.filter((r) => r !== 'balloonist'), rng);
    towns = towns.filter((r) => r !== drop); o += 1;
  }
  if (towns.includes('villageidiot')) {
    const extra = Math.min(Math.floor(rng() * 3), towns.length - 1);
    const swap = sample(towns.filter((r) => r !== 'villageidiot'), extra, rng);
    towns = [...towns.filter((r) => !swap.includes(r)), ...swap.map(() => 'villageidiot')];
  }
  return shuffle([...towns, ...sample(out, o, rng), ...minions, demon], rng);
}

/**
 * 科学怪人能给恶魔的能力：不在场的善良角色，而且是这套引擎能结算、恶魔不用再多醒一次去选人的（我们的夜里每人只有一个选人面板）。
 * 官方能给任何不在场的善良角色（不能给酒鬼等几个），这里只挑被动的和自动拿信息的。
 */
export const BOFFIN_POOL = ['empath', 'oracle', 'noble', 'shugenja', 'librarian', 'washerwoman', 'investigator', 'chef', 'balloonist', 'undertaker',
  'clockmaker', 'flowergirl', 'towncrier', 'mathematician', 'soldier', 'mayor', 'slayer', 'savant', 'fisherman'];

// ───────────── AI 配板 ─────────────
// 分数是经验估计（官方没有公式）：正数对善良有利，负数对邪恶有利，只用来比较同人数的几套配板。
const DEMON_W = { vortox: 3.0, nodashii: 2.6, vigormortis: 2.4, fanggu: 2.2, imp: 2.3, pukka: 2.0 };
const MINION_W = { pithag: 1.8, witch: 1.8, eviltwin: 1.6, cerenovus: 1.4, harpy: 1.5, boffin: 1.4, boomdandy: 1.0, scarletwoman: 1.2, baron: 0.8 };
const GOOD_W = {
  clockmaker: 0.7, dreamer: 1.4, snakecharmer: 1.2, mathematician: 1.0, flowergirl: 1.1, towncrier: 1.1, oracle: 1.1,
  savant: 1.3, seamstress: 1.0, philosopher: 1.3, artist: 1.2, juggler: 0.9, sage: 0.6,
  mutant: -0.4, sweetheart: -0.6, barber: -0.4, klutz: -0.5,
  noble: 1.0, librarian: 0.8, shugenja: 0.7, balloonist: 0.9, villageidiot: 1.0, innkeeper: 1.3, fisherman: 0.8, farmer: 0.6, virgin: 0.8, magician: 0.7,
  drunk: -0.5, recluse: -0.3, saint: -0.6, damsel: -0.8,
};
const NIGHT_INFO = ['dreamer', 'flowergirl', 'towncrier', 'oracle', 'mathematician'];

/** 一套配板的平衡分：善良减邪恶；每晚拿信息的镇民越多，涡流越值钱。 */
export function setupScoreSNV(roles) {
  let good = 0; let evil = 0;
  for (const r of roles) { good += GOOD_W[r] ?? 0; evil += MINION_W[r] ?? DEMON_W[r] ?? 0; }
  if (roles.includes('vortox')) evil += 0.15 * roles.filter((r) => NIGHT_INFO.includes(r)).length;
  return Math.round((good - evil) * 100) / 100;
}

/** AI 说书人配板：随机出 tries 套，按平衡分排好，去掉两头最偏的，从中间那段里随机挑一套。 */
export function balancedSNV(n, rng, { tries = 60 } = {}) {
  const cands = Array.from({ length: tries }, () => rollSNV(n, rng)).map((roles) => ({ roles, s: setupScoreSNV(roles) })).sort((a, b) => a.s - b.s);
  const lo = Math.floor(tries * 0.3); const hi = Math.max(lo + 1, Math.ceil(tries * 0.7));
  return cands[lo + Math.floor(rng() * (hi - lo))].roles;
}
/** 自选角色的大剧本的 AI 配板，同上。 */
export function balancedMixed(script, n, rng, { tries = 60 } = {}) {
  const cands = Array.from({ length: tries }, () => rollMixed(script, n, rng)).map((roles) => ({ roles, s: setupScoreSNV(roles) })).sort((a, b) => a.s - b.s);
  const lo = Math.floor(tries * 0.3); const hi = Math.max(lo + 1, Math.ceil(tries * 0.7));
  return cands[lo + Math.floor(rng() * (hi - lo))].roles;
}

export const SNV_METHODS = {
  // ───────────────────────── 开局 ─────────────────────────
  setupSNV(players, roles, rng) {
    const S = SCRIPTS[this.script];
    const assigned = roles ?? (S.teensy ? rollTeensy(this.script, players.length, rng) : S.roles ? balancedMixed(this.script, players.length, rng) : balancedSNV(players.length, rng));
    if (assigned.length !== players.length) throw new Error('角色数量与玩家数量不符');
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, seat: i + 1, role: assigned[i], shownRole: assigned[i],
      alive: true, ghostVote: true, evil: isEvilRole(assigned[i]), gained: null, gainedFake: false, kept: false,
    }));
    const inPlay = new Set(assigned);
    // 酒鬼以为自己是一个不在场的镇民；疯子以为自己是这个剧本的恶魔；失忆者的能力说书人定（他自己不知道）
    const L = listsOf(this.script);
    for (const p of this.players) {
      if (p.role === 'drunk') p.shownRole = pickOne(L.tf.filter((r) => !inPlay.has(r)), rng);
      if (p.role === 'lunatic') p.shownRole = pickOne(L.dem, rng);
      if (p.role === 'amnesiac') { const free = AMNESIAC_POOL.filter((r) => !inPlay.has(r)); p.gained = pickOne(free.length ? free : AMNESIAC_POOL, rng); }
    }
    this.bluffs = pickBluffsSNV(new Set([...inPlay, ...this.players.map((p) => p.shownRole)]), rng, this.script);
    this.fx = [];
    this.used = {};            // 每局一次的能力用过了：id → true（女裁缝、哲学家、艺术家）
    this.firstDone = {};       // 首夜能力用过了（钟表匠）：换成这个角色的人还能用一次
    this.twin = null;          // { a: 镜像双子本人, b: 对立双子 }
    this.fangUsed = false;     // 方古的转化每局一次（不随方古换人重置）
    this.vigKept = [];         // 被亡骨魔杀死的爪牙：{ minion, dir }（dir：毒哪一侧最近的镇民）
    this.abnormal = [];
    this.demonVoted = false;
    this.minionNominated = false;
    this.dayVoters = [];
    this.jugglerDay = {};      // 杂耍艺人的首个白天：id → 第几天
    this.juggled = {};         // 今天猜过的：id → { day, correct }
    this.madness = {};         // 正在疯狂的人：id → { role, night, claimed, by }
    this.savantDay = {};       // 博学者今天问过了：id → 第几天
    this.declared = {};        // 今天公开声明过几次：id → { day, n }
    this.claims = {};          // 最近一次公开声明的身份：id → 角色（说书人编假信息时配合邪恶的伪装）
    this.sageHit = null;       // 今晚被恶魔杀死的贤者：{ sage, demon }
    this.barberDue = false;
    this.pendingKlutz = null;
    this.klutzQueue = [];      // 同时死的第二个呆瓜：等前一个选完（同时触发的能力由说书人定顺序）
    this.klutzNow = false;     // 夜里被处决的呆瓜：死讯已经公开，不用等天亮
    this.madNight = [];        // 今天的处决已经占了，留到入夜处决的人：{ id, why }
    this.curseFail = null;     // 失效的女巫诅咒的人：他提名时算一次"没有正常生效"
    this.pitNight = null;      // 麻脸巫婆造出恶魔的当晚，说书人的安排
    this.redHerring = null;
    this.balloon = {};         // 气球驾驶员上一晚得知的那个人的角色类型：id → 'townsfolk' | ...
    this.leviGood = [];        // 利维坦在起作用时被处决过的善良玩家
    this.goblinMark = null;    // 哥布林今天被提名后声明了身份：{ id, day }
    this.amnesiacDay = {};     // 失忆者今天猜过了：id → 第几天
    this.amnesiacKnown = {};   // 失忆者猜到「完美」了：id → true（白天要自己用的能力，这以后才给按钮）
    this.woke = [];            // 今晚因自己的能力醒过的人（侍女用）
    this.harpyMad = null;      // 鹰身女妖：{ id 疯狂的人, target 第二名, by, night, claimed }
    this.pukkaVictim = null;   // 普卡上一个毒的人
    this.farmerDue = [];       // 今晚死了的农夫：天亮前有人接班
    this.rkDue = null;         // 今晚死了的守鸦人
    this.damselTried = {};     // 公开猜过落难少女的人：id → true（真爪牙合计只有一次）
    this.damselGuessed = false;
    this.boom = null;          // 炸弹人引爆后的倒数：{ day, alive, points: { 谁 → 指着谁 } }
    // 黯月初升的角色（引擎统一后也在这里结算）
    this.lastPick = {};        // 上一夜选过谁（驱魔人、魔鬼代言人）
    this.poCharged = false;    // 珀上次没选人：这次杀三个
    this.shabaLast = [];       // 沙巴洛斯上一夜选的人（反刍从这里挑）
    this.grandchild = null;
    this.gossipPending = false; this.gossipSaid = {};
    this.moonchildPick = null; this.pendingMoonchild = null;
    this.diedToday = false; this.outsiderDiedToday = false;
    this.mastermindDay = null; this.demonExecuted = false;
    this.blocked = null;       // 被驱魔人选中的恶魔：今晚不能行动
    this.goonHit = false;
    this.firstDemon = this.players.find((p) => team(p) === 'demon')?.id ?? null;
    // 多个村夫时其中一个醉酒（整局）
    const idiots = this.players.filter((p) => p.role === 'villageidiot');
    if (idiots.length > 1) this.addFx('drunk', pickOne(idiots, rng).id, null, 'never', '村夫');
    if (this.players.some((p) => p.role === 'fortuneteller' || p.shownRole === 'fortuneteller')) this.redHerring = this.st.redHerring();
    // 科学怪人：恶魔拿到一个不在场的善良角色的能力
    if (inPlay.has('boffin')) {
      const free = BOFFIN_POOL.filter((r) => !inPlay.has(r) && !this.players.some((p) => p.shownRole === r));
      this.boffin = free.length ? pickOne(free, rng) : null;
    }
    this.twinSync(null);
  },

  // ───────────────────────── 状态查询 ─────────────────────────
  abilityOf(p) { return p.gained ?? (p.role === 'drunk' ? p.shownRole : p.role); },
  /** 不知道自己是什么能力的人（失忆者、拿到能力的食人族）：信息只给裸的数字、人名，不说是哪个能力。 */
  hidden(p) { return !!p?.gained && (p.role === 'amnesiac' || p.role === 'cannibal'); },
  /** 利维坦在起作用。 */
  leviOn() { return this.players.some((q) => q.role === 'leviathan' && q.alive && !this.snvBroken(q)); },
  /** 这个死人还留着能力吗（被亡骨魔杀死的爪牙，亡骨魔还在且没失效）。 */
  kept(p) { return !!p && !p.alive && !!p.kept && team(p) === 'minion' && this.vigOn(); },
  /** 还用得了能力吗（活着，或者保留了能力）。不管醉酒中毒。 */
  active(p) { return !!p && (p.alive || this.kept(p)); },
  /** 科学怪人给恶魔的那个能力（科学怪人还在、没失效时才有；恶魔自己醉酒中毒不影响）。 */
  extraAbility(p) {
    if (!this.boffin || !p || team(p) !== 'demon') return null;
    const b = this.players.find((q) => q.role === 'boffin' && this.active(q));
    return b && !this.snvBroken(b) ? this.boffin : null;
  },
  /** 有没有这个能力（自己的，或者科学怪人给的）。 */
  has(p, ability) { return this.abilityOf(p) === ability || this.extraAbility(p) === ability; },
  /** 拿着某个能力、还用得了的人。 */
  holders(ability) { return this.players.filter((q) => this.has(q, ability) && this.active(q)); },

  // ── 陌客、间谍的误登记（暗流涌动的规则）：只对检测类能力生效，每次由说书人现定，可以前后不一致 ──
  misregSNV(p, by) {
    if (!p || !['recluse', 'spy'].includes(p.role) || this.snvBroken(p)) return false;
    if (this.misregister != null) return this.rng() < this.misregister;
    return this.st.misregister(p, by);
  },
  /** 被检测时登记成邪恶吗。 */
  seenEvil(p, by) { const e = this.evilOf(p); return this.misregSNV(p, by) ? !e : e; },
  /** 被检测时登记成恶魔吗（陌客可能）。 */
  seenDemon(p, by) { return team(p) === 'demon' || (p.role === 'recluse' && this.misregSNV(p, by)); },
  /** 被检测时登记成镇民吗（间谍可能）。 */
  seenTownsfolk(p, by) { return team(p) === 'townsfolk' || (p.role === 'spy' && this.misregSNV(p, by)); },
  /** 被看角色时看到的角色（送葬者、守鸦人）：陌客可能是爪牙或恶魔，间谍可能是善良角色。 */
  seenRole(p, by) {
    if (!this.misregSNV(p, by)) return p.role;
    const pool = p.role === 'recluse' ? [...rolesOf(this.script, 'minion'), ...rolesOf(this.script, 'demon')] : goodOf(this.script).filter((r) => r !== 'spy');
    return this.st.choose('misregRole', pool, { who: p.id });
  },
  demonsAlive() { return this.players.filter((p) => p.alive && team(p) === 'demon'); },
  vigOn(seen = new Set()) { return this.players.some((q) => q.role === 'vigormortis' && q.alive && !this.snvBroken(q, seen)); },
  /** 涡流在起作用。 */
  vortoxOn() { return this.players.some((q) => q.role === 'vortox' && q.alive && !this.snvBroken(q)); },
  isTownsfolk(p) { return team(p) === 'townsfolk'; },

  /** 从 p 开始往 dir（+1 顺时针、-1 逆时针）方向最近的镇民，生死不限。 */
  nearestTownsfolk(p, dir) {
    const n = this.players.length;
    for (let k = 1; k < n; k++) {
      const q = this.players[(p.seat - 1 + dir * k + n * k) % n];
      if (team(q) === 'townsfolk') return q;
    }
    return null;
  },

  /** 被诺-达鲺、亡骨魔按座位毒着的人（这两种毒不存，每次现算）。 */
  seatPoisoned(p, seen) {
    if (!this.isTownsfolk(p)) return false;
    for (const d of this.players.filter((q) => q.role === 'nodashii' && q.alive)) {
      if (seen.has(d.id)) continue;
      if (!this.snvBroken(d, seen) && [1, -1].some((dir) => this.nearestTownsfolk(d, dir)?.id === p.id)) return true;
    }
    if (!this.vigKept.length || !this.vigOn(seen)) return false;
    return this.vigKept.some((e) => { const m = this.get(e.minion); return m && team(m) === 'minion' && this.nearestTownsfolk(m, e.dir)?.id === p.id; });
  },

  snvPoisoned(p, seen = new Set()) {
    const next = new Set(seen); next.add(p.id);
    return this.fx.some((f) => f.kind === 'poison' && f.target === p.id && this.snvFxLive(f, next)) || this.seatPoisoned(p, next);
  },
  /** 醉酒或中毒（能力失效）。哲学家在失效时选的能力从来没真正到手。 */
  snvBroken(p, seen = new Set()) {
    if (!p) return false;
    if (seen.has(p.id)) return false;
    if (p.gainedFake || p.role === 'drunk') return true;
    const next = new Set(seen); next.add(p.id);
    return this.fx.some((f) => (f.kind === 'drunk' || f.kind === 'poison') && f.target === p.id && this.snvFxLive(f, next)) || this.seatPoisoned(p, next);
  },
  snvFxLive(f, seen = new Set()) {
    if (f.source == null) return true;
    const src = this.get(f.source);
    if (!src) return true;
    if (!this.active(src)) return false;
    return !this.snvBroken(src, seen);
  },
  /** 记一次"能力没有正常生效"（同一个人只算一次，数学家不算自己）。 */
  flag(p, why) {
    if (!p) return;
    if (!this.abnormal.includes(p.id)) this.abnormal.push(p.id);
    if (why) this.record('st', `${this.tag(p.id)} 的能力没有正常生效：${why}`);
  },
  /** 这个人的信息要不要改：'must' 涡流（镇民必须拿错的），'fake' 醉酒中毒（说书人给错的），null 给真的。 */
  lieMode(p) {
    if (this.isTownsfolk(p) && this.vortoxOn()) return 'must';
    return this.snvBroken(p) ? 'fake' : null;
  },
  /**
   * 数字信息：lieMode 不为空就按假世界答，前后几晚对得上。假世界碰巧和真相一样时：
   * 醉酒中毒就照说（中毒碰巧说对不算没正常生效），涡流必须是错的，只好差一点。
   * inWorld(w)：这个数字在假世界里是多少；杂耍艺人、数学家这种假世界算不出来的不给，就只差一点。
   */
  infoNumber(p, truth, range, inWorld = null) {
    const mode = this.lieMode(p);
    if (!mode) return truth;
    const said = inWorld ? inWorld(this.st.snvWorld(p, mode, (w) => inWorld(w) !== truth)) : null;
    const usable = said != null && said >= range.min && said <= range.max && (mode !== 'must' || said !== truth);
    let v = usable ? said : this.st.fakeNumber(p, truth, range);
    if (mode === 'must' && v === truth) v = truth + 1; // 可选范围只有真相一个数（比如还没人死）：涡流下也不能说真话
    this.st.decide('infoNumber', { who: p.id, role: p.role, mode, range, chosen: v, truth, fromWorld: usable });
    if (v !== truth) this.flag(p, `得到了错误的数字 ${v}（真实是 ${truth}）`);
    return v;
  },
  infoYes(p, truth, inWorld) {
    const mode = this.lieMode(p);
    if (!mode) return truth;
    const said = inWorld(this.st.snvWorld(p, mode, (w) => inWorld(w) !== truth));
    const v = mode === 'must' ? !truth : said;
    this.st.decide('infoYes', { who: p.id, role: p.role, mode, options: [true, false], chosen: v, truth, fromWorld: v === said });
    if (v !== truth) this.flag(p, `得到了相反的答案（真实是${truth ? '是' : '否'}）`);
    return v;
  },

  // ───────────────────────── 角色变化 ─────────────────────────
  /** 把 p 换成 role（阵营不动）。夜里已经轮过的能力当晚不再用。 */
  changeRole(p, role) {
    p.role = role; p.shownRole = role;
    p.gained = null; p.gainedFake = false;
    delete this.used[p.id];
    delete this.firstDone[p.id];
    delete this.jugglerDay[p.id];
    delete this.choices[p.id];
    if (team(p) !== 'minion') { p.kept = false; this.vigKept = this.vigKept.filter((e) => e.minion !== p.id); }
    this.fx = this.fx.filter((f) => !(f.why === '舞蛇人' && f.target === p.id)); // 舞蛇人的毒到离场为止
    this.fx = this.fx.filter((f) => !(f.why === '哲学家' && f.source === p.id)); // 哲学家换了角色，被他弄醉的人恢复
  },
  /** 两人互换角色（阵营不动）：哲学家拿到的能力跟着角色走。 */
  swapRoles(a, b) {
    const ra = a.role; const rb = b.role; const ga = a.gained; const gb = b.gained; const fa = a.gainedFake; const fb = b.gainedFake;
    this.changeRole(a, rb); this.changeRole(b, ra);
    a.gained = gb; a.gainedFake = fb; b.gained = ga; b.gainedFake = fa;
  },
  /** 角色变了以后：双子要不要重新配对、哲学家醉的人要不要换。say 为 null 时不发信息（开局）。 */
  afterChange(say) { this.twinSync(say); this.philSync(); },

  twinSync(say) {
    const a = this.players.find((q) => q.role === 'eviltwin' && this.active(q));
    if (!a) { this.twin = null; return; }
    const b = this.twin?.a === a.id ? this.get(this.twin.b) : null;
    if (b && this.evilOf(b) !== this.evilOf(a)) return;
    const opp = this.st.twinFor(a);
    if (!opp) { this.twin = null; return; }
    this.twin = { a: a.id, b: opp.id, told: false };
    this.record('st', `镜像双子 ${this.tag(a.id)} 的对立双子是 ${this.tag(opp.id)}`);
    if (say) this.tellTwins(say);
  },
  tellTwins(say) {
    if (!this.twin || this.twin.told) return;
    const a = this.get(this.twin.a); const b = this.get(this.twin.b);
    this.twin.told = true;
    say(a, `你的对立双子是 **${this.name(b.id)}**，他是 **${ROLES[b.role].name}**。`);
    say(b, `**${this.name(a.id)}** 和你互为镜像：他是 **${ROLES[a.role].name}**，也知道你是谁。`);
  },
  twinGoodId() { if (!this.twin) return null; return this.evilOf(this.get(this.twin.a)) ? this.twin.b : this.twin.a; },
  /** 镜像双子的能力在起作用。 */
  twinOn() { if (!this.twin) return false; const a = this.get(this.twin.a); return this.active(a) && !this.snvBroken(a); },
  /** 两个双子都活着：善良赢不了。 */
  twinBlocks() { return this.twinOn() && !!this.get(this.twin.b)?.alive; },

  philSync() {
    for (const q of this.players.filter((x) => x.gained && !x.gainedFake && !this.hidden(x))) {
      const cur = this.fx.find((f) => f.why === '哲学家' && f.source === q.id);
      if (cur && this.get(cur.target)?.role === q.gained) continue;
      this.fx = this.fx.filter((f) => f !== cur);
      const list = this.players.filter((x) => x.role === q.gained && x.id !== q.id);
      const who = list.find((x) => x.alive) ?? list[0];
      if (who) this.addFx('drunk', who.id, q.id, 'never', '哲学家');
    }
  },

  // ───────────────────────── 死亡 ─────────────────────────
  snvDie(p, cause, messages = []) {
    if (!p.alive) return;
    const off = this.snvBroken(p);
    const ab = this.abilityOf(p);
    const aliveBefore = this.aliveCount();
    p.alive = false;
    if (this.phase === 'night' && cause !== 'execution') this.nightDeaths.push(p.id); // 夜里的处决当场公布，不等天亮
    if (this.phase === 'night' && cause === 'demon') (this.demonKills ??= []).push(p.id);
    const why = {
      demon: '被恶魔杀死', execution: '被处决', witch: '被女巫的诅咒咒死', pithag: '死于麻脸巫婆造出恶魔的那一夜', fanggu: '被方古的转化取代',
      madness: '因疯狂被处决', storyteller: '说书人判定死亡', starpass: '恶魔自杀（传位）', slayer: '被猎手射杀',
      harpy: '没能疯狂地证明，被鹰身女妖的能力杀死', boomdandy: '死于炸弹人的炸弹',
      assassin: '被刺客刺杀', godfather: '被教父杀死', gambler: '赌错了角色', gossip: '因造谣者的声明而死', tinker: '修补匠突然死亡',
      moonchild: '被月之子带走', grandmother: '孙子被恶魔杀死，祖母随之而去',
    }[cause] ?? cause;
    this.log.push(`${this.name(p.id)} 死亡（${cause}）`);
    this.record('death', `${this.tag(p.id)} ${why}`);
    this.fx = this.fx.filter((f) => !(f.why === '舞蛇人' && f.target === p.id));
    if (ab === 'sweetheart') {
      if (off) this.flag(p, '心上人死亡时失效，没有人醉酒');
      else { const v = this.st.sweetheartDrunk(p); if (v) this.addFx('drunk', v.id, null, 'never', '心上人'); }
    }
    if (ab === 'barber') { if (off) this.flag(p, '理发师死亡时失效，恶魔不能换角色'); else this.barberDue = true; }
    if (ab === 'klutz') { // 失效的呆瓜也要选（他不知道自己失效），选了没有效果
      if (this.pendingKlutz) (this.klutzQueue ??= []).push(p.id);
      else { this.pendingKlutz = p.id; this.klutzNow = this.phase === 'night' && cause === 'execution'; }
    }
    if (this.phase !== 'night') { this.diedToday = true; if (team(p) === 'outsider') this.outsiderDiedToday = true; }
    p.apparentDead = false;
    if (team(p) === 'demon' && cause === 'execution') this.demonExecuted = true;
    if (ab === 'moonchild') this.pendingMoonchild = p.id; // 失效的月之子也要选（他不知道），选中善良也不会死
    if (cause === 'demon' && p.id === this.grandchild) { // 孙子被恶魔杀死，祖母随之而去
      const gm = this.holders('grandmother').find((q) => q.alive && !this.snvBroken(q));
      if (gm) this.snvKill(gm, 'grandmother', messages);
    }
    if (this.phase === 'night' && cause !== 'execution') {
      if (ab === 'farmer') { if (off) this.flag(p, '农夫夜里死了，但他失效了，没有人接班'); else this.farmerDue.push(p.id); }
      if (ab === 'ravenkeeper') this.rkDue = p.id; // 失效的守鸦人也醒（他不知道自己失效），拿到的可能是假的
    }
    if (cause === 'execution') this.feedCannibals(p, ab);
    if (team(p) === 'demon' && !this.demonsAlive().length && cause !== 'fanggu' && cause !== 'pithag') this.demonHeir(p, cause, aliveBefore, messages);
  },

  /**
   * 恶魔死了谁接任（暗流涌动的规则）：活人有 5 个以上时红唇女郎接任；小恶魔自杀时由一名爪牙接任。
   * 接任的人当晚不再行动（他的那一步已经过了）。
   */
  demonHeir(d, cause, aliveBefore, messages) {
    const minions = this.alive().filter((q) => team(q) === 'minion');
    const sw = minions.find((q) => this.abilityOf(q) === 'scarletwoman' && !this.snvBroken(q));
    const heir = sw && aliveBefore >= 5 ? sw : cause === 'starpass' && minions.length ? this.st.starpassHeir(minions) : null;
    if (!heir) return;
    this.changeRole(heir, d.role);
    heir.evil = true;
    this.log.push(`${this.name(heir.id)} 成为了${ROLES[d.role].name}`);
    this.record('death', `${this.name(heir.id)} 接任，成为新的${ROLES[d.role].name}`);
    messages.push({ playerId: heir.id, text: `恶魔死去了——**你现在是${ROLES[d.role].name}**。${ROLES[d.role].choose ? '从下一个夜晚开始，每晚选择一名玩家杀死。' : ''}` });
  },

  /**
   * 食人族：有人死于处决，食人族拿到他的能力（不告诉他是什么）。处决的是邪恶，他中毒到下一个善良玩家死于处决，
   * 说书人假装他拿到了那人声称的角色（照官方的建议）。处决死人、处决了没死都不算（这里根本不会走到）。
   */
  feedCannibals(p, ab) {
    const evil = this.evilOf(p);
    if (!evil) this.fx = this.fx.filter((f) => f.why !== '食人族');
    for (const c of this.players.filter((q) => q.role === 'cannibal' && q.id !== p.id)) {
      const said = this.claims?.[p.id];
      const fake = said && inScript(said, this.script) && ['townsfolk', 'outsider'].includes(ROLES[said].team) && said !== 'cannibal' ? said : null;
      c.gained = evil ? fake : ab === 'cannibal' ? null : ab;
      c.gainedFake = false;
      if (evil) this.addFx('poison', c.id, null, 'never', '食人族');
      this.record('st', `食人族 ${this.tag(c.id)} ${evil ? `吃了邪恶的 ${this.name(p.id)}：中毒${fake ? `，以为拿到了${ROLES[fake].name}的能力` : ''}` : c.gained ? `拿到了 ${ROLES[c.gained].name} 的能力` : '没有拿到能力'}`);
    }
  },

  /** 恶魔 d 对 t 下手。 */
  demonHit(d, t, messages) {
    if (!t?.alive) return;
    const safe = this.safeFrom(t, 'demon');
    if (safe) { this.record('st', `恶魔对 ${this.tag(t.id)} 下手，但${safe}：没有死`); return; } // 被僧侣保护的小恶魔自刀也无事发生（官方）
    if (d.role === 'imp' && t.id === d.id) { this.snvDie(d, 'starpass', messages); return; }
    if (this.has(t, 'soldier') && !this.snvBroken(t)) { this.record('st', `恶魔对士兵 ${this.tag(t.id)} 下手：没有死`); return; }
    if (this.has(t, 'mayor') && !this.snvBroken(t) && team(t) !== 'demon') {
      const others = this.alive().filter((q) => q.id !== t.id && q.id !== d.id && !this.safeFrom(q, 'demon') && !(this.has(q, 'soldier') && !this.snvBroken(q)));
      const victim = this.st.mayorBounce(t, others);
      if (victim) { this.snvDie(victim, 'demon', messages); return; }
    }
    if (d.role === 'fanggu' && team(t) === 'outsider' && !this.fangUsed && t.id !== d.id) {
      this.fangUsed = true;
      const say = (q, text) => messages.push({ playerId: q.id, text });
      this.snvDie(d, 'fanggu', messages);
      this.changeRole(t, 'fanggu');
      t.evil = true;
      say(t, '方古选中了你：**你现在是邪恶的方古。** 原来的方古代替你死去了。从下一个夜晚起由你杀人。（你不知道爪牙是谁。）');
      this.record('death', `${this.tag(t.id)} 被转化成新的方古`);
      this.afterChange(say);
      return;
    }
    if (d.role === 'vigormortis' && team(t) === 'minion') {
      t.kept = true;
      this.vigKept.push({ minion: t.id, dir: this.st.vigSide(t) });
      this.record('st', `亡骨魔杀死了爪牙 ${this.tag(t.id)}：他保留能力，邻近一名镇民中毒`);
    }
    if (this.abilityOf(t) === 'sage') this.sageHit = { sage: t.id, demon: d.id, off: this.snvBroken(t) };
    this.snvKill(t, 'demon', messages);
  },

  // ───────────────────────── 黯月初升的免死和死亡（引擎统一，口径照 bmr.js） ─────────────────────────
  /** 茶艺师两侧最近的存活玩家。 */
  teaNeighbours(p) {
    const n = this.players.length; const res = [];
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = this.players[(p.seat - 1 + dir * k + n * k) % n];
        if (q.id === p.id) break;
        if (this.visAlive(q)) { res.push(q); break; }
      }
    }
    return res.length === 2 && res[0].id === res[1].id ? [res[0]] : res;
  },
  /** p 现在为什么不会死（黯月初升的几种）：刺客无视一切。 */
  bmrProtection(p, cause) {
    if (cause === 'assassin') return null;
    if (this.has(p, 'sailor') && !this.snvBroken(p)) return '水手';
    for (const t of this.holders('tealady').filter((q) => q.alive && !this.snvBroken(q))) {
      const nb = this.teaNeighbours(t);
      if (nb.length === 2 && nb.every((q) => !this.evilOf(q)) && nb.some((q) => q.id === p.id)) return '茶艺师';
    }
    if (cause === 'execution' && this.fx.some((f) => f.kind === 'exeSafe' && f.target === p.id && this.snvFxLive(f))) return '魔鬼代言人';
    return null;
  },
  /**
   * 尝试杀死 p：旅店老板、僧侣、水手、茶艺师、魔鬼代言人、和平主义者挡；弄臣第一次不死；僵怖第一次假死。
   * 返回 died / saved / fake / already。
   */
  snvKill(p, cause, messages = []) {
    if (!p || !p.alive) return 'already';
    const prot = cause === 'assassin' ? null : (this.safeFrom(p, cause) ?? this.bmrProtection(p, cause));
    if (prot) { this.record('st', `${this.tag(p.id)} ${prot.startsWith('被') ? prot : `因${prot}`}，没有死（${cause}）`); return 'saved'; }
    if (cause === 'execution' && !this.evilOf(p) && this.holders('pacifist').some((q) => q.alive && !this.snvBroken(q)) && this.st.pacifistSaves(p)) {
      this.record('st', `和平主义者：被处决的善良玩家 ${this.tag(p.id)} 没有死`);
      return 'saved';
    }
    if (this.has(p, 'fool') && cause !== 'assassin' && !this.used[`fool-${p.id}`] && !this.snvBroken(p)) {
      this.used[`fool-${p.id}`] = true;
      this.record('st', `弄臣 ${this.tag(p.id)} 第一次将要死亡，没有死（能力用掉）`);
      return 'saved';
    }
    if (p.role === 'zombuul' && !p.apparentDead && !this.snvBroken(p)) {
      p.apparentDead = true;
      if (this.phase === 'night') this.nightDeaths.push(p.id); else this.diedToday = true;
      this.record('death', `${this.tag(p.id)} 第一次死亡——僵怖仍然活着，但被当作死亡`);
      this.zombuulNote(p, messages);
      return 'fake';
    }
    this.snvDie(p, cause, messages);
    return 'died';
  },
  /** 复活（教授、沙巴洛斯反刍）。 */
  snvRevive(p, why) {
    if (!p || p.alive) return;
    p.alive = true; p.ghostVote = true; p.apparentDead = false;
    delete this.used[p.id];
    (this.nightRevived ??= []).push(p.id);
    this.record('death', `${this.tag(p.id)} 复活了（${why}）`);
  },
  /** 莽夫：每晚第一个用自己的能力选中他的人醉酒到明天黄昏，莽夫变成那人的阵营（刺客不醉）。 */
  goonSNV(selector, target, { assassin = false } = {}) {
    if (!target || !this.has(target, 'goon') || target.id === selector.id || this.goonHit || !target.alive || this.snvBroken(target)) return;
    this.goonHit = true;
    if (!assassin) this.addFx('drunk', selector.id, target.id, this.night, '莽夫');
    const was = this.evilOf(target);
    target.evil = this.evilOf(selector);
    if (was !== target.evil) this.pendingGoonNews = target.id;
  },
  /** 祖母首夜（或被复活后）得知孙子：一名善良玩家和他的角色。 */
  grandmotherSNV(p, tell) {
    if (!this.grandchild || !this.get(this.grandchild)?.alive) this.grandchild = this.st.chooseGrandchild(p)?.id ?? null;
    const gc = this.get(this.grandchild);
    if (!gc) return;
    const lie = this.lieMode(p);
    const role = lie ? this.st.falseRoleSNV(p, gc, this.st.snvWorld(p, lie)) : gc.role;
    tell(p, `你的孙子是 **${this.name(gc.id)}**，他是 **${ROLES[role].name}**。`, `你得知了一名玩家 **${this.name(gc.id)}** 和一个角色 **${ROLES[role].name}**。`);
  },

  /** p 今晚为什么不会死（旅店老板什么都挡，僧侣只挡恶魔）；不受保护返回 null。 */
  safeFrom(p, cause) {
    if (this.phase !== 'night') return null;
    const f = this.fx.find((x) => x.kind === 'safe' && x.target === p.id && (x.why !== '僧侣' || cause === 'demon') && this.snvFxLive(x));
    return f ? `被${f.why}保护` : null;
  },

  // ───────────────────────── 夜晚 ─────────────────────────
  startNightSNV() {
    this.pitNight = null;
    this.sageHit = null;
    this.midNight = null;
    this.nightRevived = [];
    this.woke = [];
    this.rkDue = null;
    this.farmerDue = [];
    this.blocked = null;
    this.goonHit = false;
    this.pendingGoonNews = null;
  },

  /** 首夜的爪牙/恶魔信息。 */
  evilInfoSNV() {
    const messages = [];
    const say = (p, text) => messages.push({ playerId: p.id, text });
    const demon = this.demonsAlive()[0];
    const minions = this.players.filter((p) => team(p) === 'minion');
    // 疯子：恶魔知道他是谁（这是疯子能力的一部分，人少没有恶魔信息时也告诉）
    const lunatic = this.players.find((p) => p.role === 'lunatic');
    if (lunatic && demon) say(demon, `**${this.name(lunatic.id)}** 是疯子：他以为自己是${ROLES[lunatic.shownRole].name}。`);
    // 寡妇首夜看魔典（先看，再选人）
    for (const w of this.players.filter((p) => this.abilityOf(p) === 'widow' && p.alive && !this.used[p.id])) say(w, `魔典（和说书人看到的一样）：
${this.grimoire()}
现在选一名玩家：他中毒，直到你死亡。`);
    // 科学怪人：恶魔和他都知道恶魔拿到了哪个能力（人少也告诉）
    const boffin = this.players.find((p) => p.role === 'boffin');
    if (boffin && this.boffin && demon) {
      const ab = ROLES[this.boffin];
      say(boffin, `科学怪人：恶魔拿到了 **${ab.name}** 的能力。`);
      say(demon, `科学怪人在场：**你还拥有${ab.name}的能力**（${ab.ability}）。`);
    }
    // 落难少女：所有爪牙都知道她在场（人少也告诉）
    if (this.players.some((p) => p.role === 'damsel')) {
      for (const m of minions) say(m, '**落难少女在场。** 你们爪牙合计有一次机会白天公开猜她是谁：猜中了，邪恶获胜。（行动面板里点「猜落难少女」）');
    }
    if (!this.evilInfo) return messages;
    this.evilKnown = this.knownMap();
    // 魔术师：恶魔以为他是爪牙，爪牙以为他是恶魔
    const mag = this.players.find((p) => p.role === 'magician' && !this.snvBroken(p));
    if (mag && demon) {
      for (const m of minions) {
        const mates = minions.filter((x) => x.id !== m.id).map((x) => this.name(x.id));
        const two = shuffle([demon, mag], this.rng).map((x) => `**${this.name(x.id)}**`);
        say(m, `恶魔是：${two.join('、')}（你看到了两个「恶魔」）。${mates.length ? `其他爪牙：${mates.join('、')}。` : ''}`);
        this.evilKnown[m.id] = shuffle([...this.evilKnown[m.id], { id: mag.id, team: '恶魔' }], this.rng);
      }
      const seen = shuffle([...minions, mag], this.rng);
      say(demon, `你的爪牙：${seen.map((x) => `**${this.name(x.id)}**`).join('、')}。\n不在场的角色（可用来伪装）：${this.bluffs.map((r) => ROLES[r].name).join('、')}。`);
      this.evilKnown[demon.id] = shuffle([...this.evilKnown[demon.id], { id: mag.id, team: '爪牙' }], this.rng);
      this.record('st', `魔术师 ${this.tag(mag.id)} 混进了恶魔和爪牙的信息`);
      return messages;
    }
    if (lunatic) {
      const fake = sample(this.players.filter((q) => q.id !== lunatic.id), minions.length, this.rng);
      say(lunatic, `你的爪牙：${fake.map((x) => `**${this.name(x.id)}**`).join('、')}。
不在场的角色（可用来伪装）：${pickBluffsSNV(new Set(this.players.map((q) => q.role)), this.rng, this.script).map((r) => ROLES[r].name).join('、')}。`);
    }
    for (const m of minions) {
      const mates = minions.filter((x) => x.id !== m.id).map((x) => this.name(x.id));
      say(m, `恶魔是 **${this.name(demon.id)}**。${mates.length ? `其他爪牙：${mates.join('、')}。` : ''}`);
    }
    say(demon, `你的爪牙：${minions.map((x) => `**${this.name(x.id)}**`).join('、')}。\n不在场的角色（可用来伪装）：${this.bluffs.map((r) => ROLES[r].name).join('、')}。`);
    return messages;
  },

  /** 一个人按某个能力行动时的选人要求。 */
  promptFor(p, role) {
    const spec = role === 'barber' ? { count: 2, optional: true } : role === 'po' ? { count: this.poCharged ? 3 : 1, optional: !this.poCharged } : ROLES[role].choose;
    if (!spec) return null;
    const last = this.lastPick?.[p.id];
    const options = this.players.filter((q) => {
      if (spec.notSelf && q.id === p.id) return false;
      if (spec.alive && !this.visAlive(q)) return false;
      if (spec.dead && this.visAlive(q)) return false;
      if (spec.notLast && q.id === last) return false;
      if (role === 'barber' && team(q) === 'demon' && q.id !== p.id) return false; // 不能选其他恶魔
      return true;
    }).map((q) => q.id);
    const roleOptions = spec.role ? (spec.good ? goodOf(this.script) : rolesOf(this.script)) : null;
    return { playerId: p.id, role: this.hidden(p) ? p.role : role, count: spec.count, options, optional: !!spec.optional, pickRole: !!spec.role, roleOptions, waiting: false };
  },

  nightPromptsSNV() {
    if (this.midNight) { const p = this.get(this.midNight.who); return p ? [this.promptFor(p, this.midNight.as)] : []; }
    const first = this.night === 1;
    const out = [];
    for (const p of this.players.filter((q) => this.active(q))) {
      const role = this.abilityOf(p);
      const spec = ROLES[role].choose;
      if (!spec) continue;
      if (first ? !ROLES[role].firstNight : !ROLES[role].otherNight) continue;
      if (spec.once && this.used[p.id]) continue;
      if (role === 'philosopher' && p.gained) continue; // 选过了（选的也是哲学家时不能再选一次）
      if (role === 'witch' && this.aliveCount() <= 3) continue;
      if (role === 'godfather' && (first || !this.outsiderDiedToday)) continue; // 教父首夜只得知外来者；白天有外来者死了才醒来杀人
      if (role === 'zombuul' && (first || this.diedToday)) continue;           // 僵怖：白天没有人死才醒
      if (role === 'professor' && !this.players.some((q) => !this.visAlive(q))) continue;
      if (p.apparentDead && role !== 'zombuul') continue;
      out.push(this.promptFor(p, role));
    }
    return out;
  },

  submitChoiceSNV(playerId, targets, extra = {}) {
    const pr = this.nightPromptsSNV().find((x) => x.playerId === playerId);
    if (!pr) throw new Error('你今晚不需要选择');
    const cantPick = pr.options.length < pr.count;
    const hasRole = pr.pickRole && extra.role;
    if (targets.length === 0 && !pr.optional && !cantPick && !hasRole) throw new Error(`需要选择 ${pr.count} 名玩家`);
    const skip = targets.length === 0 && (pr.optional || cantPick) && !hasRole;
    if (!skip) {
      if (targets.length !== pr.count || new Set(targets).size !== targets.length) throw new Error(`需要选择 ${pr.count} 名不同的玩家`);
      if (!targets.every((t) => pr.options.includes(t))) throw new Error('选择了不可选的玩家');
      if (pr.pickRole && !pr.roleOptions.includes(extra.role)) throw new Error('还要选一个角色');
    }
    this.choices[playerId] = skip ? { targets: [], role: null } : { targets, role: pr.pickRole ? extra.role : null };
    return [];
  },

  autoChooseSNV(playerId) {
    const pr = this.nightPromptsSNV().find((x) => x.playerId === playerId);
    if (!pr) return;
    const p = this.get(playerId);
    const skip = () => { this.choices[playerId] = { targets: [], role: null }; };
    if (pr.optional && this.rng() < 0.5) return skip();
    let opts = pr.options;
    const prey = opts.filter((id) => !this.evilOf(this.get(id)) && this.get(id).alive);
    if (['fanggu', 'vigormortis', 'nodashii', 'vortox', 'witch', 'cerenovus', 'pithag', 'imp', 'widow', 'pukka', 'poisoner', 'zombuul', 'shabaloth', 'po', 'assassin', 'godfather'].includes(pr.role) && prey.length >= pr.count) opts = prey;
    const targets = sample(opts, pr.count, this.rng);
    let role = null;
    if (pr.pickRole) {
      const absent = pr.roleOptions.filter((r) => !this.players.some((q) => q.role === r));
      const pool = pr.role === 'pithag' ? absent.filter((r) => ROLES[r].team !== 'demon') : pr.roleOptions.filter((r) => r !== p.role);
      role = pool.length ? pickOne(pool, this.rng) : pickOne(pr.roleOptions, this.rng);
    }
    this.choices[playerId] = { targets, role };
  },

  choiceOfSNV(p) { const c = this.choices[p.id]; return c ? { targets: (c.targets ?? []).map((id) => this.get(id)), role: c.role ?? null } : null; },

  /**
   * 夜晚结算。角色变了的人今晚还轮得到（ids 里的人），就停下来等他选。
   * 返回 true 表示要暂停；这时已经攒下的信息先发出去（新恶魔要先知道自己是恶魔，才能选人）。
   */
  midCheck(steps, i, ids, messages) {
    for (const [k, id] of ids.entries()) {
      const p = this.get(id);
      if (!this.active(p) || this.choices[id]) continue;
      const role = this.abilityOf(p);
      if (!steps.slice(i + 1).includes(role)) continue;
      if (!ROLES[role].choose || (this.night === 1 && !ROLES[role].firstNight)) continue;
      this.midNight = { step: i + 1, who: id, as: role, messages: [], rest: ids.slice(k + 1) }; // rest：理发师一次换两个人，这个选完还要看下一个
      this.flushed = messages.splice(0);
      this.record('st', `${this.tag(id)} 今晚刚换了能力，顺序里还没轮到：现在行动`);
      return true;
    }
    return false;
  },
  /** 暂停时告诉这个人为什么现在要选（房间层用）。 */
  pauseText(id) {
    const m = this.midNight;
    if (!m?.as) return null; // 黯月初升：夜里被复活，用房间层默认的提示
    if (m?.as === 'barber') return '理发师死了：你可以选两名玩家交换他们的角色（不能选其他恶魔），也可以放弃。';
    if (this.hidden(this.get(m.who))) return '轮到你了：选人吧（你不知道这是什么能力）。';
    return `轮到你了：今晚你要行使「${ROLES[m?.as]?.name ?? ''}」的能力。`;
  },

  resolveNightSNV() {
    const mid = this.midNight ?? null;
    this.midNight = null;
    const messages = mid?.messages ?? [];
    const say = (p, text) => messages.push({ playerId: p.id, text });
    const first = this.night === 1;
    const ORDER = this.script === 'snv' ? SNV_STEPS : MIX_STEPS;
    const steps = first ? ORDER.first : ORDER.other;
    const broken = (p) => this.snvBroken(p);
    // 能力本身给的信息：记下他今晚因自己的能力醒过（侍女用）；不知道自己能力的人只听到裸的结果
    const tell = (p, text, bare) => { if (!this.woke.includes(p.id)) this.woke.push(p.id); say(p, this.hidden(p) ? `说书人叫醒了你：${bare}` : text); };
    const pause = () => ({ messages: this.flushed ?? [], ravenkeeper: null, pause: this.midNight.who });
    if (mid?.rest?.length && this.midCheck(steps, mid.step - 1, mid.rest, messages)) return pause();

    for (let i = mid?.step ?? 0; i < steps.length; i++) {
      const step = steps[i];
      let changed = [];
      // 莽夫：这一步有人用自己的能力选中了他（先算，选他的人当晚就醉）
      if (this.players.some((q) => q.role === 'goon')) for (const p of this.holders(step)) for (const t of this.choiceOfSNV(p)?.targets ?? []) this.goonSNV(p, t, { assassin: step === 'assassin' });
      switch (step) {
        case 'philosopher': for (const p of this.holders('philosopher')) {
          const c = this.choiceOfSNV(p); if (!c?.role) continue;
          delete this.choices[p.id];
          this.record('choice', `${this.tag(p.id)} 选择获得 ${ROLES[c.role].name} 的能力`);
          p.gainedFake = broken(p);
          p.gained = c.role;
          if (p.gainedFake) this.flag(p, '哲学家选能力时失效，没有真正获得');
          say(p, `你获得了 **${ROLES[c.role].name}** 的能力。`);
          this.philSync();
          changed.push(p.id);
        } break;
        case 'pithag': for (const p of this.holders('pithag')) {
          const c = this.choiceOfSNV(p); const t = c?.targets[0]; if (!t || !c.role) continue;
          this.record('choice', `${this.tag(p.id)} 想把 ${this.tag(t.id)} 变成 ${ROLES[c.role].name}`);
          if (this.players.some((q) => q.role === c.role)) { this.record('st', `${ROLES[c.role].name} 已在场，无事发生`); continue; }
          if (broken(p)) { this.flag(p, '麻脸巫婆失效，没有变成'); continue; }
          const wasDemon = team(t) === 'demon';
          const old = this.demonsAlive().filter((q) => q.id !== t.id);
          this.changeRole(t, c.role);
          if (ROLES[c.role].team === 'demon') {
            this.pitNight = this.st.pitPlan(t, wasDemon, old);
          }
          say(t, `你变成了 **${ROLES[c.role].name}**。你的阵营没有变，你仍然是**${this.evilOf(t) ? '邪恶' : '善良'}**的。`);
          this.afterChange(say);
          changed.push(t.id);
        } break;
        case 'snakecharmer': for (const p of this.holders('snakecharmer')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (team(t) !== 'demon' || !t.alive) continue;
          if (broken(p)) { this.flag(p, '舞蛇人选中了恶魔，但失效了，没有交换'); continue; }
          this.record('st', `舞蛇人 ${this.tag(p.id)} 选中了恶魔 ${this.tag(t.id)}：互换角色和阵营`);
          const was = this.evilOf(p);
          this.swapRoles(p, t);
          p.evil = this.evilOf(t); t.evil = was;
          this.addFx('poison', t.id, null, 'never', '舞蛇人');
          say(p, `你选中了恶魔！**你现在是${ROLES[p.role].name}，属于${this.evilOf(p) ? '邪恶' : '善良'}阵营。**`);
          say(t, `舞蛇人选中了你。**你现在是${ROLES[t.role].name}，属于${this.evilOf(t) ? '邪恶' : '善良'}阵营**，并且中毒了。`);
          this.afterChange(say);
          changed.push(p.id);
        } break;
        case 'eviltwin': this.tellTwins(say); break;
        case 'witch': for (const p of this.holders('witch')) {
          if (this.aliveCount() <= 3) continue;
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          this.fx = this.fx.filter((f) => !(f.kind === 'curse' && f.source === p.id));
          if (broken(p)) this.curseFail = t.id;
          else this.addFx('curse', t.id, p.id, this.night, '女巫');
        } break;
        case 'cerenovus': for (const p of this.holders('cerenovus')) {
          const c = this.choiceOfSNV(p); const t = c?.targets[0]; if (!t || !c.role) continue;
          if (broken(p)) { this.flag(p, '洗脑师失效，目标没有疯狂'); continue; }
          this.madness[t.id] = { role: c.role, night: this.night, claimed: false, by: p.id };
          this.record('st', `洗脑师让 ${this.tag(t.id)} 疯狂证明自己是 ${ROLES[c.role].name}`);
          say(t, `洗脑师选中了你：**明天白天和夜晚，你要「疯狂」地证明自己是${ROLES[c.role].name}**，不然你可能被处决。`);
        } break;
        case 'widow': for (const p of this.holders('widow')) {
          if (this.used[p.id]) continue;
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          this.used[p.id] = true;
          this.record('choice', `寡妇 ${this.tag(p.id)} 选了 ${this.tag(t.id)}`);
          if (broken(p)) { this.flag(p, '寡妇失效，没有人中毒'); continue; }
          this.addFx('poison', t.id, p.id, 'never', '寡妇');
          const w = this.st.widowWitness(p);
          if (w) { say(w, '**寡妇在场。**（你不知道她是谁，也不知道谁中毒了。）'); this.record('info', `${this.tag(w.id)} 得知寡妇在场`); }
        } break;
        case 'sailor': for (const p of this.holders('sailor')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (broken(p)) { this.flag(p, '水手失效，没有人醉酒'); continue; }
          const who = t.id === p.id ? p : this.st.sailorDrunk(p, t);
          this.addFx('drunk', who.id, p.id, this.night, '水手');
        } break;
        case 'courtier': for (const p of this.holders('courtier')) {
          const c = this.choiceOfSNV(p); if (!c?.role) continue;
          this.used[p.id] = true;
          const hold = this.players.filter((q) => q.role === c.role);
          if (c.role === 'goon' && hold[0]) this.goonSNV(p, hold[0]);
          this.record('choice', `${this.tag(p.id)} 选择了角色 ${ROLES[c.role].name}`);
          if (broken(p)) { this.flag(p, '侍臣失效，没有人醉酒'); continue; }
          if (hold.length) this.addFx('drunk', pickOne(hold, this.rng).id, p.id, this.night + 2, '侍臣'); // 三天三夜
        } break;
        case 'gambler': for (const p of this.holders('gambler')) {
          const c = this.choiceOfSNV(p); const t = c?.targets[0]; if (!t || !c.role) continue;
          this.record('choice', `${this.tag(p.id)} 猜 ${this.tag(t.id)} 是${ROLES[c.role].name}`);
          if (broken(p)) continue;
          if (t.role !== c.role) this.snvKill(p, 'gambler', messages);
        } break;
        case 'devilsadvocate': for (const p of this.holders('devilsadvocate')) {
          const t = this.choiceOfSNV(p)?.targets[0];
          this.lastPick[p.id] = t?.id ?? null;
          if (!t) continue;
          this.fx = this.fx.filter((f) => !(f.kind === 'exeSafe' && f.source === p.id));
          if (broken(p)) this.flag(p, '魔鬼代言人失效'); else this.addFx('exeSafe', t.id, p.id, this.night, '魔鬼代言人');
        } break;
        case 'exorcist': for (const p of this.holders('exorcist')) {
          const t = this.choiceOfSNV(p)?.targets[0];
          this.lastPick[p.id] = t?.id ?? null;
          if (!t || broken(p) || team(t) !== 'demon' || !t.alive) continue;
          this.blocked = t.id;
          say(t, `驱魔人 **${this.name(p.id)}** 选中了你——你今晚不能行动。`);
          this.record('st', `驱魔人选中了恶魔 ${this.tag(t.id)}，恶魔今晚不能行动`);
        } break;
        case 'zombuul': for (const p of this.players.filter((q) => q.role === 'zombuul' && q.alive)) {
          if (this.blocked === p.id || this.diedToday) continue;
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (broken(p)) { if (t.alive) this.flag(p, '僵怖失效，没有杀死人'); continue; }
          this.demonHit(p, t, messages);
          if (this.midNight) return pause();
        } break;
        case 'shabaloth': for (const p of this.players.filter((q) => q.role === 'shabaloth' && q.alive)) {
          if (!broken(p)) { // 反刍：上一夜被选过、现在死了的人之一（说书人决定）
            const back = this.st.shabaRegurgitate(this.shabaLast.map((id) => this.get(id)).filter((q) => q && !q.alive));
            if (back) { this.snvRevive(back, '沙巴洛斯反刍'); changed.push(back.id); if (back.role === 'grandmother') this.grandmotherSNV(back, tell); }
          }
          if (this.blocked === p.id) { this.shabaLast = []; continue; }
          const ts = this.choiceOfSNV(p)?.targets ?? [];
          this.shabaLast = ts.map((q) => q.id);
          if (broken(p)) { if (ts.length) this.flag(p, '沙巴洛斯失效，没有杀死人'); continue; }
          for (const t of ts) this.demonHit(p, t, messages);
        } break;
        case 'po': for (const p of this.players.filter((q) => q.role === 'po' && q.alive)) {
          if (this.blocked === p.id) continue;
          const ts = this.choiceOfSNV(p)?.targets ?? [];
          if (!ts.length) { this.poCharged = true; this.record('st', '珀今晚没有选人——下次可以杀三人'); continue; }
          this.poCharged = false;
          if (broken(p)) { this.flag(p, '珀失效，没有杀死人'); continue; }
          for (const t of ts) this.demonHit(p, t, messages);
        } break;
        case 'assassin': for (const p of this.holders('assassin')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          this.used[p.id] = true;
          if (broken(p)) { this.flag(p, '刺客失效，没有杀死人'); continue; }
          this.snvKill(t, 'assassin', messages);
        } break;
        case 'godfatherInfo': for (const p of this.holders('godfather')) {
          const truth = this.players.filter((q) => team(q) === 'outsider').map((q) => q.role);
          const outs = this.lieMode(p) ? this.st.fakeOutsidersBMR(p, truth) : truth;
          tell(p, outs.length ? `在场的外来者：**${outs.map((r) => ROLES[r].name).join('、')}**。` : '场上**没有**外来者。', `你得知了几个角色：${outs.map((r) => ROLES[r].name).join('、') || '没有'}。`);
        } break;
        case 'godfather': for (const p of this.holders('godfather')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (broken(p)) { this.flag(p, '教父失效，没有杀死人'); continue; }
          this.snvKill(t, 'godfather', messages);
        } break;
        case 'professor': for (const p of this.holders('professor')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (t.alive) { this.record('st', `教授选的 ${this.tag(t.id)} 已经活着——不算用掉`); continue; }
          this.used[p.id] = true;
          if (broken(p) || team(t) !== 'townsfolk') { this.record('st', `教授选了 ${this.tag(t.id)}——没有复活`); if (broken(p)) this.flag(p, '教授失效'); continue; }
          this.snvRevive(t, '教授');
          changed.push(t.id);
          if (t.role === 'grandmother') this.grandmotherSNV(t, tell);
        } break;
        case 'gossip': {
          const gs = this.holders('gossip').find((q) => q.alive);
          if (this.gossipPending && gs && !broken(gs)) { const v = this.st.gossipVictim(); if (v) this.snvKill(v, 'gossip', messages); }
          this.gossipPending = false;
        } break;
        case 'tinker': for (const p of this.holders('tinker')) {
          if (p.alive && !broken(p) && this.st.tinkerDies(p)) this.snvKill(p, 'tinker', messages);
        } break;
        case 'moonchild': {
          const mc = this.moonchildPick;
          this.moonchildPick = null;
          const m = mc && this.get(mc.by);
          if (m && !broken(m) && mc.good) this.snvKill(this.get(mc.target), 'moonchild', messages);
        } break;
        case 'grandmother': for (const p of this.holders('grandmother')) this.grandmotherSNV(p, tell); break;
        case 'poisoner': for (const p of this.holders('poisoner')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (broken(p)) { this.flag(p, '投毒者失效，没有人中毒'); continue; }
          this.addFx('poison', t.id, p.id, this.night, '投毒者'); // 今晚和明天白天
        } break;
        case 'monk': for (const p of this.holders('monk')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (broken(p)) { this.flag(p, '僧侣失效，没有保护到人'); continue; }
          this.monkTarget = t.id;
          this.addFx('safe', t.id, p.id, 'dawn', '僧侣');
        } break;
        case 'innkeeper': for (const p of this.holders('innkeeper')) {
          const ts = this.choiceOfSNV(p)?.targets ?? []; if (ts.length !== 2) continue;
          if (broken(p)) { this.flag(p, '旅店老板失效，没有保护到人'); continue; }
          for (const t of ts) this.addFx('safe', t.id, p.id, 'dawn', '旅店老板');
          this.addFx('drunk', this.st.innkeeperDrunk(ts).id, p.id, this.night, '旅店老板'); // 醉酒到明天黄昏
        } break;
        case 'harpy': for (const p of this.holders('harpy')) {
          const ts = this.choiceOfSNV(p)?.targets ?? []; if (ts.length !== 2) continue;
          if (this.harpyMad?.by === p.id) this.harpyMad = null; // 上一次的疯狂到她这次选人为止
          if (broken(p)) { this.flag(p, '鹰身女妖失效，没有人疯狂'); continue; }
          const [a, b] = ts;
          this.harpyMad = { id: a.id, target: b.id, by: p.id, night: this.night, claimed: false };
          this.record('st', `鹰身女妖让 ${this.tag(a.id)} 疯狂地证明 ${this.tag(b.id)} 是邪恶的`);
          say(a, `鹰身女妖选中了你：**明天你要「疯狂」地证明 ${this.name(b.id)} 是邪恶的**，否则你们之中可能有人死亡。（行动面板里点「公开指认」）`);
        } break;
        case 'pukka':
          for (const d of this.pitNight?.kill?.splice(0) ?? []) this.snvDie(d, 'pithag', messages);
          for (const d of this.players.filter((q) => q.role === 'pukka' && q.alive)) {
            const prev = this.pukkaVictim ? this.get(this.pukkaVictim) : null;
            const t = this.blocked === d.id ? null : this.choiceOfSNV(d)?.targets[0];
            if (broken(d)) { if (t || prev) this.flag(d, '普卡失效：没有下毒，上一个中毒的人也没有死'); continue; } // 链条冻结
            if (t) this.addFx('poison', t.id, d.id, 'never', '普卡');
            // 选完之后，上一个中毒者死亡并恢复健康（死的那一刻还中着毒）；被保护就只恢复健康
            if (prev) {
              if (this.pitNight?.suppress) this.record('st', '今晚的死亡由说书人决定：普卡的毒没有毒死人');
              else this.demonHit(d, prev, messages);
              if (prev.id !== t?.id) this.fx = this.fx.filter((x) => !(x.kind === 'poison' && x.source === d.id && x.target === prev.id));
            }
            this.pukkaVictim = t?.id ?? null;
            if (this.midNight) return pause();
          } break;
        case 'washerwoman': case 'librarian': for (const p of this.holders(step)) {
          const kind = step === 'washerwoman' ? 'townsfolk' : 'outsider';
          const r = this.st.teamPairSNV(p, kind, this.lieMode(p));
          if (!r) { tell(p, kind === 'outsider' ? '场上**没有**外来者。' : '没有可以告诉你的信息。', '你得知：**没有**。'); continue; }
          const [a, b] = r.pair.map((q) => `**${this.name(q.id)}**`);
          tell(p, `${a} 与 ${b} 之中，有一人是 **${ROLES[r.role].name}**。`, `你看到了两名玩家 ${a}、${b} 和一个角色 **${ROLES[r.role].name}**。`);
        } break;
        case 'chef': for (const p of this.holders('chef')) {
          const n = this.players.length;
          const evil = this.players.map((q) => this.seenEvil(q, '厨师'));
          let pairs = 0;
          for (let i = 0; i < n; i++) if (evil[i] && evil[(i + 1) % n]) pairs++;
          const v = this.infoNumber(p, pairs, { min: 0, max: n }, (w) => this.players.reduce((k, q, i) => k + (w.evil.has(q.id) && w.evil.has(this.players[(i + 1) % n].id) ? 1 : 0), 0));
          tell(p, `场上有 **${v}** 对相邻的邪恶玩家。`, `你得知了一个数字：**${v}**。`);
        } break;
        case 'fortuneteller': for (const p of this.holders('fortuneteller')) {
          const ts = this.choiceOfSNV(p)?.targets ?? []; if (ts.length !== 2) continue;
          const truth = ts.some((q) => this.seenDemon(q, '占卜师') || q.id === this.redHerring);
          const yes = this.infoYes(p, truth, (w) => ts.some((q) => q.id === w.demon));
          tell(p, `${ts.map((q) => this.name(q.id)).join(' 与 ')} 之中${yes ? '**有**' : '**没有**'}恶魔。`, `你得知：**${yes ? '是' : '否'}**。`);
        } break;
        case 'undertaker': {
          const ex = this.lastExecuted && this.get(this.lastExecuted);
          if (!ex) break;
          for (const p of this.holders('undertaker')) {
            const lie = this.lieMode(p);
            const r = lie ? this.st.falseRoleSNV(p, ex, this.st.snvWorld(p, lie)) : this.seenRole(ex, '送葬者');
            tell(p, `今天被处决的 ${this.name(ex.id)} 是 **${ROLES[r].name}**。`, `你得知了一个角色：**${ROLES[r].name}**。`);
          }
        } break;
        case 'noble': for (const p of this.holders('noble')) {
          if (this.firstDone[`noble-${p.id}`]) continue;
          this.firstDone[`noble-${p.id}`] = true;
          const trio = this.st.nobleTrio(p, this.lieMode(p));
          if (!trio) continue;
          tell(p, `${trio.map((q) => `**${this.name(q.id)}**`).join('、')} 之中，有且只有一人是邪恶的。`, `你得知了三名玩家：${trio.map((q) => `**${this.name(q.id)}**`).join('、')}。`);
        } break;
        case 'shugenja': for (const p of this.holders('shugenja')) {
          if (this.firstDone[`shugenja-${p.id}`]) continue;
          this.firstDone[`shugenja-${p.id}`] = true;
          const side = this.st.shugenjaSide(p, this.lieMode(p));
          const word = side === 1 ? '顺时针' : '逆时针';
          tell(p, `离你最近的邪恶玩家在你的 **${word}** 方向（座位号${side === 1 ? '变大' : '变小'}的那一边）。`, `说书人指向了你的 **${word}** 方向。`);
        } break;
        case 'villageidiot': for (const p of this.holders('villageidiot')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          const evil = this.infoYes(p, this.seenEvil(t, '村夫'), (w) => w.evil.has(t.id));
          tell(p, `${this.name(t.id)} 是 **${evil ? '邪恶' : '善良'}** 的。`, `你得知：**${evil ? '是' : '否'}**。`);
        } break;
        case 'butler': for (const p of this.holders('butler')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (p.role === 'butler') this.butlerMaster = t.id;
          say(p, `你的主人是 ${this.name(t.id)}。明天只有他举手时你才能投票。`);
        } break;
        case 'spy': for (const p of this.holders('spy')) {
          if (broken(p)) this.flag(p, '间谍失效（魔典照看，说书人可以给他看错的）');
          say(p, `魔典（和说书人看到的一样）：\n${this.grimoire()}${this.bluffs?.length ? `\n恶魔拿到的伪装（不在场的角色）：${this.bluffs.map((r) => ROLES[r].name).join('、')}` : ''}`);
        } break;
        case 'farmer': for (const id of this.farmerDue.splice(0)) {
          const heir = this.st.farmerHeir(this.get(id));
          if (!heir) continue;
          this.changeRole(heir, 'farmer');
          this.afterChange(say);
          say(heir, '说书人叫醒了你：**你现在是农夫。**（你原来的能力没有了；阵营不变。）');
          this.record('st', `${this.name(heir.id)} 变成了农夫`);
        } break;
        case 'ravenkeeper': break; // 天亮前由房间层叫醒他选人（结算完返回 ravenkeeper）
        case 'investigator': for (const p of this.holders('investigator')) {
          const r = this.st.minionPair(p, this.lieMode(p));
          if (!r) { tell(p, '场上**没有**爪牙。', '你得知：**没有**。'); continue; }
          const [a, b] = r.pair.map((q) => `**${this.name(q.id)}**`);
          tell(p, `${a} 与 ${b} 之中，有一人是 **${ROLES[r.role].name}**。`, `你看到了两名玩家 ${a}、${b} 和一个角色 **${ROLES[r.role].name}**。`);
        } break;
        case 'empath': for (const p of this.holders('empath')) {
          const around = this.aliveNeighbours(p);
          const n = this.infoNumber(p, around.filter((q) => this.seenEvil(q, '共情者')).length, { min: 0, max: around.length }, (w) => around.filter((q) => w.evil.has(q.id)).length);
          tell(p, `你两侧的存活邻座中有 **${n}** 名邪恶玩家。`, `你得知了一个数字：**${n}**。`);
        } break;
        case 'amn_detect': for (const p of this.holders('amn_detect')) {
          const ts = this.choiceOfSNV(p)?.targets ?? []; if (ts.length !== 2) continue;
          const yes = this.infoYes(p, ts.some((q) => this.seenDemon(q, '恶魔探测')), (w) => ts.some((q) => q.id === w.demon));
          tell(p, `${ts.map((q) => this.name(q.id)).join(' 与 ')} 之中${yes ? '**有**' : '**没有**'}恶魔。`, `你得知：**${yes ? '是' : '否'}**。`);
        } break;
        case 'amn_echo': {
          const ex = this.lastExecuted && this.get(this.lastExecuted);
          if (!ex) break;
          for (const p of this.holders('amn_echo')) {
            const good = this.infoYes(p, !this.evilOf(ex), (w) => !w.evil.has(ex.id));
            tell(p, `今天被处决的 ${this.name(ex.id)} ${good ? '**是**' : '**不是**'}善良的。`, `你得知：**${good ? '是' : '否'}**。`);
          }
        } break;
        case 'balloonist': for (const p of this.holders('balloonist')) {
          const t = this.st.balloonPick(p, this.balloon[p.id] ?? null, this.lieMode(p));
          if (!t) continue;
          this.balloon[p.id] = team(t); // 失效时给的人类型可能一样：以后照给他看的人算（官方提示标记的做法）
          tell(p, `你得知了 **${this.name(t.id)}**。`, `说书人指了指 **${this.name(t.id)}**。`);
        } break;
        case 'chambermaid': for (const p of this.holders('chambermaid')) {
          const ts = this.choiceOfSNV(p)?.targets ?? []; if (ts.length !== 2) continue;
          // 今晚因自己的能力醒过：选过人的、已经拿过信息的，加上排在她后面一定会醒的数学家（官方相克）
          const woke = new Set([...this.woke, ...Object.keys(this.choices).filter((id) => this.active(this.get(id))), ...this.holders('mathematician').map((q) => q.id)]);
          const n = this.infoNumber(p, ts.filter((t) => woke.has(t.id)).length, { min: 0, max: 2 });
          tell(p, `${ts.map((t) => this.name(t.id)).join(' 与 ')} 之中，今晚有 **${n}** 人因自己的能力被唤醒。`, `你得知了一个数字：**${n}**。`);
        } break;
        case 'imp': case 'fanggu': case 'nodashii': case 'vortox': case 'vigormortis':
          for (const d of this.pitNight?.kill?.splice(0) ?? []) this.snvDie(d, 'pithag', messages); // 官方：麻脸巫婆顺序提前了，造成的死亡仍要等到第一个恶魔行动之前
          for (const p of this.players.filter((q) => q.role === step && q.alive)) {
            if (this.blocked === p.id) continue; // 被驱魔人选中
            const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
            if (broken(p)) { if (t.alive) this.flag(p, '恶魔失效，没有杀死人'); continue; }
            if (this.pitNight?.suppress) { this.record('st', '今晚的死亡由说书人决定：这一刀没有生效'); continue; }
            this.demonHit(p, t, messages);
            if (this.midNight) return pause();
          } break;
        case 'barber': {
          if (!this.barberDue) break;
          const d = mid?.barber ? this.get(mid.who) : this.st.barberDemon(this.demonsAlive()); // 暂停回来还是刚才那个恶魔，不重新抽
          if (!d) { this.barberDue = false; break; }
          if (!mid?.barber) {
            delete this.choices[d.id];
            this.midNight = { step: i, who: d.id, as: 'barber', messages: [], barber: true };
            this.flushed = messages.splice(0);
            return pause();
          }
          this.barberDue = false;
          const ts = this.choiceOfSNV(d)?.targets ?? [];
          delete this.choices[d.id];
          if (ts.length !== 2) { this.record('st', '恶魔放弃了理发师的交换'); break; }
          const [a, b] = ts;
          this.record('st', `理发师：恶魔交换了 ${this.tag(a.id)} 和 ${this.tag(b.id)} 的角色`);
          this.swapRoles(a, b);
          for (const q of [a, b]) say(q, `你的角色被换了：**你现在是${ROLES[q.role].name}**。阵营不变，你仍然是**${this.evilOf(q) ? '邪恶' : '善良'}**的。`);
          this.afterChange(say);
          changed = [a.id, b.id];
        } break;
        case 'sweetheart': break; // 死亡的那一刻就结算了
        case 'sage': {
          const h = this.sageHit; this.sageHit = null;
          if (!h) break;
          const p = this.get(h.sage);
          const lie = h.off || (this.isTownsfolk(p) && this.vortoxOn());
          if (lie) this.flag(p, '贤者没有得到恶魔');
          const [a, b] = this.st.sagePair(p, this.get(h.demon), lie, lie ? this.st.snvWorld(p, this.lieMode(p) ?? 'fake') : null);
          tell(p, `杀死你的恶魔是 **${this.name(a.id)}** 和 **${this.name(b.id)}** 中的一个。`, `你得知了两名玩家：**${this.name(a.id)}**、**${this.name(b.id)}**。`);
        } break;
        case 'clockmaker': for (const p of this.holders('clockmaker')) {
          if (this.firstDone[p.id]) continue;
          this.firstDone[p.id] = true;
          const n = this.infoNumber(p, this.clockDistance(), { min: 1, max: Math.floor(this.players.length / 2) }, (w) => this.worldClock(w));
          tell(p, `恶魔和最近的爪牙相隔 **${n}**。`, `你得知了一个数字：**${n}**。`);
        } break;
        case 'dreamer': for (const p of this.holders('dreamer')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          const lie = this.lieMode(p);
          if (lie) this.flag(p, '筑梦师的两个角色都是错的');
          const [good, evil] = this.st.dreamerRoles(t, !!lie, lie ? this.st.snvWorld(p, lie) : null);
          tell(p, `${this.name(t.id)} 是 **${ROLES[good].name}** 或 **${ROLES[evil].name}**。`, `你看到了两个角色：**${ROLES[good].name}**、**${ROLES[evil].name}**。`);
        } break;
        case 'flowergirl': for (const p of this.holders('flowergirl')) {
          const yes = this.infoYes(p, this.demonVoted, (w) => (this.dayVoters ?? []).includes(w.demon));
          tell(p, `今天白天${yes ? '**有**' : '**没有**'}恶魔投过票。`, `你得知：**${yes ? '是' : '否'}**。`);
        } break;
        case 'towncrier': for (const p of this.holders('towncrier')) {
          const yes = this.infoYes(p, this.minionNominated, (w) => [...this.nominators].some((id) => id !== w.demon && w.evil.has(id)));
          tell(p, `今天白天${yes ? '**有**' : '**没有**'}爪牙发起过提名。`, `你得知：**${yes ? '是' : '否'}**。`);
        } break;
        case 'oracle': for (const p of this.holders('oracle')) {
          const dead = this.players.filter((q) => !q.alive);
          const n = this.infoNumber(p, dead.filter((q) => this.seenEvil(q, '神谕者')).length, { min: 0, max: dead.length }, (w) => dead.filter((q) => w.evil.has(q.id)).length);
          tell(p, `死亡的玩家里有 **${n}** 名邪恶。`, `你得知了一个数字：**${n}**。`);
        } break;
        case 'seamstress': for (const p of this.holders('seamstress')) {
          const ts = this.choiceOfSNV(p)?.targets ?? []; if (ts.length !== 2) continue;
          this.used[p.id] = true;
          const same = this.seenEvil(ts[0], '女裁缝') === this.seenEvil(ts[1], '女裁缝');
          const yes = this.infoYes(p, same, (w) => w.evil.has(ts[0].id) === w.evil.has(ts[1].id));
          tell(p, `${ts.map((q) => this.name(q.id)).join(' 与 ')} ${yes ? '**是**' : '**不是**'}同一阵营。`, `你得知：**${yes ? '是' : '否'}**。`);
        } break;
        case 'juggler': for (const p of this.holders('juggler')) {
          const j = this.juggled[p.id];
          if (!j || j.day !== this.day) continue;
          delete this.juggled[p.id];
          const n = this.infoNumber(p, j.correct, { min: 0, max: j.count });
          tell(p, `你今天猜对了 **${n}** 个。`, `你得知了一个数字：**${n}**。`); // 一个都没猜时真相是 0，只有涡流会让他听到 1
        } break;
        case 'mathematician': for (const p of this.holders('mathematician')) {
          const truth = this.abnormal.filter((id) => id !== p.id).length;
          const n = this.infoNumber(p, truth, { min: 0, max: this.players.length });
          tell(p, `从上个黎明到现在，有 **${n}** 人的能力没有正常生效。`, `你得知了一个数字：**${n}**。`);
        } break;
        default: break;
      }
      if (this.midCheck(steps, i, changed, messages)) return pause();
    }
    if (this.pendingGoonNews) { const gn = this.get(this.pendingGoonNews); say(gn, `你的阵营变了——你现在是**${this.evilOf(gn) ? '邪恶' : '善良'}**的。`); }
    this.fx = this.fx.filter((f) => f.until !== 'dawn');
    this.lastExecuted = null;
    this.checkWinner();
    return { messages, ravenkeeper: this.rkDue && !this.winner ? this.rkDue : null };
  },

  /** 恶魔和最近爪牙的距离（死人也算）；没有恶魔或没有爪牙时是 0。 */
  /** 假世界里恶魔和最近的爪牙相隔几个座位。 */
  worldClock(w) {
    const n = this.players.length;
    const seat = (id) => this.get(id).seat;
    let best = 0;
    for (const id of w.evil) {
      if (id === w.demon) continue;
      const k = Math.abs(seat(w.demon) - seat(id));
      const dist = Math.min(k, n - k);
      if (!best || dist < best) best = dist;
    }
    return best;
  },
  clockDistance() {
    const n = this.players.length;
    const demons = this.players.filter((p) => team(p) === 'demon');
    const minions = this.players.filter((p) => team(p) === 'minion');
    let best = 0;
    for (const d of demons) for (const m of minions) {
      const k = Math.abs(d.seat - m.seat);
      const dist = Math.min(k, n - k);
      if (!best || dist < best) best = dist;
    }
    return best;
  },

  // ───────────────────────── 白天 ─────────────────────────
  dawnSNV() {
    this.diedToday = false;
    this.outsiderDiedToday = false;
    this.gossipSaid = {};
    this.pendingMoonchild = this.pendingMoonchild && !this.get(this.pendingMoonchild)?.alive ? this.pendingMoonchild : null;
    this.abnormal = [];
    this.demonVoted = false;
    this.minionNominated = false;
    this.dayVoters = [];
    for (const p of this.players) {
      if (this.abilityOf(p) === 'juggler' && this.jugglerDay[p.id] == null) this.jugglerDay[p.id] = this.day;
    }
    for (const [id, m] of Object.entries(this.madness)) {
      if (m.night < this.night) delete this.madness[id];                 // 昨天白天和昨晚的疯狂到今天黎明结束
      else if (!this.active(this.get(m.by))) delete this.madness[id];    // 洗脑师死了，疯狂解除
    }
  },

  /**
   * 贞洁者第一次被提名：提名者是镇民（间谍可能登记成镇民）就立即被处决。失效的贞洁者也用掉了这一次。
   * 返回被处决的人的 id，或 null。
   */
  virginSNV(a, b) {
    if (!this.has(b, 'virgin') || !b.alive || this.used[`virgin-${b.id}`] || !a.alive) return null;
    this.used[`virgin-${b.id}`] = true;
    if (!this.seenTownsfolk(a, '贞洁者被提名')) return null;
    if (this.snvBroken(b)) { this.flag(b, '贞洁者被镇民提名，但她失效了'); return null; }
    this.record('nominate', '贞洁者能力触发：提名者是镇民，立即被处决');
    this.executeSNV(a);
    return a.id;
  },

  /** 提名成立之后：城镇公告员记账；被诅咒的人当场死亡（提名照常进行）。 */
  nominateSNV(a) {
    if (team(a) === 'minion') this.minionNominated = true;
    if (this.curseFail === a.id) { this.curseFail = null; const w = this.players.find((q) => this.abilityOf(q) === 'witch'); if (w) this.flag(w, '诅咒没有生效'); }
    const cursed = this.fx.some((f) => f.kind === 'curse' && f.target === a.id && this.snvFxLive(f));
    if (!cursed || this.aliveCount() <= 3) return false;
    this.fx = this.fx.filter((f) => !(f.kind === 'curse' && f.target === a.id));
    this.snvDie(a, 'witch', this.dayMessages());
    this.checkWinner();
    return true;
  },

  /** 投票记账：死恶魔的幽灵票也算。 */
  voteSNV(voters) {
    if (voters.some((id) => team(this.get(id)) === 'demon')) this.demonVoted = true;
    this.dayVoters = [...new Set([...(this.dayVoters ?? []), ...voters])]; // 假世界要看假恶魔投没投
  },

  /**
   * 公开声明：谁都可以说自己是某个角色。这是 AI 说书人唯一能确定看到的"疯狂"依据（听不到语音）。
   * 被洗脑的人声明了要求的角色就算尽力了；畸形秀演员声明自己是外来者，可能被处决。
   * 返回 { text, mutant }：mutant 为真表示刚被处决（房间层要进黄昏）。
   */
  declare(uid, role, { auto = true } = {}) {
    if (this.phase !== 'day') throw new Error('只能在白天声明');
    const p = this.get(uid);
    if (!p) throw new Error('你不是这局的玩家');
    if (!ROLES[role] || !inScript(role, this.script)) throw new Error('选一个这个剧本里的角色');
    const d = this.declared[uid]?.day === this.day ? this.declared[uid] : { day: this.day, n: 0 };
    if (d.n >= MAX_DECLARES) throw new Error(`每天最多声明 ${MAX_DECLARES} 次`);
    d.n += 1; this.declared[uid] = d;
    this.claims[uid] = role;
    if (this.madness[uid]?.role === role) { this.madness[uid].claimed = true; this.record('st', `${this.tag(uid)} 公开声称自己是 ${ROLES[role].name}`); }
    const text = `我是${ROLES[role].name}`;
    if (this.abilityOf(p) !== 'mutant' || ROLES[role].team !== 'outsider' || !p.alive) return { text, mutant: false };
    if (this.snvBroken(p)) { this.flag(p, '畸形秀演员声称自己是外来者，但他失效了'); return { text, mutant: false }; }
    if (!auto) return { text, mutant: false, mutantClaim: true }; // 真人说书：要不要处决由说书人定
    if (!this.st.mutantExecuted(p)) return { text, mutant: false };
    if (this.executedToday) { this.madLater(uid, `声称自己是${ROLES[role].name}`); return { text, mutant: false }; }
    return { text, mutant: this.madExecute(uid, `声称自己是${ROLES[role].name}`) };
  },

  /** 这些人今天要判一下疯狂：洗脑师的目标里没声明的（claimed 为真时声明过的也算，要听收音）。死人也算：官方可以处决死人，白天的处决一样用掉。 */
  madnessDue({ claimed = false } = {}) {
    const on = (m) => { const by = this.get(m.by); return this.active(by) && !this.snvBroken(by); }; // 洗脑师白天死了或失效了，就不再因此处决
    return Object.entries(this.madness).filter(([id, m]) => (claimed || !m.claimed) && this.get(id) && m.night === this.night && on(m)).map(([id, m]) => ({ id, role: m.role, claimed: !!m.claimed }));
  },
  /** 没有依据时：说书人按局势决定罚不罚（"可能"被处决）。 */
  madnessPenalty(id, how) { return this.st.madnessPenalty(this.get(id), how); },
  /**
   * 判定为不够疯狂：处决。白天算当天的处决，处决死人也算（他不会再死一次）；
   * night 为真是夜里的处决：不占白天的名额，只对活人有意义。
   */
  madExecute(id, why, { night = false } = {}) {
    const p = this.get(id);
    if (!p || (night ? !p.alive : this.executedToday)) return false;
    this.record('st', `${this.tag(id)} 因疯狂被处决：${why}`);
    if (!night) {
      this.executedToday = true;
      if (p.alive) this.lastExecuted = id; // 处决死人不算"今天死于处决"：他也没有遗言时间
    }
    this.log.push(`${this.name(id)} 因疯狂被处决`);
    delete this.madness[id]; // 判过了，今天不再判
    this.afterExecution(p);
    return true;
  },
  /** 今天的处决已经占了：记下来，入夜时处决（房间层在黄昏结算后调 madExecute）。 */
  madLater(id, why) { (this.madNight ??= []).push({ id, why }); },

  /** 杂耍艺人的公开猜测。谁都可以假装猜（第一天）；只有真杂耍艺人在他的首个白天猜的才算。 */
  juggle(uid, guesses) {
    if (this.phase !== 'day') throw new Error('只能在白天猜');
    const p = this.get(uid);
    if (!p) throw new Error('你不是这局的玩家');
    const real = this.abilityOf(p) === 'juggler' && this.jugglerDay[uid] === this.day && p.alive;
    if (!real && this.day !== 1) throw new Error('只有第一天可以公开猜测');
    if (this.juggleLog?.[uid] === this.day) throw new Error('你今天已经猜过了');
    if (!Array.isArray(guesses) || guesses.length > JUGGLES) throw new Error(`最多猜 ${JUGGLES} 个`);
    const clean = guesses.map((x) => ({ t: this.get(x?.target), r: x?.role }));
    if (clean.some((x) => !x.t || !ROLES[x.r] || !inScript(x.r, this.script))) throw new Error('猜测不完整');
    (this.juggleLog ??= {})[uid] = this.day; // 记第几天：后来才变成杂耍艺人的人，在新身份的首个白天还能猜
    const correct = clean.filter((x) => x.t.role === x.r).length;
    if (real) this.juggled[uid] = { day: this.day, correct, count: clean.length };
    if (!clean.length) this.claims[uid] = 'juggler'; // 官方：声明自己是杂耍艺人但一个都不猜，当晚也有信息（0）
    this.record('st', `${this.tag(uid)} 公开猜测，猜对 ${correct} 个${real ? '' : '（不是杂耍艺人，没有效果）'}`);
    return { text: clean.map((x) => `${this.name(x.t.id)} 是${ROLES[x.r].name}`).join('；') };
  },

  /** 博学者每天问一次：一真一假；失效时可能两真或两假，涡流在场两条都假。 */
  savantAsk(uid) {
    if (this.phase !== 'day') throw new Error('只能在白天问');
    const p = this.get(uid);
    if (!p || !p.alive || this.abilityOf(p) !== 'savant') throw new Error('只有博学者可以这样问');
    if (this.savantDay[uid] === this.day) throw new Error('你今天已经问过了');
    this.savantDay[uid] = this.day;
    const lie = this.lieMode(p);
    if (lie) this.flag(p, '博学者的两条信息不是一真一假');
    const lines = this.st.savantLines(p, lie);
    this.record('info', `${this.tag(uid)}${lie ? '【能力失效】' : ''} 问了说书人：${lines.join('；')}`);
    return { lines };
  },

  /** 艺术家提问前的检查：每局一次，问了就算用掉。 */
  artistAsk(uid, raw) {
    if (this.phase !== 'day') throw new Error('只能在白天提问');
    const p = this.get(uid);
    if (!p || !p.alive || this.abilityOf(p) !== 'artist') throw new Error('只有艺术家可以这样问');
    if (this.used[uid]) throw new Error('你已经问过了');
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('问题不能是空的');
    if ([...text].length > 120) throw new Error('问题太长了（最多 120 字）');
    this.used[uid] = true;
    this.record('st', `艺术家 ${this.tag(uid)} 提问：${text}`);
    return { text };
  },
  /** 艺术家的答案：判出来的真假按失效和涡流翻转（"我不知道"不翻）。 */
  artistAnswer(uid, verdict) {
    const p = this.get(uid);
    const lie = this.lieMode(p);
    if (verdict === 'unknown' || !lie) return verdict;
    this.flag(p, '艺术家得到了相反的答案');
    return verdict === 'true' ? 'false' : 'true';
  },

  /**
   * 被提名的人公开声明自己是哥布林（谁都可以这么说）。真哥布林、没失效时记下来：今天被处决，他的阵营获胜。
   * 时机（被提名后、投票前）由房间层把关。
   */
  goblinClaim(uid) {
    if (this.phase !== 'day') throw new Error('只能在白天声明');
    const p = this.get(uid);
    if (!p) throw new Error('你不是这局的玩家');
    this.claims[uid] = 'goblin';
    const real = this.abilityOf(p) === 'goblin' && p.alive;
    if (real && this.snvBroken(p)) this.flag(p, '哥布林声明身份时失效');
    else if (real) this.goblinMark = { id: uid, day: this.day };
    this.record('st', `${this.tag(uid)} 被提名后公开声明自己是哥布林${real ? '' : '（不是哥布林，没有效果）'}`);
  },

  /**
   * 开枪（猎手的能力；这两个小剧本里只有猜中了能力的失忆者有）。谁都可以声称开枪，每人每局一次；
   * 只有真拿着猎手能力、没失效、第一次开，打中存活的恶魔才会死。
   */
  slaySNV(s, t) {
    if (this.phase !== 'day') throw new Error('只能在白天开枪');
    this.shooters ??= [];
    if (this.shooters.includes(s.id)) throw new Error('你这局已经开过枪了');
    this.shooters.push(s.id);
    let hit = false;
    const kind = GUNS[this.abilityOf(s)] ?? (this.extraAbility(s) === 'slayer' ? 'demon' : null);
    if (kind && s.alive && !this.used[`slay-${s.id}`]) {
      this.used[`slay-${s.id}`] = true;
      const target = kind === 'anyone' || (kind === 'evil' ? this.evilOf(t) : this.seenDemon(t, '猎手开枪'));
      if (this.snvBroken(s)) { if (target) this.flag(s, '枪失效了，打中也没有效果'); } else if (t.alive && target) hit = true;
    }
    this.log.push(`${this.name(s.id)} 对 ${this.name(t.id)} 开枪 → ${hit ? '命中' : '无事发生'}`);
    this.record('slay', `${this.tag(s.id)} 向 ${this.tag(t.id)} 开枪 → ${hit ? '命中' : '无事发生'}`);
    if (hit) { this.snvDie(t, 'slayer', this.dayMessages()); this.checkWinner(); }
    return { hit };
  },

  /** 特赦（失忆者的原创能力）：台上的人走下来，今天不再处决任何人。失效时什么也不发生。返回 { who: 台上的人, worked } */
  pardon(uid) {
    if (this.phase !== 'day') throw new Error('只能在白天特赦');
    const p = this.get(uid);
    if (!p?.alive || this.abilityOf(p) !== 'amn_pardon') throw new Error('你没有这个能力');
    if (this.used[`pardon-${uid}`]) throw new Error('你已经特赦过了');
    if (!this.block) throw new Error('处决台上没有人');
    this.used[`pardon-${uid}`] = true;
    const who = this.block;
    if (this.snvBroken(p)) { this.flag(p, '特赦失效'); this.record('st', `${this.tag(uid)} 特赦 ${this.tag(who)}：失效，没有效果`); return { who, worked: false }; }
    this.block = null; this.blockVotes = 0; this.blockTied = [];
    this.pardonDay = this.day;
    this.record('st', `${this.tag(uid)} 特赦了台上的 ${this.tag(who)}：今天不再处决`);
    return { who, worked: true };
  },

  /** 渔夫每局一次请教说书人。返回失效情况（失效时说书人可以给坏建议），建议由房间层生成。 */
  fishermanAsk(uid) {
    if (this.phase !== 'day') throw new Error('只能在白天请教');
    const p = this.get(uid);
    if (!p || !p.alive || this.abilityOf(p) !== 'fisherman') throw new Error('只有渔夫可以这样问');
    if (this.used[`fish-${uid}`]) throw new Error('你已经问过了');
    this.used[`fish-${uid}`] = true;
    const lie = this.lieMode(p);
    if (lie) this.flag(p, '渔夫失效，建议可能是坏的');
    return { lie };
  },

  /** 失忆者每天猜一次自己的能力。返回他真正的能力和失效情况，答案（无关/有关/接近/完美）由房间层判。 */
  amnesiacGuess(uid, raw) {
    if (this.phase !== 'day') throw new Error('只能在白天猜');
    const p = this.get(uid);
    if (!p || !p.alive || p.role !== 'amnesiac') throw new Error('只有失忆者可以这样猜');
    if (this.amnesiacDay[uid] === this.day) throw new Error('你今天已经猜过了');
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('猜测不能是空的');
    if ([...text].length > 120) throw new Error('太长了（最多 120 字）');
    this.amnesiacDay[uid] = this.day;
    this.record('st', `失忆者 ${this.tag(uid)} 猜自己的能力：${text}`);
    return { text, ability: p.gained, lie: this.lieMode(p) };
  },

  /** 呆瓜得知自己死亡后公开选一名存活的玩家。 */
  klutzChoose(uid, targetId) {
    if (this.phase !== 'day' && !this.klutzNow) throw new Error('天亮以后再选');
    if (this.pendingKlutz !== uid) throw new Error('现在不需要你选人');
    const t = this.get(targetId);
    if (!t || !t.alive) throw new Error('要选一名存活的玩家');
    const p = this.get(uid);
    this.pendingKlutz = this.klutzQueue?.shift() ?? null;
    this.klutzNow = false;
    this.record('choice', `呆瓜 ${this.tag(uid)} 选了 ${this.tag(t.id)}（${this.evilOf(t) ? '邪恶' : '善良'}）`);
    if (!this.evilOf(t)) return;
    if (this.snvBroken(p)) { this.flag(p, '呆瓜选中了邪恶，但他失效了'); return; }
    if (this.evilOf(p)) this.setWinner('good', `邪恶的呆瓜 ${this.name(uid)} 选中了邪恶玩家`);
    else this.setWinner('evil', `呆瓜 ${this.name(uid)} 选中了邪恶玩家`);
  },

  /** 处决带来的结果（普通处决和疯狂处决共用）。 */
  afterExecution(p) {
    const goodTwin = this.twinGoodId();
    const on = this.twinOn();
    // 利维坦：处决了就算（死人、没死都算），看的是被处决那一刻的阵营；同一个人只算一次
    const levi = this.leviOn() && !this.evilOf(p) && !this.leviGood.includes(p.id);
    if (levi) { this.leviGood.push(p.id); this.record('st', `利维坦在场：第 ${this.leviGood.length} 名善良玩家被处决`); }
    const gob = this.goblinMark?.id === p.id && this.goblinMark.day === this.day;
    const saint = this.has(p, 'saint') && p.alive && !this.snvBroken(p);
    const boom = this.has(p, 'boomdandy') && p.alive && !this.snvBroken(p);
    const res = this.snvKill(p, 'execution', this.dayMessages());
    if (res === 'died' && saint) this.setWinner(this.evilOf(p) ? 'good' : 'evil', `圣徒 ${this.name(p.id)} 被处决`);
    if (res === 'died' && boom && !this.winner) this.boomStart(p);
    if (res === 'died' && team(p) === 'minion') { // 吟游诗人：爪牙死于处决，除他以外所有人醉酒到明天黄昏
      const min = this.holders('minstrel').find((q) => q.alive && !this.snvBroken(q));
      if (min) { for (const q of this.players) if (q.id !== min.id) this.fx.push({ kind: 'drunk', target: q.id, source: min.id, until: this.day + 1, why: '吟游诗人' }); this.record('st', '爪牙死于处决：除吟游诗人外所有人醉酒，直到明天黄昏'); }
    }
    if (this.mastermindDay === this.day) this.setWinner(this.evilOf(p) ? 'good' : 'evil', `主谋的额外一天：被处决的 ${this.name(p.id)} 是${this.evilOf(p) ? '邪恶' : '善良'}的`);
    if (gob) this.setWinner(this.evilOf(p) ? 'evil' : 'good', `哥布林 ${this.name(p.id)} 被提名后公开了身份，仍被处决`);
    if (levi && this.leviGood.length > 1) this.setWinner('evil', '利维坦在场，第二名善良玩家被处决');
    if (p.id === goodTwin) {
      if (on) this.setWinner('evil', `善良的双子 ${this.name(p.id)} 被处决`);
      else if (this.twin) this.flag(this.get(this.twin.a), '善良的双子被处决，但镜像双子失效了');
    }
    this.checkWinner();
    return res;
  },

  executeSNV(p) {
    this.executedToday = true;
    this.lastExecuted = p.id;
    this.log.push(`${this.name(p.id)} 被处决`);
    return this.afterExecution(p);
  },

  endDaySNV() {
    let executed = null; let result = null;
    if (this.pendingMoonchild) { // 月之子拖到黄昏还没选：替他随机选一名存活玩家
      const opts = this.players.filter((q) => this.visAlive(q) && q.id !== this.pendingMoonchild);
      if (opts.length) this.moonchildChoose(this.pendingMoonchild, pickOne(opts, this.rng).id); else this.pendingMoonchild = null;
    }
    if (!this.winner && !this.executedToday && this.block && this.pardonDay !== this.day) {
      executed = this.block;
      result = this.executeSNV(this.get(executed));
    }
    if (!this.winner && this.mastermindDay === this.day) this.setWinner('good', '主谋的额外一天没有处决任何人，善良获胜');
    if (!this.winner && !this.executedToday && this.vortoxOn()) this.setWinner('evil', '涡流在场，今天没有人被处决');
    if (!this.winner && !this.executedToday && this.aliveCount() === 3) {
      const mayor = this.holders('mayor').find((q) => q.alive && !this.snvBroken(q));
      if (mayor) this.setWinner(this.evilOf(mayor) ? 'evil' : 'good', `只剩三人且无人被处决，镇长 ${this.name(mayor.id)} 带领${this.evilOf(mayor) ? '邪恶' : '善良'}获胜`);
    }
    const harpyDead = this.winner ? [] : this.harpyPenalty();
    if (!this.winner && this.day >= 5 && this.leviOn()) this.setWinner('evil', `第 ${this.day} 个白天结束，利维坦获胜`);
    this.fx = this.fx.filter((f) => !(typeof f.until === 'number' && f.until <= this.day));
    this.curseFail = null;
    return { executed, result, harpyDead };
  },

  /** 鹰身女妖：今天的疯狂没做到（没有公开指认），说书人可以杀死其中一人或两人。黄昏时判。返回死了的人的 id。 */
  harpyPenalty() {
    const h = this.harpyMad;
    if (!h || h.claimed || h.night !== this.night) return [];
    const by = this.get(h.by);
    if (!this.active(by) || this.snvBroken(by)) return [];
    h.claimed = true; // 判过了
    const dead = this.st.harpyVictims(this.get(h.id), this.get(h.target));
    for (const q of dead) this.snvDie(q, 'harpy', this.dayMessages());
    if (dead.length) this.checkWinner();
    return dead.map((q) => q.id);
  },

  /** 被鹰身女妖弄疯的人公开说第二名玩家是邪恶的（这就算疯狂地证明了；别人也可以照样说，没有效果）。 */
  harpyClaim(uid) {
    if (this.phase !== 'day') throw new Error('只能在白天说');
    const h = this.harpyMad;
    if (!h || h.id !== uid || h.night !== this.night) throw new Error('你今天不需要这样说');
    if (h.claimed) throw new Error('你已经说过了');
    h.claimed = true;
    this.record('st', `${this.tag(uid)} 公开说 ${this.tag(h.target)} 是邪恶的（鹰身女妖的疯狂）`);
    return { target: h.target };
  },

  /**
   * 落难少女：爪牙公开猜谁是落难少女。谁都可以这么说（诈身份），每人每局一次；
   * 只有真爪牙（还有能力）的第一次猜测算数，猜错了爪牙就再没有机会。猜中、落难少女没失效：她的阵营落败。
   */
  damselGuess(uid, targetId) {
    if (this.phase !== 'day') throw new Error('只能在白天猜');
    const p = this.get(uid); const t = this.get(targetId);
    if (!p || !t) throw new Error('玩家不在游戏中');
    if (this.damselTried[uid]) throw new Error('你已经猜过了');
    this.damselTried[uid] = true;
    const real = team(p) === 'minion' && this.active(p) && !this.damselGuessed;
    if (real) this.damselGuessed = true;
    const hit = real && t.role === 'damsel';
    this.record('st', `${this.tag(uid)} 公开猜 ${this.tag(targetId)} 是落难少女${real ? (hit ? '：猜中了' : '：猜错了，爪牙再没有机会') : '（不是爪牙或已经猜过，没有效果）'}`);
    if (hit) {
      if (this.snvBroken(t)) this.flag(t, '落难少女被猜中，但她失效了');
      else this.setWinner(this.evilOf(t) ? 'good' : 'evil', `爪牙 ${this.name(uid)} 猜中了落难少女 ${this.name(targetId)}`);
    }
    return { hit: hit && !!this.winner };
  },

  /** 炸弹人被处决：留下包括恶魔在内的三名存活玩家，其余全部死亡；然后倒数，被最多人指着的那个死亡。 */
  boomStart(p) {
    const keep = new Set(this.st.boomSurvivors().map((q) => q.id));
    this.record('death', `炸弹人 ${this.tag(p.id)} 引爆了炸弹`);
    for (const q of this.alive().filter((x) => !keep.has(x.id))) this.snvDie(q, 'boomdandy', this.dayMessages());
    this.boom = { day: this.day, alive: [...keep], points: {} };
    this.checkWinner();
  },
  /** 倒数时指人：每名玩家（死人也行）指一名存活的玩家，可以改。 */
  boomPoint(uid, targetId) {
    if (!this.boom || this.boom.day !== this.day) throw new Error('现在不用指人');
    if (!this.get(uid)) throw new Error('你不是这局的玩家');
    if (!this.boom.alive.includes(targetId) || !this.get(targetId)?.alive) throw new Error('要指一名存活的玩家');
    this.boom.points[uid] = targetId;
  },
  /** 倒数结束：被最多人指着的存活玩家死亡；平票就没人死，直接入夜（官方）。返回死了的人的 id 或 null。 */
  boomResolve() {
    const b = this.boom;
    if (!b) return null;
    this.boom = null;
    const count = {};
    for (const t of Object.values(b.points)) if (this.get(t)?.alive) count[t] = (count[t] ?? 0) + 1;
    const top = Math.max(0, ...Object.values(count));
    const who = Object.keys(count).filter((id) => count[id] === top);
    this.record('vote', `炸弹人倒数：${Object.entries(b.points).map(([a, t]) => `${this.name(a)}→${this.name(t)}`).join('，') || '没有人指'}`);
    if (!top || who.length !== 1) { this.record('st', '炸弹人倒数平票：没有人死亡'); return null; }
    this.snvDie(this.get(who[0]), 'boomdandy', this.dayMessages());
    this.checkWinner();
    return who[0];
  },

  checkWinnerSNV() {
    if (this.winner) return this.winner;
    if (this.mastermindDay != null) return null; // 主谋的额外一夜一天：胜负在那天黄昏定
    const noDemon = !this.demonsAlive().length;
    const mm = noDemon && this.demonExecuted && this.holders('mastermind').find((q) => q.alive && !this.snvBroken(q));
    if (mm) { this.mastermindDay = this.day + 1; this.record('st', '恶魔死于处决，但主谋还活着：额外进行一个夜晚和一个白天'); return null; }
    if (noDemon && !this.twinBlocks()) this.setWinner('good', '恶魔已经死亡');
    else if (this.aliveCount() <= 2) this.setWinner('evil', noDemon ? '恶魔已死，但双子挡着善良，只剩两名存活玩家，邪恶获胜' : '只剩两名存活玩家，恶魔获胜'); // 官方：邪恶的胜利条件只看人数，不看恶魔死活
    return this.winner;
  },

  /** 给 AI 判定用的整局真实情况。 */
  factsSNV() {
    const TEAM = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };
    const ppl = this.players.map((q) => `${q.seat}号 ${q.name}：${ROLES[q.role].name}（${TEAM[team(q)]}${q.gained ? `，获得了${ROLES[q.gained].name}的能力` : ''}），${this.evilOf(q) ? '邪恶' : '善良'}阵营，${q.alive ? '存活' : '已死亡'}`);
    const tl = this.timeline.map((e) => `[${e.when}] ${e.text}`);
    return [`剧本：${SCRIPTS[this.script].name}。现在是第 ${this.day} 天白天，共 ${this.players.length} 名玩家。`, '玩家：', ...ppl, '', '复盘时间线（到现在为止）：', ...tl].join('\n');
  },
};
