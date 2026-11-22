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

import { ROLES, rolesOf, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, isEvilRole, SCRIPTS, inScript, playersOf, ST_NOMINEE } from './roles.js';
import { SNV_STEPS, MIX_STEPS } from '../shared/nightOrder.js';
import { worldTeam } from './storyteller.js';

const team = (p) => ROLES[p.role].team;
const shuffle = (arr, rng) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (arr, n, rng) => shuffle(arr, rng).slice(0, n);
const pickOne = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const listsOf = (script) => ({ tf: rolesOf(script, 'townsfolk'), out: rolesOf(script, 'outsider'), min: rolesOf(script, 'minion'), dem: rolesOf(script, 'demon') });
const T = listsOf('snv');
const goodOf = (script) => { const l = listsOf(script); return [...l.tf, ...l.out]; };
/**
 * 失忆者的隐藏能力从这里挑：这套引擎能结算的镇民能力（官方：可以是任何现有能力，最好慢慢猜得出来）。不在场的优先。
 * · 夜里有动静的：醒来拿到裸的结果，慢慢猜。钟表匠只有首夜一条，女裁缝每局一次，难猜一点。
 * · 白天要自己去用的（猎手的枪、博学者、艺术家、渔夫、特赦）：猜中前也能去试（官方：「将那名玩家视作具有该能力一样」），
 *   试中了照常生效，试错了什么也不发生（和食人族一样）。
 * 官方要「让这一能力容易被猜测」，推荐夜里能察觉到的能力：白天的那几个难猜，抽中的机会压低（DAY_SHARE）。
 * 不放被动的（贤者、士兵）和会换角色的（舞蛇人、哲学家）。
 * 也不放一看信息就知道是什么能力的（2026-11-21 用户：失忆者直接报「6、3 号里有哥布林」，都不用猜了）：
 * 调查员（两个人 + 一个爪牙角色）、筑梦师（选一人看到一善一恶两个角色）。官方要「随着时间的推移逐渐弄清楚」，裸信息得有好几种解释。
 */
export const AMNESIAC_POOL = ['empath', 'chambermaid', 'flowergirl', 'towncrier', 'oracle', 'mathematician', 'clockmaker', 'seamstress', 'balloonist',
  'slayer', 'savant', 'artist', 'fisherman',
  'amn_gun', 'amn_judge', 'amn_pardon', 'amn_detect', 'amn_echo']; // 最后一行是失忆者专用的原创变种（roles.js 的 AMNESIAC_ONLY）
export const AMNESIAC_DAY = new Set(['slayer', 'savant', 'artist', 'fisherman', 'amn_gun', 'amn_judge', 'amn_pardon']);
const DAY_SHARE = 0.2; // 失忆者拿到白天能力的机会（以前按个数均分，20 个里 7 个是白天的，约 35%）
/** 开枪类能力：打中什么人才会死。 */
const GUNS = { slayer: 'demon', amn_gun: 'anyone', amn_judge: 'evil' };
const JUGGLES = 5;
export const MAX_DECLARES = 2; // 每人每天公开声明几次（免得刷屏）

/** 恶魔的 3 个伪装：官方《规则概要》「最佳的方案通常是向恶魔展示两个镇民标记和一个外来者标记」，没有不在场的外来者时给三个镇民。 */
export function pickBluffsSNV(exclude, rng, script = 'snv') {
  const L = listsOf(script);
  const tf = shuffle(L.tf.filter((r) => !exclude.has(r)), rng);
  const out = shuffle(L.out.filter((r) => !exclude.has(r)), rng);
  const k = out.length && tf.length >= 2 ? 1 : 0;
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

/**
 * 夜半狂欢的恶魔开关（2026-11-19 用户）：抽到亡骨魔就换成小怪宝或利维坦。
 * 亡骨魔是 [-1 外来者]，换掉以后补回一个外来者（随机一个镇民换成不在场的外来者）；
 * 小怪宝没有恶魔玩家：恶魔的位置换成一个不在场的爪牙（[+1 爪牙]）。fixed：房主指定了角色的座位，不动。
 */
export function swapMoDemon(roles, swap, rng, fixed = new Set()) {
  const i = roles.indexOf('vigormortis');
  if (!swap || swap === 'vigormortis' || i < 0 || fixed.has(i)) return roles;
  const out = [...roles];
  const inPlay = new Set(out);
  if (swap === 'leviathan') out[i] = 'leviathan';
  else {
    const free = rolesOf('mo', 'minion').filter((r) => !inPlay.has(r));
    if (!free.length) return roles;
    out[i] = pickOne(free, rng);
  }
  const outs = rolesOf('mo', 'outsider').filter((r) => !inPlay.has(r));
  const tfs = out.map((r, k) => [r, k]).filter(([r, k]) => ROLES[r].team === 'townsfolk' && !fixed.has(k) && !['atheist', 'huntsman'].includes(r));
  if (outs.length && tfs.length) out[pickOne(tfs, rng)[1]] = pickOne(outs, rng);
  return out;
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
  if (towns.includes('balloonist') && towns.length > 1 && o < out.length && rng() < 0.5) { // 只剩气球驾驶员一个镇民时没人可换
    const drop = pickOne(towns.filter((r) => r !== 'balloonist'), rng);
    towns = towns.filter((r) => r !== drop); o += 1;
  }
  return shuffle([...towns, ...sample(out, o, rng), ...minions, demon], rng);
}

/** 无神论者局占多少（官方：无神论者是说书人决定放不放的角色）。放了就没有邪恶角色，说书人假装有。 */
export const ATHEIST_SHARE = 0.15;

/** 哨兵（传奇角色）：外来者可能多一个或少一个（三分之一多、三分之一少、三分之一照常）。 */
function sentinelShift(script, t, o, outMax, rng) {
  if (!SCRIPTS[script]?.sentinel) return [t, o];
  const r = rng();
  if (r < 1 / 3 && o < outMax && t > 1) return [t - 1, o + 1];
  if (r < 2 / 3 && o > 0) return [t + 1, o - 1];
  return [t, o];
}

/** 裁缝与暴乱：人数照标准表，爪牙和恶魔的位置全是暴乱，其余全是女裁缝（官方 v1：爪牙标记换成暴乱标记）。 */
export function rollRiot(n, rng) {
  if (!DISTRIBUTION[n]) throw new Error(`人数需在 ${MIN_PLAYERS}–${MAX_PLAYERS} 之间`);
  const [, , m] = DISTRIBUTION[n];
  return shuffle([...Array(n - m - 1).fill('seamstress'), ...Array(m + 1).fill('riot')], rng);
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
  let out = L.out.filter(ok);
  // 无神论者局：没有爪牙和恶魔，空出来的位置补镇民（官方：拿掉邪恶角色，补上镇民或外来者）
  if (L.tf.includes('atheist') && ok('atheist') && rng() < ATHEIST_SHARE) {
    [t, o] = sentinelShift(script, t + m + 1, o, out.length, rng);
    if (o > out.length) { t += o - out.length; o = out.length; }
    const towns = ['atheist', ...sample(L.tf.filter((r) => ok(r) && r !== 'atheist'), t - 1, rng)];
    const outs = sample(out, o, rng);
    if (towns.includes('huntsman') && out.includes('damsel') && !outs.includes('damsel') && outs.length) outs[Math.floor(rng() * outs.length)] = 'damsel';
    return shuffle([...towns, ...outs], rng);
  }
  const tfPool = L.tf.filter((r) => ok(r) && r !== 'atheist'); // 不是无神论者局：无神论者不发（可以被酒鬼以为、被邪恶拿来伪装）
  const minions = sample(L.min.filter(ok), m, rng);
  const demon = pickOne(L.dem.filter(ok), rng);
  if (demon === 'lleech') out = out.filter((r) => r !== 'heretic'); // 官方相克：痢蛭和异端分子只能有一个在场
  if (minions.includes('baron')) { const add = Math.max(0, Math.min(2, out.length - o)); t -= add; o += add; }
  if (minions.includes('godfather')) { if (o === 0 || (o < out.length && rng() < 0.5)) { t -= 1; o += 1; } else { t += 1; o -= 1; } }
  [t, o] = demonShift(demon, t, o);
  [t, o] = sentinelShift(script, t, o, out.length, rng);
  if (o > out.length) { t += o - out.length; o = out.length; }
  let towns = sample(tfPool, t, rng);
  if (towns.includes('balloonist') && towns.length > 1 && o < out.length && rng() < 0.5) { // 只剩气球驾驶员一个镇民时没人可换
    const drop = pickOne(towns.filter((r) => r !== 'balloonist'), rng);
    towns = towns.filter((r) => r !== drop); o += 1;
  }
  if (towns.includes('villageidiot')) {
    const extra = Math.min(Math.floor(rng() * 3), towns.length - 1);
    const swap = sample(towns.filter((r) => r !== 'villageidiot'), extra, rng);
    towns = [...towns.filter((r) => !swap.includes(r)), ...swap.map(() => 'villageidiot')];
  }
  let outs = sample(out, o, rng);
  // 巡山人 [+落难少女]：落难少女一定在场（外来者有空位就换进来，没有就占一个镇民的位置）
  if (towns.includes('huntsman') && out.includes('damsel') && !outs.includes('damsel')) {
    if (outs.length) outs[Math.floor(rng() * outs.length)] = 'damsel';
    else if (towns.length > 1) { const drop = pickOne(towns.filter((r) => r !== 'huntsman'), rng); towns = towns.filter((r) => r !== drop); outs = ['damsel']; }
  }
  return shuffle([...towns, ...outs, ...minions, demon], rng);
}

/**
 * 科学怪人能给恶魔的能力：不在场的善良角色，而且是这套引擎能结算、恶魔不用再多醒一次去选人的（我们的夜里每人只有一个选人面板）。
 * 官方能给任何不在场的善良角色（不能给酒鬼等几个），这里只挑被动的和自动拿信息的。
 */
/** 灵言师的关键词：平时聊天不太会说、但能想办法引人说出口的词（官方建议用生僻词）。 */
// 灵言师的关键词（2026-11-19 用户：太难了，加难度设置、默认简单）。集石百科没有官方词库，只说「选绝对不会被无意说出的非常见词语」。
// 简单：日常话题词，灵言师可以借闲聊把话题带过去（避开游戏里本来就常说的词：夜晚、投票、处决、死、睡觉……）
export const MEZ_WORDS_EASY = ['下雨', '月亮', '生日', '蛋糕', '足球', '火锅', '咖啡', '猫咪', '周末', '旅游', '奶茶', '电影', '冰淇淋', '跑步', '雪人',
  '游泳', '饺子', '西瓜', '烧烤', '早餐', '小狗', '海边', '唱歌', '巧克力', '红包', '春节', '彩虹', '面条', '篮球', '动物园'];
// 普通：不常见的具体名词，聊血染时几乎不会碰上（官方口径；比官方范例「君士坦丁堡」好认，语音转写认得准）
export const MEZ_WORDS = ['琥珀', '灯塔', '狐狸', '樱桃', '风筝', '珊瑚', '萤火虫', '冰糖', '望远镜', '海螺', '蒲公英', '雪橇', '石榴', '鹦鹉', '指南针', '薄荷',
  '仙人掌', '火烈鸟', '万花筒', '橄榄', '企鹅', '彩虹', '棉花糖', '向日葵', '水晶球', '松鼠', '秋千', '柠檬', '热气球', '章鱼'];

export const BOFFIN_POOL = ['empath', 'oracle', 'noble', 'shugenja', 'librarian', 'washerwoman', 'investigator', 'chef', 'balloonist', 'undertaker',
  'clockmaker', 'flowergirl', 'towncrier', 'mathematician', 'soldier', 'mayor', 'slayer', 'savant', 'fisherman'];
/** 恶魔拿到也能拿来证明自己的：信息具体、别人能核对（士兵、镇长、杀手、博学者、渔夫这类恶魔拿了也证明不了什么）。 */
const BOFFIN_PROOF = new Set(['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'noble', 'clockmaker', 'undertaker', 'oracle', 'flowergirl', 'towncrier']);

// ───────────── AI 配板 ─────────────
// 分数是经验估计（官方没有公式）：正数对善良有利，负数对邪恶有利，只用来比较同人数的几套配板。
// 2026-11-11：混合剧本（冒名钓鱼、生死未卜、人人可玩）里暗流涌动、黯月初升的角色以前没有权重（按 0 算），AI 配板等于没在平衡，补上
const DEMON_W = { vortox: 3.0, nodashii: 2.6, vigormortis: 2.4, fanggu: 2.2, imp: 2.3, pukka: 2.0, zombuul: 2.2, shabaloth: 2.3, po: 2.2, leviathan: 2.0, lleech: 2.4 };
const MINION_W = { pithag: 1.8, witch: 1.8, eviltwin: 1.6, cerenovus: 1.4, harpy: 1.5, boffin: 1.4, boomdandy: 1.0, scarletwoman: 1.2, baron: 0.8,
  poisoner: 1.7, spy: 1.3, widow: 1.7, godfather: 1.6, assassin: 1.5, devilsadvocate: 1.2, mastermind: 1.0, marionette: 1.3, goblin: 0.9, fearmonger: 1.3 };
const GOOD_W = {
  clockmaker: 0.7, dreamer: 1.4, snakecharmer: 1.2, mathematician: 1.0, flowergirl: 1.1, towncrier: 1.1, oracle: 1.1,
  savant: 1.3, seamstress: 1.0, philosopher: 1.3, artist: 1.2, juggler: 0.9, sage: 0.6,
  mutant: -0.4, sweetheart: -0.6, barber: -0.4, klutz: -0.5,
  noble: 1.0, librarian: 0.8, shugenja: 0.7, balloonist: 0.9, villageidiot: 1.0, innkeeper: 1.3, fisherman: 0.8, farmer: 0.6, virgin: 0.8, magician: 0.7,
  drunk: -0.5, recluse: -0.3, saint: -0.6, damsel: -0.8,
  // 暗流涌动
  washerwoman: 0.8, investigator: 0.9, chef: 0.8, empath: 1.2, fortuneteller: 1.2, undertaker: 0.9, monk: 0.9, ravenkeeper: 0.8,
  slayer: 0.7, soldier: 0.6, mayor: 0.8, butler: -0.3,
  // 黯月初升
  grandmother: 0.7, sailor: 0.9, chambermaid: 0.9, exorcist: 1.0, gambler: 0.5, gossip: 0.5, courtier: 1.0, professor: 1.1,
  minstrel: 0.8, tealady: 0.7, pacifist: 0.9, fool: 0.6, goon: -0.3, lunatic: -0.4, tinker: -0.5, moonchild: -0.4,
  // 窃窃私语
  amnesiac: 0.8, cannibal: 0.6,
  // 横行霸道
  alchemist: 1.0, heretic: -0.4,
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

/**
 * 提线木偶要和恶魔相邻（官方：「你与恶魔相邻」，设置时就这么坐）。座位按 assigned 的顺序，原地改 assigned。
 * 不相邻就把提线木偶挪到恶魔旁边；fixed（房主指定了角色的座位下标）里的座位不动：
 * 提线木偶是房主指定的就反过来把恶魔挪到他旁边，两个都指定了就照房主的（不挪）。
 */
export function seatMarionette(assigned, rng = Math.random, fixed = new Set()) {
  const m = assigned.indexOf('marionette');
  const d = assigned.findIndex((r) => ROLES[r]?.team === 'demon');
  if (m < 0 || d < 0) return assigned;
  const n = assigned.length;
  const near = (i) => [(i + 1) % n, (i - 1 + n) % n];
  if (near(d).includes(m)) return assigned;
  const [mover, anchor] = !fixed.has(m) ? [m, d] : !fixed.has(d) ? [d, m] : [null, null];
  if (mover == null) return assigned;
  const spots = near(anchor).filter((i) => !fixed.has(i) && i !== mover);
  if (!spots.length) return assigned;
  const to = spots[Math.floor(rng() * spots.length)];
  [assigned[mover], assigned[to]] = [assigned[to], assigned[mover]];
  return assigned;
}

export const SNV_METHODS = {
  // ───────────────────────── 开局 ─────────────────────────
  setupSNV(players, roles, rng) {
    const S = SCRIPTS[this.script];
    const assigned = roles ?? (S.riot ? rollRiot(players.length, rng) : S.teensy ? rollTeensy(this.script, players.length, rng) : S.roles ? balancedMixed(this.script, players.length, rng) : balancedSNV(players.length, rng));
    if (assigned.length !== players.length) throw new Error('角色数量与玩家数量不符');
    // 官方相克：痢蛭和异端分子只能有一个在场（房主指定了两个时，异端分子换成一个不在场的外来者）
    if (assigned.includes('lleech') && assigned.includes('heretic')) {
      const free = listsOf(this.script).out.filter((r) => !assigned.includes(r));
      if (free.length) assigned[assigned.indexOf('heretic')] = pickOne(free, rng);
    }
    seatMarionette(assigned, rng);
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, seat: i + 1, role: assigned[i], shownRole: assigned[i],
      alive: true, ghostVote: true, evil: isEvilRole(assigned[i]), gained: null, gainedFake: false, kept: false,
    }));
    const inPlay = new Set(assigned);
    // 酒鬼以为自己是一个不在场的镇民；疯子以为自己是这个剧本的恶魔；失忆者的能力说书人定（他自己不知道）
    const L = listsOf(this.script);
    for (const p of this.players) {
      if (p.role === 'drunk') p.shownRole = pickOne(L.tf.filter((r) => !inPlay.has(r) && !['amnesiac', 'cannibal'].includes(r)), rng); // 以为自己是失忆者/食人族的酒鬼永远不醒，等于露馅
      // 提线木偶：以为自己是一个善良角色（官方：抽到的是镇民标记）。和酒鬼一样挑不在场的，别和酒鬼撞
      if (p.role === 'marionette') p.shownRole = pickOne(L.tf.filter((r) => !inPlay.has(r) && !['amnesiac', 'cannibal', 'huntsman', 'balloonist'].includes(r) && !this.players.some((q) => q.shownRole === r)), rng) ?? 'chef';
      if (p.role === 'lunatic') p.shownRole = pickOne(L.dem, rng);
      if (p.role === 'amnesiac') {
        const free = AMNESIAC_POOL.filter((r) => !inPlay.has(r));
        const pool = free.length ? free : AMNESIAC_POOL;
        const night = pool.filter((r) => !AMNESIAC_DAY.has(r)); const day = pool.filter((r) => AMNESIAC_DAY.has(r));
        p.gained = pickOne(day.length && (!night.length || rng() < DAY_SHARE) ? day : night, rng);
      }
    }
    // 炼金术士：拿一个不在场的爪牙的能力（官方：首夜说书人告诉他，之后在那个爪牙醒的时候醒）
    for (const p of this.players.filter((q) => q.role === 'alchemist')) {
      const free = rolesOf(this.script, 'minion').filter((r) => !inPlay.has(r) && !this.players.some((q) => q.gained === r));
      if (free.length) p.gained = pickOne(free, rng);
    }
    this.lleechHost = null;    // 痢蛭的宿主（首夜选的人）：他活着痢蛭就不会死，他死了痢蛭跟着死
    this.lleechDue = false;    // 宿主死的时候痢蛭失效了：等痢蛭恢复清醒健康时立刻死（集石百科）
    this.fear = null;          // 恐惧之灵现在选的人 { by, target }
    this.fearNews = null;      // 恐惧之灵第一次选、换了人的那一晚：天亮时全场都会知道
    this.bluffs = S.riot ? [] : pickBluffsSNV(new Set([...inPlay, ...this.players.map((p) => p.shownRole)]), rng, this.script); // 裁缝与暴乱：善良全是女裁缝，没有可拿的伪装
    this.fibbinUsed = false;   // 骗人精（传奇角色）用过了
    this.riotChain = null;     // 暴乱：刚被提名死掉、现在可以（第三天必须）接着提名的人
    this.atheist = inPlay.has('atheist') && !assigned.some((r) => isEvilRole(r)); // 无神论者局：场上没有邪恶角色，说书人假装有
    // 小怪宝（夜半狂欢把亡骨魔换成它时）：没有恶魔玩家，多一个爪牙；每晚爪牙选一名爪牙照看它，照看的人「是恶魔」。
    // 首夜选之前先由说书人放在一名爪牙身上（不然开局就「没有恶魔」了）
    const sitters = this.players.filter((p) => team(p) === 'minion');
    this.monsta = this.demonSwap === 'lilmonsta' && !assigned.some((r) => ROLES[r]?.team === 'demon') && sitters.length
      ? { holder: pickOne(sitters, rng).id, asked: null, saved: null, done: 0 } : null;
    this.evilStart = this.players.filter((p) => p.evil).length; // 圣洁之魂：邪恶玩家最多比开局多一名
    this.poppyHid = false;     // 罂粟种植者：首夜爪牙和恶魔没有互认
    this.poppyDue = false;     // 罂粟种植者死了（没失效）：今晚让他们互认
    this.poppyRevealed = false;
    this.ahNight = null;       // 哈迪寂亚今晚选的三个人和他们的选择 { night, demon, targets, idx, picks, asked, saved }
    this.ahNews = null;        // 天亮时公布：哈迪寂亚昨晚选了谁
    this.psychoDay = {};       // 精神病患者今天用过了：id → 第几天
    this.psychoSpared = null;  // 精神病患者被处决、猜拳没输：这次处决不死
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
      // 官方：「说书人通常会给恶魔一个可验证的能力」。池里能让恶魔坐实假身份的是具体、别人能交叉核对的信息
      const proof = free.filter((r) => BOFFIN_PROOF.has(r));
      this.boffin = proof.length && this.st.roll('boffinProof') ? this.st.choose('boffin', proof) : free.length ? this.st.choose('boffin', free) : null;
    }
    this.pixie = {};          // 小精灵：id → { role 被告知的镇民角色, target 那个镇民是谁（可能没有：醉酒时给了不在场的）, mad 疯狂过没有 }
    this.mez = inPlay.has('mezepheles') ? { word: this.st.choose('mezWord', this.mezEasy ? MEZ_WORDS_EASY : MEZ_WORDS), used: false, hit: null } : null; // 灵言师的关键词
    this.execHist = [];       // 处决记录（政客终局判责任用）：{ day, id, by 提名者, voters }
    this.twinSync(null);
  },

  // ───────────────────────── 2026-11-14 的五个新角色 ─────────────────────────
  /**
   * 灵言师：收音页转写出的一句话（房间层每句都送进来）。第一个说出关键词的善良玩家，当晚变成邪恶。
   * 说出口的那一刻灵言师醉没醉都不管，看夜里（官方）。比较时去掉空格标点。
   */
  mezHeard(id, text) {
    const m = this.mez;
    const p = this.get(id);
    if (!m || m.used || m.hit || !p || p.left || this.evilOf(p)) return false; // 官方没限定活着：死人说出来也算
    const clean = (s) => String(s ?? '').replace(/[\s，。！？、,.!?…「」“”"'：:；;（）()-]/g, '');
    if (!clean(text).includes(clean(m.word))) return false;
    m.hit = id;
    this.record('st', `${this.tag(id)} 说出了灵言师的关键词「${m.word}」：今晚变成邪恶`);
    return true;
  },
  /** 魔像整局只能提名一次：第二次就不让提（在记下提名之前查）。 */
  golemBlocked(a) { return this.has(a, 'golem') && a.role === 'golem' && !!this.used[`golem-${a.id}`]; },
  /** 魔像提名：被提名的人不是恶魔就死（陌客可能被当作恶魔）。失效时不死，但这一次也用掉了。返回死没死。 */
  golemSNV(a, b) {
    if (!this.has(a, 'golem') || this.used[`golem-${a.id}`]) return false;
    this.used[`golem-${a.id}`] = true;
    if (!b.alive || this.seenDemon(b, '魔像提名')) { this.record('st', `魔像 ${this.tag(a.id)} 提名了 ${this.tag(b.id)}：${b.alive ? '是恶魔，没有死' : '他已经死了'}`); return false; }
    if (this.snvBroken(a)) { this.flag(a, '魔像失效，被提名的人没有死'); return false; }
    this.record('st', `魔像 ${this.tag(a.id)} 提名了不是恶魔的 ${this.tag(b.id)}：他死亡`);
    return this.snvKill(b, 'golem', this.dayMessages()) === 'died';
  },

  /** 小精灵被判定疯狂地证明了自己是那个镇民（黄昏判，房间层调）。 */
  pixieMad(id) { const x = this.pixie?.[id]; if (x && !x.mad) { x.mad = true; this.record('st', `小精灵 ${this.tag(id)} 疯狂地证明了自己是${ROLES[x.role].name}`); } },
  /** 那个镇民死了：疯狂过、没失效的小精灵获得他的能力（不告诉他，下次被叫醒才知道；官方）。 */
  pixieGain(dead) {
    for (const [id, x] of Object.entries(this.pixie ?? {})) {
      const px = this.get(id);
      if (x.target !== dead.id || x.gained || !px?.alive) continue;
      if (!x.mad) { this.record('st', `${this.tag(dead.id)} 死了，但小精灵 ${this.tag(id)} 没有疯狂地证明过自己是${ROLES[x.role].name}`); continue; }
      if (this.snvBroken(px)) { this.flag(px, '小精灵失效，没有获得能力'); continue; }
      x.gained = true;
      px.gained = x.role; px.gainedFake = false;
      this.record('st', `小精灵 ${this.tag(id)} 获得了${ROLES[x.role].name}的能力`);
    }
  },
  /**
   * 政客（终局判）：输掉的一方里，对落败负最大责任的人。官方没有公式，这里按处决记账：
   * 处决了自己人，提名的人记 2 分、举手的记 1 分（好人处决好人、坏人处决坏人）。政客分数是本方最高、且至少 3 分才算。
   * 醉酒中毒、被麻脸巫婆从邪恶变成政客的不转。
   */
  politicianCheck() {
    const lost = this.winner === 'good' ? true : this.winner === 'evil' ? false : null; // 输掉的一方是不是邪恶
    if (lost == null) return;
    this.politicianEval = [];
    for (const p of this.players.filter((q) => q.role === 'politician' && this.evilOf(q) === lost)) {
      if (this.snvBroken(p) || p.noTurnGood && lost) continue;
      if (!lost && this.ivoryFull?.()) continue; // 圣洁之魂：邪恶已经比开局多一名，政客不能转成邪恶
      const ev = { id: p.id, lost, flipped: false };
      this.politicianEval.push(ev); // 房间层可以拿 AI 的判断改判（politicianVerdict）
      const score = {};
      for (const e of this.execHist ?? []) {
        const ex = this.get(e.id);
        if (!ex || this.evilOf(ex) !== lost) continue; // 处决了自己人
        if (e.by) score[e.by] = (score[e.by] ?? 0) + 2;
        for (const v of e.voters ?? []) score[v] = (score[v] ?? 0) + 1;
      }
      const mine = score[p.id] ?? 0;
      const best = Math.max(0, ...this.players.filter((q) => q.id !== p.id && this.evilOf(q) === lost).map((q) => score[q.id] ?? 0));
      this.st.decide('politician', { who: p.id, chosen: mine >= 3 && mine > best, mine, best });
      if (mine < 3 || mine <= best) continue;
      ev.flipped = true;
      p.evil = !lost;
      this.record('end', `政客 ${this.tag(p.id)} 对本方落败负最大责任：他转变阵营，和${lost ? '善良' : '邪恶'}一起获胜`);
    }
  },

  /**
   * AI 说书人终局读了整局的发言和提名投票，判政客是不是本方落败的最主要责任人：和打分的结果不一样就改判。
   * 返回改了没有。
   */
  politicianVerdict(id, responsible, reason) {
    const ev = this.politicianEval?.find((x) => x.id === id);
    const p = this.get(id);
    if (!ev || !p) return false;
    this.st.decide('politicianAI', { who: id, chosen: responsible, was: ev.flipped, reason });
    if (responsible === ev.flipped) return false;
    ev.flipped = responsible;
    p.evil = responsible ? !ev.lost : ev.lost;
    this.record('end', responsible
      ? `说书人听了整局的发言，判政客 ${this.tag(id)} 对本方落败负最大责任：他转变阵营，和${ev.lost ? '善良' : '邪恶'}一起获胜（${reason}）`
      : `说书人听了整局的发言，判政客 ${this.tag(id)} 不是本方落败的最主要责任人：他不转阵营（${reason}）`);
    return true;
  },

  // ───────────────────────── 状态查询 ─────────────────────────
  abilityOf(p) { return p.gained ?? (p.role === 'drunk' || p.role === 'marionette' ? p.shownRole : p.role); }, // 酒鬼、提线木偶按他以为的角色行动
  /** 不知道自己是什么能力的人（失忆者、拿到能力的食人族）：信息只给裸的数字、人名，不说是哪个能力。 */
  hidden(p) { return (!!p?.gained && (p.role === 'amnesiac' || p.role === 'cannibal')) || !!this.allAmn?.(p); }, // 全员失忆：还不知道自己是谁的人
  /** 利维坦在起作用。 */
  leviOn() { return this.players.some((q) => q.role === 'leviathan' && q.alive && !this.snvBroken(q)); },
  /** 这个死人还留着能力吗（被亡骨魔杀死的爪牙，亡骨魔还在且没失效）。 */
  kept(p) { return !!p && !p.alive && !!p.kept && team(p) === 'minion' && this.vigOn(); },
  /** 还用得了能力吗（活着，或者保留了能力）。不管醉酒中毒。 */
  active(p) { return !!p && (p.alive || this.kept(p) || !!p.regained); }, // regained：集骨者让死人重新获得能力到黄昏
  /** 科学怪人给恶魔的那个能力（科学怪人还在、没失效时才有；恶魔自己醉酒中毒不影响）。 */
  extraAbility(p) {
    if (!this.boffin || !p || team(p) !== 'demon') return null;
    const b = this.players.find((q) => q.role === 'boffin' && this.active(q));
    return b && !this.snvBroken(b) ? this.boffin : null;
  },
  /** 有没有这个能力（自己的，或者科学怪人给的）。 */
  has(p, ability) { return this.abilityOf(p) === ability || this.extraAbility(p) === ability; },
  /** 这个能力现在起不起作用：科学怪人给的只看科学怪人（extraAbility 里已经查过），自己的看醉酒中毒。 */
  abilityOn(p, ability) { return this.extraAbility(p) === ability || !this.snvBroken(p); },
  /** 拿着某个能力、还用得了的人。 */
  holders(ability) { return this.players.filter((q) => this.has(q, ability) && this.active(q)); },

  // ── 陌客、间谍的误登记（暗流涌动的规则）：只对检测类能力生效，每次由说书人现定，可以前后不一致 ──
  misregSNV(p, by, help = 'evil') { // help：这次误登记帮哪边（见 storyteller.misregister）
    if (!p || !['recluse', 'spy'].includes(p.role) || this.snvBroken(p)) return false;
    if (this.misregister != null) return this.rng() < this.misregister;
    return this.st.misregister(p, by, help);
  },
  /** 被检测时登记成邪恶吗。 */
  seenEvil(p, by, help) { if (this.fauxPawOn?.(p)) return true; const e = this.evilOf(p); return this.misregSNV(p, by, help) ? !e : e; }, // 半兽人的失足：始终被当作邪恶
  /** 被检测时登记成恶魔吗（陌客可能）。 */
  seenDemon(p, by) { return this.demonNow(p) || (p.role === 'recluse' && this.misregSNV(p, by)); },
  /** 这个人现在是不是恶魔：恶魔角色，或者正在照看小怪宝的爪牙。 */
  demonNow(p) { return !!p && (team(p) === 'demon' || this.monsta?.holder === p.id); },
  /** 被检测时登记成镇民吗（间谍可能）。 */
  seenTownsfolk(p, by, help) { return team(p) === 'townsfolk' || (p.role === 'spy' && this.misregSNV(p, by, help)); },
  /** 被看角色时看到的角色（送葬者、守鸦人）：陌客可能是爪牙或恶魔，间谍可能是善良角色。 */
  seenRole(p, by) {
    if (!this.misregSNV(p, by)) return p.role;
    const pool = p.role === 'recluse' ? [...rolesOf(this.script, 'minion'), ...rolesOf(this.script, 'demon')] : goodOf(this.script).filter((r) => r !== 'spy');
    return this.st.misregRole(p, pool);
  },
  demonsAlive() { return this.players.filter((p) => p.alive && this.demonNow(p)); },
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
    if (this.baristaFx?.id === p.id && !p.gainedFake && p.role !== 'marionette') return false; // 咖啡师：清醒且健康（酒鬼照他以为的角色拿正确信息）
    if (seen.has(p.id)) return false;
    if (p.gainedFake || p.role === 'drunk' || p.role === 'marionette') return true; // 提线木偶的「能力」从来不生效，说书人假装生效（和酒鬼一样）
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
    if (this.baristaFx?.id === p.id) return null; // 咖啡师：清醒且健康，获得正确信息
    if (this.atheist && !this.evilOf(p)) return 'atheist'; // 无神论者局：所有信息都按说书人假装的那个邪恶阵营给（整局共用一个假世界）
    if (team(p) === 'demon' && this.extraAbility(p)) return null; // 科学怪人给的能力：恶魔醉酒中毒也照样有（恶魔自己的能力不拿信息）
    if (this.isTownsfolk(p) && this.vortoxOn()) return 'must';
    if (!this.snvBroken(p)) return null;
    // 邪恶碾压时，真酒鬼偶尔拿真信息（官方《给说书人的建议》）
    if (p.role === 'drunk' && this.st.drunkTruth(p)) return null;
    // 醉酒的村夫偶尔拿真信息（官方村夫页）：只醉不毒时
    if (p.role === 'villageidiot' && this.fx.some((f) => f.why === '村夫' && f.target === p.id) && !this.snvPoisoned(p) && this.st.idiotTruth(p)) return null;
    return 'fake';
  },
  /**
   * 数字信息：lieMode 不为空就按假世界答，前后几晚对得上。假世界碰巧和真相一样时：
   * 醉酒中毒就照说（中毒碰巧说对不算没正常生效），涡流必须是错的，只好差一点。
   * inWorld(w)：这个数字在假世界里是多少；杂耍艺人、数学家这种假世界算不出来的不给，就只差一点。
   */
  infoNumber(p, truth, range, inWorld = null) {
    const mode = this.lieMode(p);
    if (!mode) return truth;
    const world = inWorld ? this.st.snvWorld(p, mode, (w) => inWorld(w) !== truth) : null;
    const said = world ? inWorld(world) : null;
    const usable = said != null && said >= range.min && said <= range.max && (mode !== 'must' || said !== truth);
    let v = usable ? said : this.st.fakeNumber(p, truth, range);
    if (mode === 'atheist' && usable) this.st.pinAtheist(world, (w) => inWorld(w) === v);
    if (mode === 'must' && v === truth) v = truth + 1; // 可选范围只有真相一个数（比如还没人死）：涡流下也不能说真话
    this.st.decide('infoNumber', { who: p.id, role: p.role, mode, range, chosen: v, truth, fromWorld: usable });
    if (v !== truth) this.flag(p, `得到了错误的数字 ${v}（真实是 ${truth}）`);
    return v;
  },
  infoYes(p, truth, inWorld) {
    const mode = this.lieMode(p);
    if (!mode) return truth;
    const w = this.st.snvWorld(p, mode, (x) => inWorld(x) !== truth);
    const said = inWorld(w);
    if (mode === 'atheist') this.st.pinAtheist(w, (x) => inWorld(x) === said);
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
    if (role !== 'villageidiot') this.fx = this.fx.filter((f) => !(f.why === '村夫' && f.target === p.id)); // 醉酒的村夫不再是村夫，醉酒跟着结束
  },
  /** 两人互换角色（阵营不动）：哲学家拿到的能力跟着角色走。 */
  swapRoles(a, b) {
    const ra = a.role; const rb = b.role; const ga = a.gained; const gb = b.gained; const fa = a.gainedFake; const fb = b.gainedFake;
    this.changeRole(a, rb); this.changeRole(b, ra);
    a.gained = gb; a.gainedFake = fb; b.gained = ga; b.gainedFake = fa;
  },
  /** 角色变了以后：双子要不要重新配对、哲学家醉的人要不要换、新恶魔知不知道疯子。say 为 null 时不发信息（开局）。 */
  afterChange(say) {
    this.twinSync(say); this.philSync();
    if (say) for (const d of this.demonsAlive()) this.tellLunatic(d, say);
  },
  /** 疯子在场：恶魔知道他是谁（中途换上的新恶魔也要告诉，每个恶魔说一次）。 */
  tellLunatic(d, say) {
    const l = this.players.find((q) => q.role === 'lunatic' && q.id !== d.id);
    if (!l || (this.lunaticTellTo ??= []).includes(d.id)) return;
    this.lunaticTellTo.push(d.id);
    say(d, `**${this.name(l.id)}** 是疯子：他以为自己是${ROLES[l.shownRole]?.name ?? '恶魔'}。每晚他选了谁，你都会知道。`);
  },

  twinSync(say) {
    const a = this.players.find((q) => q.role === 'eviltwin' && this.active(q));
    if (!a) { this.twin = null; return; }
    const b = this.twin?.a === a.id ? this.get(this.twin.b) : null;
    if (b && this.evilOf(b) !== this.evilOf(a)) return;
    const opp = this.st.twinFor(a, !!say && this.aliveCount() <= 4); // 麻脸巫婆在最后几夜造出来的：对立双子可以是恶魔或死人
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
  twinBlocks() { if (!this.twin) return false; const a = this.get(this.twin.a); return !!a?.alive && !this.snvBroken(a) && !!this.get(this.twin.b)?.alive; }, // 官方：「两个双子都存活时」

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
    const aliveBefore = this.townAlive(); // 红唇女郎的「五名玩家存活」不算旅行者（官方）
    p.alive = false;
    if (this.phase === 'night' && cause !== 'execution') this.nightDeaths.push(p.id); // 夜里的处决当场公布，不等天亮
    if (ab === 'hatter' && !off) this.hatterDied(p); // 帽匠：当晚开茶会
    if (p.role === 'vigormortis') { for (const q of this.players) if (q.kept) q.kept = false; this.vigKept = []; } // 亡骨魔死了：保留的能力和毒都结束（官方：亡骨魔死亡或离场时移除）
    if (this.phase === 'night' && cause === 'demon') (this.demonKills ??= []).push(p.id);
    const why = {
      demon: '被恶魔杀死', execution: '被处决', witch: '被女巫的诅咒咒死', pithag: '死于麻脸巫婆造出恶魔的那一夜', fanggu: '被方古的转化取代',
      madness: '因疯狂被处决', storyteller: '说书人判定死亡', starpass: '恶魔自杀（传位）', slayer: '被猎手射杀',
      harpy: '没能疯狂地证明，被鹰身女妖的能力杀死', boomdandy: '死于炸弹人的炸弹',
      assassin: '被刺客刺杀', godfather: '被教父杀死', gambler: '赌错了角色', gossip: '因造谣者的声明而死', tinker: '修补匠突然死亡',
      golem: '被魔像提名，不是恶魔所以死了', lleech: '宿主死了，痢蛭随之死亡', riot: '被提名，死于暴乱', psychopath: '被精神病患者杀死',
      acrobat: '杂技演员选中的人醉酒或中毒了', lycanthrope: '被半兽人杀死',
      alhadikhia: '被哈迪寂亚选中，选择了死去', alhadikhia3: '被哈迪寂亚选中，三个人都选了活，一起死去', moonchild: '被月之子带走', grandmother: '孙子被恶魔杀死，祖母随之而去',
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
    if (this.demonNow(p) && cause === 'execution') this.demonExecuted = true;
    if (this.monsta?.holder === p.id) this.record('st', `照看小怪宝的 ${this.tag(p.id)} 死了：小怪宝没人照看`);
    if (ab === 'moonchild') this.pendingMoonchild = p.id;
    if (this.pixie && Object.keys(this.pixie).length) this.pixieGain(p);
    if (p.role === 'pukka') this.pukkaVictim = null; // 普卡死亡：「中毒」标记移除，接任的新普卡不会毒死旧普卡毒的人 // 失效的月之子也要选（他不知道），选中善良也不会死
    if (cause === 'demon' && p.id === this.grandchild) { // 孙子被恶魔杀死，祖母随之而去
      const gm = this.holders('grandmother').find((q) => q.alive && !this.snvBroken(q));
      if (gm) this.snvKill(gm, 'grandmother', messages);
    }
    if (this.phase === 'night') { // 官方：只要死在夜晚，不论什么原因
      if (ab === 'farmer') { if (off) this.flag(p, '农夫夜里死了，但他失效了，没有人接班'); else this.farmerDue.push(p.id); }
      if (ab === 'ravenkeeper') this.rkDue = p.id; // 失效的守鸦人也醒（他不知道自己失效），拿到的可能是假的
    }
    if (cause === 'execution') this.feedCannibals(p, ab);
    if (ab === 'poppygrower' && !off && this.poppyHid && !this.poppyRevealed) this.poppyDue = true; // 失效时死了，邪恶不会互认（官方）
    if (this.atheist) this.atheistShift(p);
    if (this.lleechHost === p.id) this.lleechLink(messages); // 痢蛭的宿主死了：痢蛭跟着死（痢蛭失效时等他恢复）
    if (this.fear?.by === p.id) { this.fear = null; this.record('st', `恐惧之灵 ${this.tag(p.id)} 死了：他选的人不再有效`); }
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
    this.tellLunatic(heir, (q, text) => messages.push({ playerId: q.id, text }));
    this.demonExecuted = false; // 有人接任：主谋的额外一天只看「恶魔死于处决导致没有恶魔」
    this.log.push(`${this.name(heir.id)} 成为了${ROLES[d.role].name}`);
    this.record('death', `${this.name(heir.id)} 接任，成为新的${ROLES[d.role].name}`);
    messages.push({ playerId: heir.id, text: `恶魔死去了——**你现在是${this.amnName(heir, d.role)}**。${ROLES[d.role].ability && !this.allAmn(heir) ? `你的能力：${ROLES[d.role].ability}` : ''}` });
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
      const goodRole = (r) => r && inScript(r, this.script) && ['townsfolk', 'outsider'].includes(ROLES[r].team) && !['cannibal', 'drunk'].includes(r);
      // 没声明过的邪恶：说书人假装他拿到了一个不在场的善良能力（官方建议），不然他从此不醒等于告诉他吃了邪恶
      const spare = goodOf(this.script).filter((r) => goodRole(r) && !this.players.some((q) => q.role === r));
      const fake = goodRole(said) ? said : evil && spare.length ? this.st.choose('cannibalFake', spare, { who: c.id }) : null;
      c.gained = evil ? fake : ab === 'cannibal' ? null : ab;
      c.gainedFake = false;
      if (evil) this.addFx('poison', c.id, null, 'never', '食人族');
      else if (p.role === 'drunk') this.addFx('drunk', c.id, null, 'never', '食人族'); // 吃了酒鬼：拿到的是酒鬼以为的能力，但醉着（到下一个被处决的人）
      this.record('st', `食人族 ${this.tag(c.id)} ${evil ? `吃了邪恶的 ${this.name(p.id)}：中毒${fake ? `，以为拿到了${ROLES[fake].name}的能力` : ''}` : c.gained ? `拿到了 ${ROLES[c.gained].name} 的能力` : '没有拿到能力'}`);
    }
  },

  /** 恶魔 d 对 t 下手。 */
  demonHit(d, t, messages) {
    if (!t?.alive) return;
    if (this.lycanNight === this.night) { this.record('st', `恶魔对 ${this.tag(t.id)} 下手，但半兽人今晚已经杀了人：恶魔不造成死亡`); return; }
    const safe = this.safeFrom(t, 'demon');
    if (safe) { this.record('st', `恶魔对 ${this.tag(t.id)} 下手，但${safe}：没有死`); return; } // 被僧侣保护的小恶魔自刀也无事发生（官方）
    if (d.role === 'imp' && t.id === d.id) { this.snvDie(d, 'starpass', messages); return; }
    if (this.has(t, 'soldier') && this.abilityOn(t, 'soldier')) { this.record('st', `恶魔对士兵 ${this.tag(t.id)} 下手：没有死`); return; }
    if (this.has(t, 'mayor') && this.abilityOn(t, 'mayor') && team(t) !== 'demon') {
      const others = this.alive().filter((q) => q.id !== t.id && q.id !== d.id && !this.safeFrom(q, 'demon') && !this.bmrProtection(q, 'demon') && !(this.has(q, 'soldier') && this.abilityOn(q, 'soldier')));
      const victim = this.st.mayorBounce(t, others);
      if (victim) { this.snvKill(victim, 'demon', messages); return; }
    }
    if (d.role === 'fanggu' && team(t) === 'outsider' && !this.fangUsed && t.id !== d.id) {
      this.fangUsed = true;
      const say = (q, text) => messages.push({ playerId: q.id, text });
      this.snvDie(d, 'fanggu', messages);
      this.changeRole(t, 'fanggu');
      t.evil = true;
      say(t, this.allAmn(t) ? '说书人叫醒了你：**你现在是邪恶的恶魔**（具体是哪个角色你还不知道）。原来的恶魔代替你死去了。从下一个夜晚起由你杀人。（你不知道爪牙是谁。）'
        : '方古选中了你：**你现在是邪恶的方古。** 原来的方古代替你死去了。从下一个夜晚起由你杀人。（你不知道爪牙是谁。）');
      this.record('death', `${this.tag(t.id)} 被转化成新的方古`);
      this.afterChange(say);
      return;
    }
    const sage = this.abilityOf(t) === 'sage' ? { sage: t.id, demon: d.id, off: this.snvBroken(t) } : null;
    const wasAlive = t.alive;
    this.snvKill(t, 'demon', messages);
    if (!wasAlive || t.alive) return; // 官方：贤者「只有在被恶魔杀死时」、亡骨魔「成功杀死」才算；被救下不触发
    if (d.role === 'vigormortis' && team(t) === 'minion') {
      t.kept = true;
      this.vigKept.push({ minion: t.id, dir: this.st.vigSide(t) });
      this.record('st', `亡骨魔杀死了爪牙 ${this.tag(t.id)}：他保留能力，邻近一名镇民中毒`);
    }
    if (sage) this.sageHit = sage;
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
    if (cause !== 'lleech' && this.has(p, 'lleech') && !this.snvBroken(p) && this.lleechHost && this.get(this.lleechHost)?.alive) return '宿主还活着（痢蛭）';
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
    delete this.used[p.id]; delete this.used[`fool-${p.id}`]; // 官方：复活的玩家重新获得「每局一次」的能力
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
    this.acted = new Set();
    for (const q of this.players) if (q.regained && q.regained < this.night) delete q.regained; // 集骨者：重新获得的能力到黄昏为止
    this.baristaFx = null; // 咖啡师：上一晚的效果到黄昏为止
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
    // 提线木偶：不知道自己是爪牙，首夜不醒，别的爪牙也不知道他；恶魔知道他是谁（人少没有恶魔信息时也告诉，这是他能力的一部分）
    const marionette = this.players.find((p) => p.role === 'marionette');
    const minions = this.players.filter((p) => team(p) === 'minion' && p.role !== 'marionette');
    // 相克（魔术师/提线木偶）：魔术师活着时，恶魔只知道提线木偶坐在旁边，不知道是哪一边
    const magicOn = this.players.some((q) => q.role === 'magician' && q.alive && !this.snvBroken(q));
    if (marionette && demon) say(demon, magicOn ? '提线木偶就坐在你旁边，但魔术师在场：**你不知道是左边还是右边那个人**。他以为自己是善良的镇民。' : `**${this.name(marionette.id)}** 是提线木偶：他以为自己是${ROLES[marionette.shownRole].name}，不知道自己是爪牙。他就坐在你旁边。`);
    // 疯子：恶魔知道他是谁（这是疯子能力的一部分，人少没有恶魔信息时也告诉）
    const lunatic = this.players.find((p) => p.role === 'lunatic');
    if (lunatic && demon) this.tellLunatic(demon, say);
    // 寡妇首夜看魔典（先看，再选人）
    for (const w of this.players.filter((p) => this.abilityOf(p) === 'widow' && p.alive && !this.used[p.id])) say(w, `魔典（和说书人看到的一样）：
${this.grimoire(w.id)}
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
    if (this.monsta) return this.monstaInfo(minions, say, messages);
    if (!this.evilInfo || this.atheist) return messages; // 无神论者局：没有邪恶，没人醒来互认
    this.evilKnown = this.knownMap();
    if (this.poppyHides()) { // 罂粟种植者：爪牙和恶魔互相不认识；恶魔照样拿伪装（官方）
      this.poppyHid = true;
      this.evilKnown = Object.fromEntries(this.players.filter((p) => this.evilOf(p)).map((p) => [p.id, []]));
      if (demon) say(demon, `**罂粟种植者在场**：你不知道你的爪牙是谁（他死了，你们才会在那晚互相认识）。\n不在场的角色（可用来伪装）：${this.bluffs.map((r) => ROLES[r].name).join('、')}。`);
      for (const m of minions) say(m, '**罂粟种植者在场**：你不知道恶魔和其他爪牙是谁（他死了，你们才会在那晚互相认识）。');
      return messages;
    }
    if (SCRIPTS[this.script]?.riot) { // 裁缝与暴乱：没有爪牙，所有暴乱一起醒来互认（官方 v1：在恶魔信息这一步唤醒所有暴乱）；没有伪装
      const riots = this.players.filter((p) => p.role === 'riot');
      for (const r of riots) say(r, `你们都是**暴乱**：${riots.filter((x) => x.id !== r.id).map((x) => `**${this.name(x.id)}**`).join('、') || '只有你一个'}。\n没有伪装可拿：所有善良玩家都是女裁缝。`);
      return messages;
    }
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
      const fakeBluffs = pickBluffsSNV(new Set(this.players.map((q) => q.role)), this.rng, this.script);
      say(lunatic, `你的爪牙：${fake.map((x) => `**${this.name(x.id)}**`).join('、')}。
不在场的角色（可用来伪装）：${fakeBluffs.map((r) => ROLES[r].name).join('、')}。`);
      // 界面上和真恶魔一样：座位圈上的爪牙红框、3 张伪装卡（room.js 的 self 视图读这个）
      this.lunaticFake = { id: lunatic.id, allies: fake.map((x) => x.id), bluffs: fakeBluffs, shared: false };
    }
    for (const m of minions) {
      const mates = minions.filter((x) => x.id !== m.id).map((x) => this.name(x.id));
      say(m, `恶魔是 **${this.name(demon.id)}**。${mates.length ? `其他爪牙：${mates.join('、')}。` : ''}`);
    }
    say(demon, `你的爪牙：${[...minions, ...(marionette ? [marionette] : [])].map((x) => `**${this.name(x.id)}**${x === marionette ? '（提线木偶）' : ''}`).join('、')}。\n不在场的角色（可用来伪装）：${this.bluffs.map((r) => ROLES[r].name).join('、')}。`);
    return messages;
  },

  /** 一个人按某个能力行动时的选人要求。 */
  promptFor(p, role) {
    const charged = p.role === 'lunatic' ? !!this.used[`po-${p.id}`] : this.poCharged; // 疯子以为自己是珀：他自己的「上次没选」
    const spec = role === 'barber' ? { count: 2, optional: true } : role === 'po' ? { count: charged ? 3 : 1, optional: !charged } : ROLES[role].choose;
    if (!spec) return null;
    const last = this.lastPick?.[p.id];
    const options = this.players.filter((q) => {
      if (spec.notSelf && q.id === p.id) return false;
      if (spec.alive && !this.visAlive(q)) return false;
      if (spec.dead && this.visAlive(q)) return false;
      if (spec.notLast && q.id === last) return false;
      if (role === 'barber' && team(q) === 'demon' && q.id !== p.id) return false; // 不能选其他恶魔
      if (role === 'lm_sit' && !(q.alive && this.evilOf(q) && team(q) === 'minion')) return false; // 照看小怪宝：只能选活着的爪牙
      if (role === 'lleech' && this.night === 1 && !this.visAlive(q)) return false; // 痢蛭首夜：选一名存活的玩家当宿主
      return true;
    }).map((q) => q.id);
    let roleOptions = spec.role ? (spec.good ? goodOf(this.script) : spec.evil ? this.scriptRoles().filter((r) => ['minion', 'demon'].includes(ROLES[r].team)) : this.scriptRoles()) : null;
    if (roleOptions) roleOptions = roleOptions.filter((r) => r !== 'lilmonsta'); // 小怪宝没有恶魔玩家，工程师、麻脸巫婆不能造出它
    if (role === 'ah_choice') roleOptions = ['ah_live', 'ah_die'];
    if (role === 'harlot_ask') roleOptions = ['harlot_yes', 'harlot_no'];
    if (role === 'hatter_pick') roleOptions = this.scriptRoles().filter((r) => ROLES[r].team === team(p) && r !== 'lilmonsta' && (r === p.role || !this.players.some((q) => q.role === r))); // 帽匠的茶会：同类型、不在场的角色
    if (role === 'cerenovus' && inScript('goblin', this.script)) roleOptions = [...roleOptions, 'goblin']; // 相克：洗脑师可以让人对「自己是哥布林」疯狂
    return { playerId: p.id, role: this.hidden(p) && role !== 'ah_choice' && role !== 'harlot_ask' && role !== 'hatter_pick' ? (this.allAmn?.(p) ? this.amnRoleOf(p) : p.role) : role, count: spec.count, options, optional: !!spec.optional, pickRole: !!spec.role, roleOptions, waiting: false };
  },

  nightPromptsSNV() {
    if (this.midNight) { const p = this.get(this.midNight.who); return p ? [this.promptFor(p, this.midNight.as)] : []; }
    const first = this.night === 1;
    const out = [];
    for (const p of this.players.filter((q) => this.active(q) && !(q.traveller && q.joinedNight === this.night))) { // 夜里才加入的旅行者下一晚才醒
      // 疯子以为自己是恶魔：按那个恶魔的样子醒来选人（没有效果，恶魔会知道他选了谁）
      const role = p.role === 'lunatic' && ROLES[p.shownRole]?.team === 'demon' ? p.shownRole : this.abilityOf(p);
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
    // 真恶魔要等疯子先选完（恶魔得知疯子选了谁再行动）
    const lun = out.find((x) => this.get(x.playerId)?.role === 'lunatic');
    if (lun && !this.choices[lun.playerId]) for (const x of out) if (x !== lun && team(this.get(x.playerId)) === 'demon') x.waiting = true;
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
    return this.lunaticNews(playerId);
  },

  /** 疯子选完了：告诉恶魔（官方：恶魔知道疯子每晚选了谁）。机器人替他选的在结算时补告诉。 */
  lunaticNews(playerId) {
    const p = this.get(playerId);
    if (p?.role !== 'lunatic' || !this.choices[playerId]) return [];
    const ts = this.choices[playerId].targets ?? [];
    if (p.shownRole === 'po') this.used[`po-${p.id}`] = ts.length === 0;
    this.lunaticTold = this.night;
    const demon = this.demonsAlive()[0];
    return demon ? [{ playerId: demon.id, text: `疯子 ${this.name(p.id)} 今晚${ts.length ? `选了：${ts.map((t) => this.name(t)).join('、')}` : '没有选人'}。` }] : [];
  },

  autoChooseSNV(playerId) {
    const pr = this.nightPromptsSNV().find((x) => x.playerId === playerId);
    if (!pr || pr.waiting) return;
    const p = this.get(playerId);
    const skip = () => { this.choices[playerId] = { targets: [], role: null }; };
    if (pr.role === 'ah_choice') { this.choices[playerId] = { targets: [], role: this.rng() < 0.6 ? 'ah_live' : 'ah_die' }; return; } // 机器人：多半选活
    if (pr.role === 'harlot_ask') { this.choices[playerId] = { targets: [], role: this.rng() < (this.evilOf(p) ? 0.35 : 0.6) ? 'harlot_yes' : 'harlot_no' }; return; } // 机器人：善良的多半同意
    if (pr.role === 'hatter_pick') { const others = pr.roleOptions.filter((r) => r !== p.role); this.choices[playerId] = { targets: [], role: others.length && this.rng() < 0.4 ? others[Math.floor(this.rng() * others.length)] : null }; return; } // 机器人：多半不换
    if (pr.optional && this.rng() < 0.5) return skip();
    let opts = pr.options;
    const prey = opts.filter((id) => !this.evilOf(this.get(id)) && this.get(id).alive);
    if (['alhadikhia', 'lleech', 'fearmonger', 'fanggu', 'vigormortis', 'nodashii', 'vortox', 'witch', 'cerenovus', 'pithag', 'imp', 'widow', 'pukka', 'poisoner', 'zombuul', 'shabaloth', 'po', 'assassin', 'godfather'].includes(pr.role) && prey.length >= pr.count) opts = prey;
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
    if (m?.as === 'harlot_ask') return `流莺 **${this.name(this.harlotAsk?.harlot)}** 选中了你。**同意**的话，她会得知你的角色，但你们两个可能同时死亡；**拒绝**就什么都不会发生。`;
    if (m?.as === 'ah_choice') return `哈迪寂亚选中了你（这次选的三个人：${(this.ahNight?.targets ?? []).map((id) => this.name(id)).join('、')}）。悄悄决定：**活下去**，还是**死去**。如果三个人最后都活着，三个人一起死。`;
    if (m?.as === 'barber') return '理发师死了：你可以选两名玩家交换他们的角色（不能选其他恶魔），也可以放弃。';
    if (m?.as === 'hatter_pick') return '**帽匠死了，茶会开始**：你可以换成剧本里另一个同类型、不在场的角色（爪牙换爪牙、恶魔换恶魔），也可以不换。换了以后原来的能力不再生效。';
    if (m?.as === 'lm_sit') return '**小怪宝**：替你们爪牙决定今晚由谁照看它——选一名活着的爪牙（可以选你自己）。照看的人「是恶魔」，他死了善良获胜。';
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
    if (!mid) for (const l of this.players.filter((q) => q.role === 'lunatic' && this.choices[q.id])) {
      if (this.lunaticTold !== this.night) messages.push(...this.lunaticNews(l.id));
      if (!this.woke.includes(l.id)) this.woke.push(l.id);
      this.record('choice', `疯子 ${this.tag(l.id)} 以为自己在行动，选了 ${(this.choices[l.id].targets ?? []).map((id) => this.name(id)).join('、') || '没有人'}（没有效果）`);
    }
    if (mid?.rest?.length && this.midCheck(steps, mid.step - 1, mid.rest, messages)) return pause();

    for (let i = mid?.step ?? 0; i < steps.length; i++) {
      const step = steps[i];
      let changed = [];
      for (const q of this.holders(step)) if (this.choices[q.id]) (this.acted ??= new Set()).add(q.id); // 侍女：这一步醒来用能力的人
      // 莽夫：这一步有人用自己的能力选中了他（先算，选他的人当晚就醉）
      if (this.players.some((q) => q.role === 'goon')) for (const p of this.holders(step)) if (p.id !== this.blocked) for (const t of this.choiceOfSNV(p)?.targets ?? []) this.goonSNV(p, t, { assassin: step === 'assassin' });
      switch (step) {
        case 'barista': this.baristaStep(messages); break;
        case 'acrobat': this.acrobatStep(); break;
        case 'lycanthrope': this.lycanStep(messages); break;
        case 'hatter': if (this.hatterStep(i, messages, say) === 'pause') return pause(); break;
        case 'bountyhunter': this.bountyStep(tell); break;
        case 'nightwatchman': this.nightwatchStep(say); break;
        case 'harlot': if (this.harlotStep(i, messages) === 'pause') return pause(); break;
        case 'bonecollector': if (this.boneStep(i, steps, messages) === 'pause') return pause(); break;
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
          if (c.role === 'leviathan' && this.day >= 5) { this.record('st', '相克：第 5 天以后麻脸巫婆不能造出利维坦，无事发生'); continue; }
          const wasDemon = team(t) === 'demon';
          const old = this.demonsAlive().filter((q) => q.id !== t.id);
          if (c.role === 'damsel') { // 相克：麻脸巫婆造落难少女时，由说书人决定是哪名玩家
            const pool = this.alive().filter((q) => !this.evilOf(q) && !this.players.some((x) => x.role === 'damsel'));
            const st = pool.length ? this.st.choose('pithagDamsel', pool) : t;
            if (st !== t) this.record('st', `相克：麻脸巫婆要造落难少女，说书人改让 ${this.tag(st.id)} 变成落难少女`);
            this.changeRole(st, 'damsel'); say(st, `你变成了 **${this.amnName(st, 'damsel')}**。你的阵营没有变。`); this.afterChange(say); changed.push(st.id); continue;
          }
          if (['politician', 'ogre'].includes(c.role) && this.evilOf(t)) t.noTurnGood = true; // 相克：被变成政客 / 食人魔的邪恶玩家不能靠自身能力转为善良
          this.changeRole(t, c.role);
          if (c.role === 'drunk') t.shownRole = pickOne(goodOf(this.script).filter((r) => ROLES[r].team === 'townsfolk' && !this.players.some((q) => q.role === r || q.shownRole === r) && !['amnesiac', 'cannibal'].includes(r)), this.rng) ?? 'drunk';
          if (c.role === 'lunatic') t.shownRole = pickOne(rolesOf(this.script, 'demon'), this.rng) ?? 'lunatic';
          if (ROLES[c.role].team === 'demon') {
            this.pitNight = this.st.pitPlan(t, wasDemon, old);
          }
          say(t, `你变成了 **${this.amnName(t, t.shownRole)}**。你的阵营没有变，你仍然是**${this.evilOf(t) ? '邪恶' : '善良'}**的。`); // 变成酒鬼、疯子的人只知道他以为的角色
          this.afterChange(say);
          changed.push(t.id);
        } break;
        case 'snakecharmer': for (const p of this.holders('snakecharmer')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (this.atheist) { this.atheistSnake(p, t); continue; } // 无神论者局：别让舞蛇人「选中恶魔却什么都没发生」
          if (!this.demonNow(t) || !t.alive) continue;
          if (broken(p)) { this.flag(p, '舞蛇人选中了恶魔，但失效了，没有交换'); continue; }
          if (this.monsta?.holder === t.id) this.monsta.holder = p.id; // 小怪宝：照看的人「是恶魔」，换过来以后由舞蛇人（现在是邪恶的爪牙）照看
          this.record('st', `舞蛇人 ${this.tag(p.id)} 选中了恶魔 ${this.tag(t.id)}：互换角色和阵营`);
          const was = this.evilOf(p);
          this.swapRoles(p, t);
          p.evil = this.evilOf(t); t.evil = was;
          this.addFx('poison', t.id, null, 'never', '舞蛇人');
          say(p, `你选中了恶魔！**你现在是${this.amnName(p, p.role)}，属于${this.evilOf(p) ? '邪恶' : '善良'}阵营。**`);
          say(t, this.allAmn(t) ? `说书人叫醒了你：**你的角色和阵营都变了。你现在是${this.amnName(t, t.role)}，属于${this.evilOf(t) ? '邪恶' : '善良'}阵营。**` // 全员失忆：不说是舞蛇人换的（等于告诉他现在是舞蛇人）
            : `舞蛇人选中了你。**你现在是${ROLES[t.role].name}，属于${this.evilOf(t) ? '邪恶' : '善良'}阵营**，并且中毒了。`);
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
          say(t, `${t.id === p.id && this.allAmn(t) ? '说书人叫醒了你' : '洗脑师选中了你'}：**明天白天和夜晚，你要「疯狂」地证明自己是${ROLES[c.role].name}**，不然你可能被处决。`);
        } break;
        case 'widow': for (const p of this.holders('widow')) {
          if (this.used[p.id]) continue;
          if (!this.widowTold) { // 官方：「得知」标记在开局准备时就放好了，始终会有一名善良玩家知道寡妇在场
            this.widowTold = true;
            const w = this.st.widowWitness(p);
            if (w) { say(w, '**寡妇在场。**（你不知道她是谁，也不知道谁中毒了。）'); this.record('info', `${this.tag(w.id)} 得知寡妇在场`); }
          }
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          this.used[p.id] = true;
          this.record('choice', `寡妇 ${this.tag(p.id)} 选了 ${this.tag(t.id)}`);
          if (broken(p)) { this.flag(p, '寡妇失效，没有人中毒'); continue; }
          this.addFx('poison', t.id, p.id, 'never', '寡妇');
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
          if (t.alive && !t.apparentDead) { this.record('st', `教授选的 ${this.tag(t.id)} 已经活着——不算用掉`); continue; } // 假死的僵怖：按选中恶魔算，用掉
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
        case 'grandmother': for (const p of this.holders('grandmother')) {
          if (this.firstDone[`grandmother-${p.id}`]) continue;
          this.firstDone[`grandmother-${p.id}`] = true;
          this.grandmotherSNV(p, tell);
        } break;
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
            const immune = t && (this.safeFrom(t, 'demon')?.includes('僧侣') || (this.has(t, 'soldier') && this.abilityOn(t, 'soldier')));
            if (immune) this.record('st', `普卡选了 ${this.tag(t.id)}，但恶魔的能力对他无效：没有中毒`);
            else if (t) this.addFx('poison', t.id, d.id, 'never', '普卡');
            // 选完之后，上一个中毒者死亡并恢复健康（死的那一刻还中着毒）；被保护就只恢复健康
            if (prev) {
              if (this.pitNight?.suppress) this.record('st', '今晚的死亡由说书人决定：普卡的毒没有毒死人');
              else this.demonHit(d, prev, messages);
              if (prev.id !== t?.id) this.fx = this.fx.filter((x) => !(x.kind === 'poison' && x.source === d.id && x.target === prev.id));
            }
            this.pukkaVictim = immune ? null : t?.id ?? null;
            if (this.midNight) return pause();
          } break;
        case 'washerwoman': case 'librarian': for (const p of this.holders(step)) {
          if (this.firstDone[`${step}-${p.id}`]) continue; // 首夜能力：中途拿到的人（哲学家、食人族、失忆者、麻脸巫婆）当晚拿一次
          this.firstDone[`${step}-${p.id}`] = true;
          const kind = step === 'washerwoman' ? 'townsfolk' : 'outsider';
          const r = this.st.teamPairSNV(p, kind, this.lieMode(p));
          if (!r) { tell(p, kind === 'outsider' ? '场上**没有**外来者。' : '没有可以告诉你的信息。', '你得知：**没有**。'); continue; }
          const [a, b] = r.pair.map((q) => `**${this.name(q.id)}**`);
          tell(p, `${a} 与 ${b} 之中，有一人是 **${ROLES[r.role].name}**。`, `你看到了两名玩家 ${a}、${b} 和一个角色 **${ROLES[r.role].name}**。`);
        } break;
        case 'chef': for (const p of this.holders('chef')) {
          if (this.firstDone[`chef-${p.id}`]) continue;
          this.firstDone[`chef-${p.id}`] = true;
          const n = this.players.length;
          const evil = this.players.map((q) => this.seenEvil(q, '厨师', q.role === 'recluse' ? 'good' : 'evil')); // 陌客被算成邪恶会多出一对、指向真邪恶
          let pairs = 0;
          for (let i = 0; i < n; i++) if (evil[i] && evil[(i + 1) % n]) pairs++;
          const v = this.infoNumber(p, pairs, { min: 0, max: n }, (w) => this.players.reduce((k, q, i) => k + (w.evil.has(q.id) && w.evil.has(this.players[(i + 1) % n].id) ? 1 : 0), 0));
          tell(p, `场上有 **${v}** 对相邻的邪恶玩家。`, `你得知了一个数字：**${v}**。`);
        } break;
        case 'fortuneteller': for (const p of this.holders('fortuneteller')) {
          const herring = this.redHerring && this.get(this.redHerring);
          if (!herring || this.evilOf(herring)) { // 官方：干扰项变成邪恶，说书人要重新选一名善良玩家；中途拿到占卜师能力的人也要有干扰项
            const next = this.st.redHerring();
            if (next && next !== this.redHerring) { this.redHerring = next; this.record('st', `占卜师的干扰项${herring ? '变成了邪恶，换成' : '定为'} ${this.tag(next)}`); }
          }
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
        case 'mezepheles': for (const p of this.holders('mezepheles')) {
          const m = this.mez;
          if (!m) continue;
          if (!m.told) { m.told = true; tell(p, `你的关键词是「**${m.word}**」。第一个说出它的善良玩家今晚会变成邪恶（他要开着收音页说，说书人才听得到）。`, `你得知了一个词：「**${m.word}**」。`); }
          const t = m.hit && this.get(m.hit);
          if (!t || m.used) continue;
          m.used = true; // 当晚醉了也算用掉，以后不能再转任何人（官方）
          if (broken(p)) { this.flag(p, '灵言师失效：说出关键词的人没有变成邪恶，能力也用掉了'); continue; }
          if (this.evilOf(t)) continue;
          if (this.ivoryFull()) { this.record('st', `圣洁之魂：邪恶玩家已经比开局多了一名，${this.tag(t.id)} 没有变成邪恶`); continue; }
          t.evil = true;
          say(t, '说书人叫醒了你：**你现在是邪恶阵营**。（你说出了某个关键词。你的角色不变，但从现在起和邪恶一起赢。）');
          this.record('st', `${this.tag(t.id)} 变成了邪恶`);
        } break;
        case 'poppygrower': this.poppyReveal(messages); break;
        case 'engineer': for (const p of this.holders('engineer')) {
          const c = this.choiceOfSNV(p); if (!c?.role) continue;
          this.used[p.id] = true;
          this.record('choice', `工程师 ${this.tag(p.id)} 选了${ROLES[c.role].name}`);
          if (broken(p)) { this.flag(p, '工程师失效，邪恶角色没有变'); continue; }
          const isDemon = ROLES[c.role].team === 'demon';
          const pool = this.players.filter((q) => team(q) === (isDemon ? 'demon' : 'minion'));
          if (pool.some((q) => q.role === c.role)) { this.record('st', `${ROLES[c.role].name}本来就在场：没有变化`); continue; }
          const live = pool.filter((q) => q.alive);
          // 官方：选的是「哪些爪牙在场」。这里一次只选一个角色：恶魔整个换掉；爪牙由说书人挑一名换成它
          // 官方：选恶魔 → 恶魔变成它；选爪牙要选「和本局爪牙人数一样多」的角色。界面一次只选一个角色，
          // 按「选的数量不对时，说书人以公平可行的方式改变一定数量的邪恶玩家」：说书人挑一名爪牙换成它（全换会出现重复角色）
          const sitter = isDemon && !pool.length && this.monsta ? this.get(this.monsta.holder) : null; // 小怪宝在场：照看的人变成这个恶魔
          const ts = sitter ? [sitter] : isDemon ? [live[0] ?? pool[0]].filter(Boolean) : [this.st.choose('engineerMinion', live.length ? live : pool, { who: p.id })].filter(Boolean);
          if (!ts.length) continue;
          if (sitter) { this.monsta = null; this.record('st', `工程师选了恶魔：照看小怪宝的 ${this.tag(sitter.id)} 变成${ROLES[c.role].name}，小怪宝离场`); }
          for (const t of ts) {
            this.changeRole(t, c.role);
            say(t, `说书人叫醒了你：**你现在是${this.amnName(t, c.role)}**。${this.allAmn(t) ? '' : ROLES[c.role].ability}`);
            this.record('st', `${this.tag(t.id)} 被工程师变成了${ROLES[c.role].name}`);
            changed.push(t.id);
          }
          if (c.role === 'mezepheles' && !this.mez) this.mez = { word: this.st.choose('mezWord', this.mezEasy ? MEZ_WORDS_EASY : MEZ_WORDS), used: false, hit: null };
        } break;
        case 'lilmonsta': if (this.monsta && this.monstaStep(i, messages, first) === 'pause') return pause(); break;
        case 'alchemist': for (const p of this.players.filter((q) => q.role === 'alchemist' && q.gained && this.active(q))) {
          if (this.firstDone[`alchemist-${p.id}`]) continue;
          this.firstDone[`alchemist-${p.id}`] = true;
          say(p, `你是炼金术士，你拥有**${ROLES[p.gained].name}**的能力：${ROLES[p.gained].ability}\n（你仍是善良阵营；之后在${ROLES[p.gained].name}醒来的时候你会醒来用这个能力。）`);
          this.record('info', `炼金术士 ${this.tag(p.id)} 拿到了${ROLES[p.gained].name}的能力`);
        } break;
        case 'lleech': for (const p of this.players.filter((q) => q.role === 'lleech' && q.alive)) {
          if (this.blocked === p.id) continue;
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (first) { // 首夜：选宿主（他中毒）。失效时选的宿主也算（集石百科：宿主由他的选择决定），毒照样下
            this.lleechHost = t.id;
            if (!broken(p)) this.addFx('poison', t.id, p.id, 'never', '痢蛭');
            this.record('choice', `痢蛭 ${this.tag(p.id)} 选 ${this.tag(t.id)} 当宿主${broken(p) ? '（痢蛭失效，没有中毒）' : '：他中毒'}`);
            continue;
          }
          for (const d of this.pitNight?.kill?.splice(0) ?? []) this.snvDie(d, 'pithag', messages);
          if (broken(p)) { if (t.alive) this.flag(p, '恶魔失效，没有杀死人'); continue; }
          if (this.pitNight?.suppress) { this.record('st', '今晚的死亡由说书人决定：这一刀没有生效'); continue; }
          this.demonHit(p, t, messages);
          if (this.midNight) return pause();
        } break;
        case 'fearmonger': for (const p of this.holders('fearmonger')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          if (broken(p)) { this.flag(p, '恐惧之灵失效，这次选的人不算'); continue; }
          if (this.fear?.target === t.id && this.fear.by === p.id) { this.record('choice', `恐惧之灵 ${this.tag(p.id)} 还是选 ${this.tag(t.id)}`); continue; }
          this.fear = { by: p.id, target: t.id };
          this.fearNews = this.night; // 第一次选、换了人：天亮时全场都会知道（不说是谁）
          this.record('choice', `恐惧之灵 ${this.tag(p.id)} 选了新的人：${this.tag(t.id)}（他提名并处决这人，这人的阵营落败）`);
        } break;
        case 'alhadikhia': {
          if (this.atheist) { if (!first && mid?.as !== 'ah_choice') this.atheistKill(messages); break; }
          for (const d of this.pitNight?.kill?.splice(0) ?? []) this.snvDie(d, 'pithag', messages); // 麻脸巫婆造恶魔那晚的死亡，在第一个恶魔行动之前
          if (this.pitNight?.suppress && this.ahNight?.night !== this.night) { if (this.players.some((q) => this.abilityOf(q) === 'alhadikhia' && q.alive)) this.record('st', '今晚的死亡由说书人决定：哈迪寂亚这次没有生效'); break; }
          if (this.ahStep(i, messages) === 'pause') return pause();
        } break;
        case 'pixie': for (const p of this.holders('pixie')) {
          if (this.pixie[p.id]) continue;
          const lie = this.lieMode(p);
          const real = this.players.filter((q) => q.id !== p.id && team(q) === 'townsfolk');
          let t = real.length ? this.st.choose('pixieTarget', real, { who: p.id }) : null;
          let role = t?.role ?? null;
          if (lie) { // 失效：可能给一个不在场的镇民（「疯狂」标记仍放在某个真镇民旁）
            const absent = rolesOf(this.script, 'townsfolk').filter((r) => !this.players.some((q) => q.role === r));
            if (absent.length) { role = this.st.choose('pixieFake', absent, { who: p.id }); this.flag(p, '小精灵得知了一个不在场的镇民'); }
          }
          if (!role) continue;
          this.pixie[p.id] = { role, target: t?.id ?? null, mad: false, gained: false };
          tell(p, `在场的一个镇民是 **${ROLES[role].name}**。如果你「疯狂」地证明自己就是${ROLES[role].name}，等他死了，你会获得他的能力。（白天开着收音页说，说书人才听得到）`, `你得知了一个角色：**${ROLES[role].name}**。`);
        } break;
        case 'ogre': for (const p of this.holders('ogre')) {
          if (this.firstDone[`ogre-${p.id}`]) continue;
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          this.firstDone[`ogre-${p.id}`] = true;
          // 醉酒中毒也照样生效（官方）。相克：间谍对食人魔一定被当作邪恶；陌客被当作邪恶时，食人魔得知自己是邪恶
          const recluseEvil = t.role === 'recluse' && this.misregSNV(t, '食人魔');
          const evil = t.role === 'spy' || recluseEvil || (t.role !== 'recluse' && this.evilOf(t));
          if (p.noTurnGood && !evil) continue;
          p.evil = evil;
          this.record('st', `食人魔 ${this.tag(p.id)} 选了 ${this.tag(t.id)}：变成${evil ? '邪恶' : '善良'}`);
          if (recluseEvil) { p.ogreKnows = true; say(p, '你选的人被当作了邪恶：**你现在是邪恶阵营**。'); }
        } break;
        case 'highpriestess': for (const p of this.holders('highpriestess')) {
          const t = this.st.priestessPick(p, this.lieMode(p));
          if (t) tell(p, `说书人认为你最应该和 **${this.name(t.id)}** 聊一聊。`, `说书人指了指 **${this.name(t.id)}**。`);
        } break;
        case 'huntsman': for (const p of this.holders('huntsman')) {
          const t = this.choiceOfSNV(p)?.targets[0]; if (!t) continue;
          this.used[p.id] = true;
          if (t.role !== 'damsel') { this.record('st', `巡山人选了 ${this.tag(t.id)}：不是落难少女`); continue; }
          if (broken(p)) { this.flag(p, '巡山人找到了落难少女，但他失效了'); continue; }
          const free = rolesOf(this.script, 'townsfolk').filter((r) => !this.players.some((q) => q.role === r || q.shownRole === r));
          const role = free.length ? this.st.choose('huntsmanRole', free, { who: t.id }) : null;
          if (!role) continue;
          this.changeRole(t, role);
          this.afterChange(say);
          say(t, `巡山人找到了你：**你现在是${ROLES[role].name}**。（你不再是落难少女了。）`);
          this.record('st', `巡山人救出了落难少女 ${this.name(t.id)}：她变成了${ROLES[role].name}`);
          changed.push(t.id);
        } break;
        case 'general': for (const p of this.holders('general')) {
          const b = this.st.balance();
          // 有 AI 说书人黄昏的判断（听了今天大家说的话）就照它说；没有就按局势分
          const truth = this.aiLead?.day === this.day ? this.aiLead.side : b > 0.25 ? 'good' : b < -0.25 ? 'evil' : 'neither';
          let said = truth;
          if (this.lieMode(p)) { said = this.st.choose('generalFake', ['good', 'evil', 'neither'].filter((x) => x !== truth), { who: p.id }); this.flag(p, '将军得到了错的局势'); }
          const word = { good: '**善良**正在获胜', evil: '**邪恶**正在获胜', neither: '**两边都没有**明显领先' }[said];
          tell(p, `说书人认为：${word}。`, `你得知：${word}。`);
        } break;
        case 'spy': for (const p of this.holders('spy')) {
          if (broken(p)) this.flag(p, '间谍失效（魔典照看，说书人可以给他看错的）');
          say(p, `魔典（和说书人看到的一样）：\n${this.grimoire(p.id)}${this.bluffs?.length ? `\n恶魔拿到的伪装（不在场的角色）：${this.bluffs.map((r) => ROLES[r].name).join('、')}` : ''}`);
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
          if (this.firstDone[`investigator-${p.id}`]) continue;
          this.firstDone[`investigator-${p.id}`] = true;
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
          const lie = this.lieMode(p);
          const aw = lie === 'atheist' ? this.atheistWorld() : null; // 无神论者局：按假世界的类型给，他才看得到「爪牙」「恶魔」类型的人
          const t = this.st.balloonPick(p, this.balloon[p.id] ?? null, aw ? null : lie, aw);
          if (!t) continue;
          this.balloon[p.id] = aw ? worldTeam(aw, t) : team(t); // 失效时给的人类型可能一样：以后照给他看的人算（官方提示标记的做法）
          if (aw) { const shown = worldTeam(aw, t); this.st.pinAtheist(aw, (w) => worldTeam(w, t) === shown); }
          tell(p, `你得知了 **${this.name(t.id)}**。`, `说书人指了指 **${this.name(t.id)}**。`);
        } break;
        case 'chambermaid': for (const p of this.holders('chambermaid')) { // acted：每一步当时还活着、为用能力醒来的人（见循环开头）
          const ts = this.choiceOfSNV(p)?.targets ?? []; if (ts.length !== 2) continue;
          // 今晚因自己的能力醒过：选过人的、已经拿过信息的，加上排在她后面一定会醒的数学家（官方相克）
          const woke = new Set([...this.woke, ...[...(this.acted ?? [])].filter((id) => id !== this.blocked), ...this.holders('mathematician').map((q) => q.id), ...this.holders('spy').map((q) => q.id)]);
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
          let [a, b] = ts;
          const damsel = [a, b].find((q) => q.role === 'damsel');
          if (damsel) { // 相克：交换落难少女的角色时，另一名参与交换的玩家改由说书人决定
            const other = this.st.choose('barberDamsel', this.players.filter((q) => q.id !== damsel.id && q.alive && team(q) !== 'demon'), { who: d.id });
            if (other) { [a, b] = [damsel, other]; this.record('st', `理发师 + 落难少女（相克）：和落难少女交换的人由说书人改成 ${this.tag(other.id)}`); }
          }
          this.record('st', `理发师：恶魔交换了 ${this.tag(a.id)} 和 ${this.tag(b.id)} 的角色`);
          this.swapRoles(a, b);
          for (const q of [a, b]) say(q, `你的角色被换了：**你现在是${this.amnName(q, q.role)}**。阵营不变，你仍然是**${this.evilOf(q) ? '邪恶' : '善良'}**的。`);
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
          const [good, evil] = this.st.dreamerRoles(t, !!lie, lie ? this.st.snvWorld(p, lie) : null, p);
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
          const dead = this.players.filter((q) => !this.visAlive(q)); // 被当作死亡的僵怖算死人
          const n = this.infoNumber(p, dead.filter((q) => this.seenEvil(q, '神谕者')).length, { min: 0, max: dead.length }, (w) => dead.filter((q) => w.evil.has(q.id)).length);
          tell(p, `死亡的玩家里有 **${n}** 名邪恶。`, `你得知了一个数字：**${n}**。`);
        } break;
        case 'seamstress': for (const p of this.holders('seamstress')) {
          const ts = this.choiceOfSNV(p)?.targets ?? []; if (ts.length !== 2) continue;
          this.used[p.id] = true;
          const same = this.seenEvil(ts[0], '女裁缝') === this.seenEvil(ts[1], '女裁缝');
          let yes = this.infoYes(p, same, (w) => w.evil.has(ts[0].id) === w.evil.has(ts[1].id));
          if (yes === same && this.fibbinLie(p)) yes = !same; // 骗人精：这次给错的
          tell(p, `${ts.map((q) => this.name(q.id)).join(' 与 ')} ${yes ? '**是**' : '**不是**'}同一阵营。`, `你得知：**${yes ? '是' : '否'}**。`);
        } break;
        case 'juggler': for (const p of this.holders('juggler')) {
          let j = this.juggled[p.id];
          // 官方相克：杂耍艺人第一天猜了、当天被处决，今晚活着的食人族得知他猜对了几个
          if (!j && p.role === 'cannibal' && this.lastExecuted && this.get(this.lastExecuted)?.role === 'juggler') j = this.juggled[this.lastExecuted];
          // 官方：新人杂耍艺人忘了公开猜，说书人可以宽容处理，当晚照样唤醒告诉他 0
          if (!j && this.jugglerDay[p.id] === this.day && this.juggleLog?.[p.id] !== this.day && this.newbies?.includes(p.id)) {
            j = { day: this.day, correct: 0, count: 0 };
            this.record('st', `${this.tag(p.id)} 是新人杂耍艺人，今天忘了公开猜：宽容处理，今晚照样告诉他 0`);
          }
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
      if (this.baristaAgain?.(step, i, messages)) return pause(); // 咖啡师：能力生效两次
      if (this.midCheck(steps, i, changed, messages)) return pause();
    }
    this.acrobatCheck?.(messages); // 杂技演员：选的人到夜晚结束时醉酒或中毒了没有
    this.poppyReveal(messages); // 罂粟种植者今晚（在他那一步之后）死了：当晚互认
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
    (this.evilHist ??= []).push({ night: this.night, count: this.players.filter((p) => this.evilOf(p)).length }); // 每晚过后邪恶有几人（博学者「从第几夜开始邪恶数量异常」用）
    if (this.leviDue && !this.winner && this.leviOn()) this.setWinner('evil', '利维坦恢复了清醒健康：第五天已经过了，邪恶立刻获胜'); // 官方
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
    if (!this.seenTownsfolk(a, '贞洁者被提名', 'good')) return null; // 间谍被当成镇民 = 间谍被处决：帮善良
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
    this.snvKill(a, 'witch', this.dayMessages());
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
    if (!p || !p.alive || !this.has(p, 'savant')) throw new Error('只有博学者可以这样问');
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
    if (verdict === 'unknown' || !lie || lie === 'atheist') return verdict; // 无神论者局：问题是按假世界判的，不用翻
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
    (this.goblinClaimDay ??= {})[uid] = this.day; // 官方：「已宣称」标记黄昏移除，每天都能重新声明
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
      if (!this.abilityOn(s, this.extraAbility(s) === 'slayer' ? 'slayer' : this.abilityOf(s))) { if (target) this.flag(s, '枪失效了，打中也没有效果'); } else if (t.alive && target) hit = true;
    }
    this.log.push(`${this.name(s.id)} 对 ${this.name(t.id)} 开枪 → ${hit ? '命中' : '无事发生'}`);
    this.record('slay', `${this.tag(s.id)} 向 ${this.tag(t.id)} 开枪 → ${hit ? '命中' : '无事发生'}`);
    if (hit) { this.snvKill(t, 'slayer', this.dayMessages()); this.checkWinner(); } // 打中僵怖是第一次「假死」
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
    if (!p || !p.alive || !this.has(p, 'fisherman')) throw new Error('只有渔夫可以这样问');
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
    const lie = this.lieMode(p);
    return { text, ability: p.gained, lie: lie === 'atheist' ? null : lie }; // 无神论者局：他没有失效，猜能力照实答
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
    (this.execHist ??= []).push({ day: this.day, id: p.id, by: this.nomBy?.[p.id] ?? null, voters: this.block === p.id ? [...(this.blockVoters ?? [])] : [] }); // 政客终局判责任用
    const goodTwin = this.twinGoodId();
    const on = this.twinOn();
    // 利维坦：处决了就算（死人、没死都算），看的是被处决那一刻的阵营；同一个人只算一次
    const levi = this.leviOn() && !this.evilOf(p) && !this.leviGood.includes(p.id);
    if (levi) { this.leviGood.push(p.id); this.record('st', `利维坦在场：第 ${this.leviGood.length} 名善良玩家被处决`); }
    const gob = this.goblinMark?.id === p.id && this.goblinMark.day === this.day;
    const saint = this.has(p, 'saint') && p.alive && !this.snvBroken(p);
    const boom = this.has(p, 'boomdandy') && this.active(p) && !this.snvBroken(p); // 官方：被处决但没死也会爆
    const res = this.snvKill(p, 'execution', this.dayMessages());
    // 送葬者看的是「今天死于处决」的人：处决死人、处决了没死都不算（原来的暗流涌动引擎也是这样）
    if (this.phase !== 'night') { if (res === 'died' || res === 'fake') this.lastExecuted = p.id; else if (this.lastExecuted === p.id) this.lastExecuted = null; }
    if (res === 'died' && saint) this.setWinner(this.evilOf(p) ? 'good' : 'evil', `圣徒 ${this.name(p.id)} 被处决`);
    if (boom && !this.winner) this.boomStart(p);
    if (res === 'died' && team(p) === 'minion') { // 吟游诗人：爪牙死于处决，除他以外所有人醉酒到明天黄昏
      const min = this.holders('minstrel').find((q) => q.alive && !this.snvBroken(q));
      if (min) { for (const q of this.players) if (q.id !== min.id && !q.traveller) this.fx.push({ kind: 'drunk', target: q.id, source: min.id, until: this.day + 1, why: '吟游诗人' }); this.record('st', '爪牙死于处决：除吟游诗人外所有人醉酒，直到明天黄昏'); }
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
    p = this.scapegoatSwap(p); // 替罪羊可能替死
    this.executedToday = true;
    this.log.push(`${this.name(p.id)} 被处决`);
    if (this.psychoSpared === p.id) { // 精神病患者被处决，猜拳没输：活下来（这次仍算今天的处决）
      this.psychoSpared = null;
      this.record('st', `精神病患者 ${this.tag(p.id)} 被处决，但猜拳没有输：他活了下来`);
      this.fearCheck(p); // 被处决了（没死也算）
      return 'saved';
    }
    const res = this.afterExecution(p);
    this.fearCheck(p);
    return res;
  },

  endDaySNV() {
    let executed = null; let result = null;
    if (this.pendingMoonchild) { // 月之子拖到黄昏还没选：替他随机选一名存活玩家
      const opts = this.players.filter((q) => this.visAlive(q) && q.id !== this.pendingMoonchild);
      if (opts.length) this.moonchildChoose(this.pendingMoonchild, pickOne(opts, this.rng).id); else this.pendingMoonchild = null;
    }
    if (!this.winner && !this.executedToday && this.block && this.pardonDay !== this.day) {
      executed = this.block;
      if (executed === ST_NOMINEE) { // 说书人被处决：无神论者局善良赢，不是就邪恶赢
        this.executedToday = true; result = 'storyteller';
        this.record('st', '说书人被处决了');
        this.setWinner(this.atheist ? 'good' : 'evil', this.atheist ? '说书人被处决：场上真的没有邪恶，无神论者带领善良获胜' : '说书人被处决，但场上没有无神论者：邪恶获胜');
      } else result = this.executeSNV(this.get(executed));
    }
    if (!this.winner && this.mastermindDay === this.day) this.setWinner('good', '主谋的额外一天没有处决任何人，善良获胜');
    if (!this.winner && !this.executedToday && this.vortoxOn()) this.setWinner('evil', '涡流在场，今天没有人被处决');
    if (!this.winner && !this.executedToday && this.aliveCount() === 3) { // 镇长：活着的旅行者也算（官方：他们必须先被流放）
      const mayor = this.holders('mayor').find((q) => q.alive && !this.snvBroken(q));
      if (mayor) this.setWinner(this.evilOf(mayor) ? 'evil' : 'good', `只剩三人且无人被处决，镇长 ${this.name(mayor.id)} 带领${this.evilOf(mayor) ? '邪恶' : '善良'}获胜`);
    }
    const harpyDead = this.winner ? [] : this.harpyPenalty();
    if (!this.winner && this.day >= 5 && this.leviOn()) this.setWinner('evil', `第 ${this.day} 个白天结束，利维坦获胜`);
    else if (!this.winner && this.day >= 5 && this.players.some((q) => q.role === 'leviathan' && q.alive)) this.leviDue = true; // 官方：之后一恢复清醒健康，邪恶立刻获胜（天亮时再看）
    if (!this.winner && SCRIPTS[this.script]?.riot && this.day >= 3 && this.demonsAlive().length) this.setWinner('evil', '第三个白天结束，暴乱还活着，邪恶获胜');
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
    for (const q of dead) this.snvKill(q, 'harpy', this.dayMessages());
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
    const real = team(p) === 'minion' && !this.damselGuessed; // 能力是落难少女的，死了的爪牙也能猜
    if (real) this.damselGuessed = true;
    const hit = real && t.role === 'damsel' && t.alive; // 落难少女死了就没有能力，猜中也不算
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
    for (const q of this.alive().filter((x) => !keep.has(x.id))) this.snvKill(q, 'boomdandy', this.dayMessages());
    this.boom = { day: this.day, alive: this.alive().map((q) => q.id), points: {} }; // 有人被保住（水手、茶艺师、弄臣……）就不止三个
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
    this.snvKill(this.get(who[0]), 'boomdandy', this.dayMessages());
    this.checkWinner();
    return who[0];
  },

  // ───────────── 夜半狂欢（2026-11-16）─────────────
  /** 圣洁之魂（传奇角色）：邪恶玩家已经比开局多一名，就不能再多。 */
  ivoryFull() { return !!SCRIPTS[this.script]?.ivory && this.players.filter((p) => this.evilOf(p)).length >= (this.evilStart ?? 0) + 1; },

  /** 罂粟种植者首夜挡着：爪牙和恶魔互相不认识（他活着、没失效时）。 */
  poppyHides() { return !this.poppyRevealed && this.players.some((q) => this.abilityOf(q) === 'poppygrower' && q.alive && !this.snvBroken(q)); },
  /** 罂粟种植者死了：当晚爪牙得知恶魔，恶魔得知爪牙（官方：像首夜那样，不再给伪装）。 */
  poppyReveal(messages) {
    if (!this.poppyDue || this.winner) return;
    this.poppyDue = false; this.poppyRevealed = true;
    this.evilKnown = this.knownMap();
    const demon = this.players.find((q) => team(q) === 'demon' && q.alive) ?? this.players.find((q) => team(q) === 'demon');
    const minions = this.players.filter((q) => team(q) === 'minion');
    for (const m of minions) {
      const mates = minions.filter((x) => x.id !== m.id).map((x) => `**${this.name(x.id)}**`);
      messages.push({ playerId: m.id, text: `罂粟种植者死了，你们今晚互相认识：恶魔是 **${demon ? this.name(demon.id) : '?'}**。${mates.length ? `其他爪牙：${mates.join('、')}。` : ''}` });
    }
    if (demon) messages.push({ playerId: demon.id, text: `罂粟种植者死了，你们今晚互相认识：你的爪牙是 ${minions.map((x) => `**${this.name(x.id)}**`).join('、') || '（没有）'}。` });
    this.record('st', '罂粟种植者死了：爪牙和恶魔今晚互相认识');
  },

  /**
   * 哈迪寂亚：恶魔选了三个人，按顺序一个个叫醒，每人悄悄选活或死（选死就死，死人选活就复活）；
   * 三个人最后都活着，三个人一起死。每问一个人结算就停一次（房间层等他选），选的不放进 choices（他自己今晚可能还有能力要用）。
   */
  ahStep(i, messages) {
    let ah = this.ahNight?.night === this.night ? this.ahNight : null;
    if (!ah) {
      const d = this.players.find((q) => q.alive && this.abilityOf(q) === 'alhadikhia' && (this.choiceOfSNV(q)?.targets ?? []).length === 3);
      if (!d || this.blocked === d.id) return null;
      const ts = this.choiceOfSNV(d).targets.map((q) => q.id);
      if (this.snvBroken(d)) { this.flag(d, '哈迪寂亚失效，选中的三个人什么都不用做'); return null; }
      // 死人选「活」当场复活、夜里就是活的（官方百科 How to run：remove their shroud），复活又死就是一次新的死亡，死人票刷新
      // （2026-11-20 用户：问了朋友、看了官方百科，改回会刷新；11-19 那次「入夜死天亮死不刷新」作废）
      ah = this.ahNight = { night: this.night, demon: d.id, targets: ts, idx: 0, picks: {}, asked: null, saved: {}, done: false };
      this.record('choice', `哈迪寂亚 ${this.tag(d.id)} 选了 ${ts.map((id) => this.tag(id)).join('、')}`);
    }
    while (ah.idx < ah.targets.length) {
      const id = ah.targets[ah.idx];
      const t = this.get(id);
      if (ah.asked === id) {
        const c = this.choices[id];
        let pick = c?.role === 'ah_live' || c?.role === 'ah_die' ? c.role : null;
        if (pick) { if (id in ah.saved) this.choices[id] = ah.saved[id]; else delete this.choices[id]; } else pick = this.st.choose('ahPick', ['ah_live', 'ah_die'], { who: id });
        ah.picks[id] = pick; ah.asked = null; ah.idx += 1;
        this.record('choice', `${this.tag(id)} 悄悄选择${pick === 'ah_live' ? '活下去' : '死去'}`);
        if (pick === 'ah_die') this.snvDie(t, 'alhadikhia', messages);
        else if (!t.alive) this.snvRevive(t, '哈迪寂亚选中后选择活下去');
        continue;
      }
      if (this.choices[id]) ah.saved[id] = this.choices[id];
      delete this.choices[id];
      ah.asked = id;
      this.midNight = { step: i, who: id, as: 'ah_choice', messages: [] };
      this.flushed = messages.splice(0);
      return 'pause';
    }
    if (!ah.done) {
      ah.done = true;
      const all = ah.targets.map((id) => this.get(id));
      if (all.every((q) => q.alive)) { this.record('st', '哈迪寂亚：三个人都活着，一起死去'); for (const q of all) this.snvDie(q, 'alhadikhia3', messages); }
      this.ahNews = { night: this.night, targets: [...ah.targets] };
    }
    return null;
  },

  /** 精神病患者：白天提名开始前，公开选一名玩家，他死亡（每天一次）。失效时没人死，今天的这次也用掉。 */
  psychoKill(uid, targetId) {
    if (this.phase !== 'day') throw new Error('只能在白天');
    const p = this.get(uid); const t = this.get(targetId);
    if (!p || !t) throw new Error('玩家不在游戏中');
    if (!p.alive || this.abilityOf(p) !== 'psychopath') throw new Error('你没有这个能力');
    if (!t.alive) throw new Error('要选一名存活的玩家');
    if (this.psychoDay[uid] === this.day) throw new Error('你今天已经用过了');
    this.psychoDay[uid] = this.day;
    this.record('slay', `${this.tag(uid)} 以精神病患者的身份公开选择了 ${this.tag(targetId)}`);
    if (this.snvBroken(p)) { this.flag(p, '精神病患者失效，被选的人没有死'); return { died: false }; }
    const res = this.snvKill(t, 'psychopath', this.dayMessages());
    this.checkWinner();
    return { died: res === 'died' };
  },

  /** 有无神论者的剧本：活人可以提名说书人（被处决就看场上有没有真的无神论者）。 */
  nominateST(aid) {
    if (!inScript('atheist', this.script)) throw new Error('这个剧本不能提名说书人');
    const a = this.get(aid);
    if (!a) throw new Error('提名者不在游戏中');
    if (!this.visAlive(a)) throw new Error('死亡玩家不能提名');
    if (this.golemBlocked?.(a)) throw new Error('你整局只能提名一次，已经用掉了'); // 魔像：提名说书人也算那一次（官方）
    if (this.nominators.has(a.id)) throw new Error('你今天已经提名过了');
    if (this.nominees.has(ST_NOMINEE)) throw new Error('说书人今天已经被提名过了');
    if (this.has(a, 'golem') && a.role === 'golem') this.used[`golem-${a.id}`] = true; // 检查都过了才算用掉
    this.nominators.add(a.id);
    this.nominees.add(ST_NOMINEE);
    (this.nomBy ??= {})[ST_NOMINEE] = a.id;
    (this.nomHistory ??= []).push([a.id, 'storyteller']);
    this.log.push(`第${this.day}天 ${this.name(a.id)} 提名 说书人`);
    this.record('nominate', `${this.tag(a.id)} 提名了说书人`);
    return { virgin: false, storyteller: true };
  },

  // ───────────── 横行霸道（Outed Evil，2026-11-19）─────────────
  /** 痢蛭的宿主死了：痢蛭立刻死（善良多半就赢了）；痢蛭失效就先不死，等他恢复清醒健康（集石百科）。 */
  lleechLink(messages) {
    for (const l of this.players.filter((q) => q.role === 'lleech' && q.alive)) {
      if (this.snvBroken(l)) { this.lleechDue = true; this.record('st', `痢蛭的宿主死了，但痢蛭 ${this.tag(l.id)} 失效了：先不死，恢复清醒健康时立刻死`); continue; }
      this.snvDie(l, 'lleech', messages);
    }
  },
  /** 痢蛭欠着的死：恢复清醒健康了就死（胜负判定前看一次）。 */
  lleechTick() {
    if (!this.lleechDue) return;
    const l = this.players.find((q) => q.role === 'lleech' && q.alive);
    if (!l) { this.lleechDue = false; return; }
    if (this.snvBroken(l)) return;
    this.lleechDue = false;
    this.snvDie(l, 'lleech', this.phase === 'night' ? [] : this.dayMessages());
  },
  /** 恐惧之灵：他提名了自己选中的人、这人被处决（死没死都算），这人的阵营落败。 */
  fearCheck(p) {
    const f = this.fear;
    if (!f || f.target !== p.id || this.winner) return;
    const by = this.get(f.by);
    if (!by || this.nomBy?.[p.id] !== by.id || !this.has(by, 'fearmonger') || this.snvBroken(by)) return;
    this.setWinner(this.evilOf(p) ? 'good' : 'evil', `恐惧之灵 ${this.name(by.id)} 提名并处决了他选中的 ${this.name(p.id)}：${this.evilOf(p) ? '邪恶' : '善良'}阵营落败`);
  },

  // ───────────── 小怪宝（夜半狂欢的恶魔开关，2026-11-19 用户；口径照集石百科小怪宝页）─────────────
  /** 首夜：没有恶魔信息和伪装；爪牙一起醒来选照看的人，所以互相认识（罂粟种植者活着时一个个醒，互不认识）。人少也一样。 */
  monstaInfo(minions, say, messages) {
    if (this.poppyHides()) {
      this.poppyHid = true;
      this.evilKnown = Object.fromEntries(minions.map((m) => [m.id, []]));
      for (const m of minions) say(m, '**小怪宝在场**（这局没有恶魔玩家）：你们爪牙每晚决定由谁照看它，照看的人「是恶魔」。**罂粟种植者在场**：你不知道其他爪牙是谁。');
      return messages;
    }
    this.evilKnown = Object.fromEntries(minions.map((m) => [m.id, minions.filter((x) => x.id !== m.id).map((x) => ({ id: x.id, team: '爪牙' }))]));
    for (const m of minions) {
      const mates = minions.filter((x) => x.id !== m.id).map((x) => `**${this.name(x.id)}**`);
      say(m, `**小怪宝在场**（这局没有恶魔玩家）：你们爪牙每晚决定由谁照看它，照看的人「是恶魔」——他死了善良获胜，所以要交给信得过、藏得好的人。${mates.length ? `其他爪牙：${mates.join('、')}。` : '你是唯一的爪牙。'}`);
    }
    return messages;
  },
  /**
   * 每晚：爪牙决定照看的人（由现在照看的爪牙替大家指，他死了就由一名活着的爪牙指；机器人或超时由说书人定），
   * 告诉所有活着的爪牙；首夜以外说书人杀一人（照聪明的恶魔挑：读场里被信任的、在报信息的、指认照看者的）。
   */
  monstaStep(i, messages, first) {
    const m = this.monsta;
    if (m.done === this.night) return null;
    const sitters = this.players.filter((q) => q.alive && this.evilOf(q) && team(q) === 'minion');
    if (m.asked) {
      const c = this.choices[m.asked];
      const pickId = c?.targets?.[0];
      if (m.saved) this.choices[m.asked] = m.saved; else delete this.choices[m.asked];
      m.asked = null; m.saved = null;
      this.monstaSet(sitters.some((q) => q.id === pickId) ? pickId : this.st.monstaSitter(sitters, m)?.id, messages);
    } else if (sitters.length > 1) {
      const asker = sitters.find((q) => q.id === m.holder) ?? sitters[0];
      m.saved = this.choices[asker.id] ?? null;
      delete this.choices[asker.id];
      m.asked = asker.id;
      this.midNight = { step: i, who: asker.id, as: 'lm_sit', messages: [] };
      this.flushed = messages.splice(0);
      return 'pause';
    } else if (sitters.length === 1) this.monstaSet(sitters[0].id, messages);
    m.done = this.night;
    if (first || this.winner) return null;
    for (const d of this.pitNight?.kill?.splice(0) ?? []) this.snvDie(d, 'pithag', messages); // 麻脸巫婆造恶魔那晚的死亡，在第一个恶魔行动之前
    if (this.pitNight?.suppress) { this.record('st', '今晚的死亡由说书人决定：小怪宝这一刀没有生效'); return null; }
    const holder = this.get(m.holder);
    const pool = this.alive().filter((q) => q.id !== m.holder && !this.evilOf(q));
    const v = holder?.alive && pool.length ? this.st.monstaVictim(pool, holder) : null;
    if (v) this.demonHit(holder, v, messages);
    return null;
  },
  monstaSet(id, messages) {
    const m = this.monsta;
    if (!id || !this.get(id)) return;
    const changed = m.holder !== id;
    m.holder = id;
    this.record('choice', `爪牙们让 ${this.tag(id)} 照看小怪宝${changed ? '（换人了）' : ''}`);
    for (const q of this.players.filter((x) => x.alive && this.evilOf(x) && team(x) === 'minion')) {
      messages.push({ playerId: q.id, text: q.id === id ? '今晚由**你**照看小怪宝：你「是恶魔」，你死了善良就赢了。' : `今晚由 **${this.name(id)}** 照看小怪宝。` });
    }
  },

  /** 无神论者局：说书人假装的恶魔每晚杀一个人（不杀假世界里的「邪恶」）。 */
  atheistKill(messages) {
    const w = this.atheistWorld();
    const pool = this.alive().filter((q) => !w.evil.has(q.id));
    const v = pool.length ? this.st.atheistVictim(pool, w) : null; // 照聪明的真恶魔挑人（读场：杀被信任的、指认假恶魔的，不杀在推处决说书人的）
    if (!v) return;
    this.record('st', `无神论者局：说书人假装恶魔，杀死了 ${this.tag(v.id)}`);
    this.snvDie(v, 'demon', messages);
  },
  atheistWorld() { return this.st.snvWorld(this.players.find((q) => q.role === 'atheist') ?? this.players[0], 'atheist'); },
  /** 假恶魔死了：说书人改把另一个「邪恶」当成恶魔，信息接着对得上。 */
  atheistShift(p) {
    const w = this.st.worlds?.get('atheist');
    if (!w || w.demon !== p.id) return;
    this.atheistMoveDemon(p.id, '死了');
  },
  /**
   * 无神论者局：假恶魔要换人（死了、被舞蛇人选中）。官方无神论者页：说书人可以打破规则来模拟邪恶在场。
   * 大家不知道死的是不是恶魔，所以只要换得前后对得上，游戏照常往下走，看不出破绽：
   * 先在「和给过的信息都对得上」的活着的假邪恶里挑（大家越不怀疑越像藏得好的恶魔）；没有对得上的，
   * 再从活着的假邪恶里挑；都死光了才从活人里补一个（这时邪恶人数可能和之前的信息对不上，记下风险）。
   */
  atheistMoveDemon(fromId, why) {
    const w = this.st.worlds?.get('atheist');
    if (!w) return null;
    const alive = (id) => id !== fromId && this.get(id)?.alive;
    const fit = [...w.evil].filter((id) => alive(id) && (!w.demonOk || w.demonOk.includes(id))).map((id) => this.get(id));
    const evilLeft = [...w.evil].filter(alive).map((id) => this.get(id));
    const extra = this.alive().filter((q) => q.id !== fromId && q.role !== 'atheist' && !w.evil.has(q.id));
    const pool = fit.length ? fit : evilLeft.length ? evilLeft : extra;
    const next = pool.length ? this.st.atheistHeir(pool, w) : null;
    if (!next) return null;
    w.demon = next.id; w.evil.add(next.id);
    if (!fit.length) w.demonOk = null; // 已经对不上了：之后重新开始记
    const risk = fit.length ? '之前给出的信息都对得上' : evilLeft.length ? '有一条跟恶魔有关的信息可能对不上' : '假世界里的邪恶都死光了，只好补一个，邪恶人数可能和之前的信息对不上';
    this.record('st', `无神论者局：假装的恶魔 ${this.tag(fromId)} ${why}，说书人改把 ${this.tag(next.id)} 当成恶魔（${risk}），${this.tag(fromId)} 就算是爪牙，游戏照常进行`);
    return next;
  },
  /** 无神论者局的舞蛇人：选中真恶魔会和他互换。这里没有恶魔可换，说书人就让「恶魔」不是他（换人），以后他也不能当恶魔。 */
  atheistSnake(p, t) {
    const w = this.atheistWorld();
    if (w.demon === t.id && t.alive) this.atheistMoveDemon(t.id, `被舞蛇人 ${this.tag(p.id)} 选中（真恶魔会和舞蛇人互换，这里不能换）`);
    w.demonOk = (w.demonOk ?? [...w.evil]).filter((id) => id !== t.id);
  },
  /**
   * 无神论者局给大模型看的「真实情况」（艺术家的问题、渔夫的建议）：按说书人假装的那个邪恶阵营写，
   * 不提无神论者，也不带说书人手记（手记里写着这是无神论者局）。
   */
  factsFake() {
    const w = this.atheistWorld();
    const ppl = this.players.map((q) => {
      const role = q.id === w.demon ? '恶魔（哈迪寂亚或亡骨魔，说书人还没定）' : w.evil.has(q.id) ? '爪牙（具体角色说书人还没定）' : q.role === 'atheist' ? '镇民（具体角色保密）' : `${ROLES[q.role].name}（${{ townsfolk: '镇民', outsider: '外来者' }[team(q)] ?? '镇民'}）`;
      return `${q.seat}号 ${q.name}：${role}，${w.evil.has(q.id) ? '邪恶' : '善良'}，${q.alive ? '存活' : '死亡'}`;
    });
    return [`剧本：${SCRIPTS[this.script].name}。现在是第 ${this.day} 天，共 ${this.players.length} 名玩家。场上没有无神论者。`, '玩家：', ...ppl, '', '公开发生过的事：', ...this.publicEvents()].join('\n');
  },
  /** 公开发生过的事：提名、投票、处决、死亡（不带死因）。读场、无神论者局的假情况用。 */
  publicEvents() {
    return (this.log ?? []).filter((l) => /提名|投票|被处决|死亡|复活/.test(l)).map((l) => l.replace(/死亡（[^）]*）/, '死亡')).slice(-60);
  },
  /** 读场给大模型的公开情况：座位、生死、公开声明、提名投票处决记录。不含任何人的真实身份。 */
  publicFacts() {
    const ppl = this.players.map((q) => `${q.seat}号 ${q.name}：${q.alive ? '存活' : '死亡'}${this.claims?.[q.id] ? `，公开声明自己是${ROLES[this.claims[q.id]]?.name ?? this.claims[q.id]}` : ''}`);
    return [`剧本：${SCRIPTS[this.script].name}。现在是第 ${this.day} 天，共 ${this.players.length} 名玩家，存活 ${this.aliveCount()} 人。`, '玩家：', ...ppl, '', '公开发生过的事：', ...this.publicEvents()].join('\n');
  },

  /** 骗人精（传奇角色）：每局一次，一名善良玩家可能得到错误信息。说书人掷骰子，用掉了就再也不会。 */
  fibbinLie(p) {
    if (!SCRIPTS[this.script]?.fibbin || this.fibbinUsed || this.evilOf(p)) return false;
    const b = this.st.balance(); // 局势：善良领先时多发生（以前没传，权重一直不起作用，固定 20%）
    if (!this.st.roll('fibbin', { balance: b }, { who: p.id, b })) return false;
    this.fibbinUsed = true;
    this.record('st', `骗人精：${this.tag(p.id)} 这次拿到的是错误信息（每局一次）`);
    return true;
  },

  // ───────────── 暴乱（旧版 v1）─────────────
  // 官方 v1 运作方式：任何人被提名都立即死亡（不投票）；他可以立刻接着提名（死了也能、今天提名过也能），
  // 不提名今天的提名就结束、入夜；第三天必须提名，不提名说书人替他提。死人不能被提名。
  // 所有活着的暴乱都失效时能力不在，提名投票照常（这个剧本没有醉酒中毒，留着口子）。
  riotOn() { return !!SCRIPTS[this.script]?.riot && this.players.some((p) => p.alive && p.role === 'riot' && !this.snvBroken(p)); },
  /** 被提名的人当场死亡；没分出胜负他就是下一个提名的人。 */
  riotNominated(b) {
    this.snvKill(b, 'riot', this.dayMessages());
    this.checkWinner();
    this.riotChain = this.winner ? null : b.id;
  },
  /** 第三天没人提名、或该提名的人时间到了：说书人替他挑一名存活玩家（官方：说书人替他提名）。 */
  riotPick(byId) {
    const pool = this.players.filter((q) => q.alive && q.id !== byId && !this.nominees.has(q.id));
    return this.st.choose('riotForced', pool, { who: byId ?? undefined });
  },
  /** 第三天没有人提名：说书人发起第一次提名。 */
  riotStoryteller(targetId) {
    const b = this.get(targetId);
    if (this.phase !== 'day' || !b?.alive) throw new Error('只能提名一名存活玩家');
    this.nominees.add(b.id);
    this.log.push(`第${this.day}天 说书人提名 ${this.name(b.id)}`);
    this.record('nominate', `第三天没有人提名：说书人提名了 ${this.tag(b.id)}`);
    this.riotNominated(b);
  },

  checkWinnerSNV() {
    if (this.winner) return this.winner;
    this.lleechTick?.();
    if (this.atheist) { // 无神论者局：没有恶魔可杀，处决说书人才赢；只剩两人善良落败
      if (this.townAlive() <= 2) this.setWinner('evil', '只剩两名存活玩家：说书人始终没有被处决，善良落败（场上其实没有邪恶）');
      return this.winner;
    }
    if (this.mastermindDay != null) return null; // 主谋的额外一夜一天：胜负在那天黄昏定
    const noDemon = !this.demonsAlive().length;
    const mm = noDemon && this.demonExecuted && this.holders('mastermind').find((q) => q.alive && !this.snvBroken(q));
    if (mm) { this.mastermindDay = this.day + 1; this.record('st', '恶魔死于处决，但主谋还活着：额外进行一个夜晚和一个白天'); return null; }
    if (noDemon && !this.twinBlocks()) this.setWinner('good', SCRIPTS[this.script]?.riot ? '所有暴乱都死了' : '恶魔已经死亡');
    else if (this.townAlive() <= 2) this.setWinner('evil', noDemon ? '恶魔已死，但双子挡着善良，只剩两名存活玩家，邪恶获胜' : '只剩两名存活玩家，恶魔获胜'); // 官方：邪恶的胜利条件只看人数，不看恶魔死活
    else if (!noDemon && this.allAliveEvil()) this.setWinner('evil', '存活的玩家全是邪恶，善良已经无法获胜');
    return this.winner;
  },

  /** 给 AI 判定用的整局真实情况。 */
  factsSNV() {
    const TEAM = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };
    const ppl = this.players.map((q) => `${q.seat}号 ${q.name}：${ROLES[q.role].name}（${TEAM[team(q)]}${q.gained ? `，获得了${ROLES[q.gained].name}的能力` : ''}${q.shownRole && q.shownRole !== q.role && ROLES[q.shownRole] && !q.shownRole.startsWith('amn_') ? `，以为自己是${ROLES[q.shownRole].name}` : ''}），${this.evilOf(q) ? '邪恶' : '善良'}阵营，${q.alive ? '存活' : '已死亡'}`);
    const tl = this.timeline.map((e) => `[${e.when}] ${e.text}`);
    return [`剧本：${SCRIPTS[this.script].name}。现在是第 ${this.day} 天白天，共 ${this.players.length} 名玩家。`, '玩家：', ...ppl, '', '复盘时间线（到现在为止）：', ...tl].join('\n');
  },
};
