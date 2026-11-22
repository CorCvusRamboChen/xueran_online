// 血染钟楼的规则引擎（暗流涌动 + 黯月初升 + 梦殒春宵）。纯逻辑，不碰 Discord，方便测试。
// 暗流涌动的规则写在这个文件里；黯月初升的在 bmr.js，梦殒春宵的在 snv.js（script 对应时各个方法转过去）。
//
// 用法（一晚）：
//   const prompts = game.startNight();      // 谁需要选人
//   game.submitChoice(playerId, [ids...]);  // 收集选择
//   const res = game.resolveNight();        // 结算：私密信息、死亡、守鸦人
//   if (res.ravenkeeper) game.resolveRavenkeeper(targetId)
//   const dawn = game.dawn();               // 天亮公布死讯
// 白天：nominate → voteOrder / recordVote → endDay

import { TRAVELLER_METHODS } from './travellers.js';
import { ROCHAMBEAU_METHODS } from './rochambeau.js';
import { ALL_AMNESIAC_METHODS } from './allAmnesiac.js';
import {
  ROLES, TOWNSFOLK, OUTSIDERS, MINIONS, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, isEvilRole, SCRIPTS, engineOf, ragnarokWolves, inScript, rolesOf,
} from './roles.js';
import { Storyteller } from './storyteller.js';
import { BMR_METHODS } from './bmr.js';
import { SNV_METHODS } from './snv.js';

export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const shuffle = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sample = (arr, n, rng) => shuffle(arr, rng).slice(0, n);
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// 信息位（说书人圈子的经验，官方没有推荐）：大信息 = 每晚都给、最能抓人的共情者和占卜师；小信息 = 首夜给一次的"F4"。
export const BIG_INFO = ['empath', 'fortuneteller'];
export const SMALL_INFO = ['washerwoman', 'librarian', 'investigator', 'chef'];

/**
 * 暗流涌动的 AI 配板：12 人及以下时按经验调信息位，全是概率、不是硬规定（"不要一直有"）：
 * · 共情者和占卜师同时在场的概率降低（大约只留三分之一）；
 * · F4 一般给 1–2 个（0 个、3 个以上很少出）；
 * · 有男爵时多半也有图书管理员（男爵多出两个外来者，图书管理员能看到外来者）。
 * 13 人以上照常随机。做法：照常随机出一套，按上面的条件以一定概率"接受"，不接受就重抽。
 */
export function rollTB(n, rng, { noBaron = false } = {}) {
  if (n > 12) return rollRoles(n, rng, { noBaron });
  const F4_KEEP = [0.15, 1, 1, 0.2, 0.05];
  for (let k = 0; k < 300; k++) {
    const roles = rollRoles(n, rng, { noBaron });
    let keep = 1;
    if (roles.includes('empath') && roles.includes('fortuneteller')) keep *= 0.35;
    keep *= F4_KEEP[roles.filter((r) => SMALL_INFO.includes(r)).length] ?? 0.05;
    if (roles.includes('baron') && !roles.includes('librarian')) keep *= 0.3;
    if (rng() < keep) return roles;
  }
  return rollRoles(n, rng, { noBaron });
}

// ───────────── AI 配板：强神打强神，弱神打弱神 ─────────────
// 经验分（官方没有公式）：善良的分减邪恶的分，正数偏善良。只用来比较同人数的几套配板。
const TB_GOOD_W = {
  washerwoman: 0.8, librarian: 0.8, investigator: 0.9, chef: 0.9, empath: 1.4, fortuneteller: 1.6, undertaker: 1.0,
  monk: 1.2, ravenkeeper: 0.9, virgin: 1.0, slayer: 1.0, soldier: 0.8, mayor: 1.2,
  butler: -0.3, drunk: -0.6, recluse: -0.5, saint: -0.7,
};
const TB_EVIL_W = { imp: 3.0, poisoner: 1.6, spy: 1.4, scarletwoman: 1.2, baron: 0.6 };
export function setupScoreTB(roles) {
  let good = 0; let evil = 0;
  for (const r of roles) { good += TB_GOOD_W[r] ?? 0; evil += TB_EVIL_W[r] ?? 0; }
  // 投毒者最怕没东西毒，最喜欢信息位多：信息越多它越值钱
  if (roles.includes('poisoner')) evil += 0.15 * roles.filter((r) => ['empath', 'fortuneteller', 'undertaker', 'chef', 'investigator'].includes(r)).length;
  return Math.round((good - evil) * 100) / 100;
}

/**
 * 暗流涌动的 AI 配板：照 rollTB 的信息位规则随机出 tries 套，按平衡分排好，去掉两头最偏的，从中间那段里随机挑一套。
 * 效果是"强神打强神，弱神打弱神"：善良这边信息位很强时，邪恶这边多半也是投毒者、间谍这种强爪牙，反过来也一样。
 */
export function balancedTB(n, rng, { noBaron = false, tries = 40 } = {}) {
  const cands = Array.from({ length: tries }, () => rollTB(n, rng, { noBaron })).map((roles) => ({ roles, s: setupScoreTB(roles) })).sort((a, b) => a.s - b.s);
  const lo = Math.floor(tries * 0.3); const hi = Math.max(lo + 1, Math.ceil(tries * 0.7));
  return cands[lo + Math.floor(rng() * (hi - lo))].roles;
}

/** 房规"夜里死了仍拿信息"：这些角色当晚被杀后照样得到当晚的信息，但按醉酒处理（真假由说书人定）。 */
export const DEAD_INFO_TB = new Set(['empath', 'fortuneteller', 'undertaker']);

/** 诸神黄昏：几只狼人（小恶魔），其余全是猎手。 */
export function rollRagnarok(n, rng) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`人数需在 ${MIN_PLAYERS}–${MAX_PLAYERS} 之间`);
  const w = ragnarokWolves(n);
  return shuffle([...Array(w).fill('imp'), ...Array(n - w).fill('slayer')], rng);
}

/** 按人数随机出一套角色（已处理男爵 +2 外来者）。noBaron：这局不发男爵（房规：小局不要男爵）。 */
export function rollRoles(n, rng, { noBaron = false } = {}) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`人数需在 ${MIN_PLAYERS}–${MAX_PLAYERS} 之间`);
  let [t, o, m] = DISTRIBUTION[n];
  const minions = sample(noBaron ? MINIONS.filter((r) => r !== 'baron') : MINIONS, m, rng);
  if (minions.includes('baron')) { t -= 2; o += 2; }
  return shuffle([...sample(TOWNSFOLK, t, rng), ...sample(OUTSIDERS, o, rng), ...minions, 'imp'], rng);
}

export const ALL_EVIL = '存活的玩家全是邪恶，善良已经无法获胜';

export class Game {
  /**
   * @param {{id:string,name:string}[]} players 已按座位顺序排列（顺时针）
   * @param {{rng?:()=>number, roles?:string[], misregister?:number}} opts
   *   misregister：陌客/间谍"错误登记"的固定概率（测试用）；不给就由说书人按局势判定
   */
  constructor(players, { rng = Math.random, roles, misregister = null, evilInfo = null, script = 'tb', drunkAs = null, noBaron = false, deadDrunk = false, lunaticGhost = false, newbies = [], mezEasy = true, demonSwap = null } = {}) {
    this.rng = rng;
    this.newbies = newbies; // 红鲱鱼在下面就要定，要先有
    this.script = SCRIPTS[script] ? script : 'tb';
    // 官方规则：7 人及以上第一夜恶魔和爪牙互认、恶魔拿 3 个伪装；6 人及以下都不给（房规可打开）
    this.evilInfo = SCRIPTS[this.script]?.ragnarok ? true : evilInfo ?? players.length >= 7; // 诸神黄昏：狼人总是互相认识
    this.evilKnown = null;     // 第一夜互认的结果：id → [{id, team}]
    this.bluffsShared = false; // 恶魔有没有把伪装告诉爪牙
    this.id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); // 这一局的编号（客户端按它分开存标记）
    this.misregister = misregister;
    this.deadDrunk = !!deadDrunk; // 房规：夜里被杀的信息角色照样拿当晚的信息，但按醉酒处理（官方：死了就没有能力）
    this.mezEasy = mezEasy !== false; // 灵言师关键词：简单（日常词）/ 普通（不常见的词），房间设置，默认简单
    this.demonSwap = SCRIPTS[this.script]?.demonSwap?.includes(demonSwap) ? demonSwap : null; // 夜半狂欢：亡骨魔换成了小怪宝 / 利维坦（房间设置）
    this.lunaticGhost = !!lunaticGhost; // 房规（黯月初升）：以为自己是僵怖的疯子死后，在他看来是"假死"，没人死的夜里照样叫醒他（官方：死了就失去能力，不再醒）
    this.suspicion = {}; // 每个人被提名、得票的累计，说书人判断局势用
    this.timeline = [];  // 终局复盘：每晚谁选了谁、谁得到什么信息（真/假）、死亡、提名投票、说书人的判定
    this.st = new Storyteller(this, rng);
    this.nightDeaths = [];
    if (this.script === 'bmr') this.setupBMR(players, roles, rng);
    else if (this.engine === 'snv') this.setupSNV(players, roles, rng);
    else {
      const assigned = roles ?? (SCRIPTS[this.script].ragnarok ? rollRagnarok(players.length, rng) : balancedTB(players.length, rng, { noBaron }));
      if (assigned.length !== players.length) throw new Error('角色数量与玩家数量不符');

      this.players = players.map((p, i) => ({
        id: p.id, name: p.name, seat: i + 1, role: assigned[i], shownRole: assigned[i],
        alive: true, ghostVote: true,
      }));

      const inPlay = new Set(assigned);
      const drunk = this.players.find((p) => p.role === 'drunk');
      if (drunk) drunk.shownRole = drunkAs && !inPlay.has(drunkAs) ? drunkAs : pick(TOWNSFOLK.filter((r) => !inPlay.has(r)), rng);

      // 恶魔的三个伪装：不在场的善良角色（不含酒鬼以为的那个）
      const taken = new Set([...inPlay, drunk?.shownRole]);
      const goodOut = (list) => shuffle(list.filter((r) => !taken.has(r) && r !== 'drunk'), rng);
      const tf = goodOut(TOWNSFOLK); const os = goodOut(OUTSIDERS);
      this.bluffs = os.length && tf.length >= 2 ? shuffle([...tf.slice(0, 2), os[0]], rng) : [...tf, ...os].slice(0, 3); // 官方建议：两个镇民加一个外来者

      this.redHerring = this.st.redHerring();
      this.firstDemon = this.players.find((p) => p.role === 'imp')?.id ?? null;
    }
    this.record('setup', this.players.map((p) => `${p.seat}号 ${p.name}：${this.roleText(p)}`).join('；'));
    if (this.bluffs.length) this.record('setup', `恶魔拿到的伪装：${this.bluffs.map((r) => ROLES[r].name).join('、')}`); // 裁缝与暴乱没有伪装

    this.phase = 'setup'; // setup | night | day | ended
    this.night = 0;
    this.day = 0;
    this.winner = null;
    this.winReason = '';
    this.poisonTarget = null;
    this.monkTarget = null;
    this.butlerMaster = null;
    this.virginUsed = false;
    this.slayerUsed = false;
    this.lastExecuted = null; // 上一个白天被处决的玩家 id（送葬者用）
    this.choices = {};
    this.nightDeaths = [];
    this.log = [];
    this.resetDay();
  }

  /** 用哪套规则：'tb' | 'bmr' | 'snv'（两个小剧本用梦殒春宵那套）。 */
  get engine() { return engineOf(this.script); }

  /** 记一条结构化的信息（世界枚举用，见 worlds.js）。不进存档，只分析用，不影响判定；目前只有暗流涌动记。 */
  fact(f) { (this.facts ??= []).push({ night: this.night, ...f }); }

  /** 记一条复盘。kind：setup 开局 / choice 夜里选择 / info 私密信息 / death 死亡 / nominate 提名 / vote 投票 / slay 开枪 / st 说书人判定 / end 终局 */
  record(kind, text, extra = {}) {
    this.timeline.push({ when: this.st.when(), kind, text, ...extra });
  }
  /** 带角色的名字（复盘用）：3号 小明（共情者）；酒鬼写成 酒鬼·以为是xx。 */
  tag(id) {
    if (id === 'storyteller') return '说书人';
    const p = this.get(id);
    if (!p) return '?';
    const r = p.role === 'drunk' ? `酒鬼·以为是${ROLES[p.shownRole].name}` : p.role === 'lunatic' ? `疯子·以为是${ROLES[p.shownRole].name}` : p.role === 'amnesiac' && p.gained ? `失忆者·能力是${ROLES[p.gained].name}` : ROLES[p.role].name;
    return `${this.name(id)}（${r}）`;
  }
  roleText(p) {
    if (p.role === 'drunk') return `酒鬼（以为自己是${ROLES[p.shownRole].name}）`;
    if (p.role === 'lunatic') return `疯子（以为自己是${ROLES[p.shownRole].name}）`;
    if (p.role === 'amnesiac' && p.gained) return `失忆者（能力其实是${ROLES[p.gained].name}）`;
    return ROLES[p.role].name;
  }

  // ───────────────────────── 存档 ─────────────────────────
  /** 整局状态转成普通 JSON（服务器重启后用 Game.fromJSON 接着玩）。 */
  toJSON() {
    const keys = ['misregister', 'suspicion', 'timeline', 'players', 'bluffs', 'redHerring', 'phase', 'night', 'day', 'winner', 'winReason',
      'poisonTarget', 'monkTarget', 'butlerMaster', 'virginUsed', 'slayerUsed', 'lastExecuted', 'choices', 'nightDeaths', 'log',
      'block', 'blockVotes', 'blockTied', 'executedToday', 'shooters', 'firstDemon', 'evilInfo', 'evilKnown', 'bluffsShared', 'id',
      'script', 'fx', 'used', 'lastPick', 'pukkaVictim', 'poCharged', 'shabaLast', 'grandchild', 'gossipPending', 'gossipSaid',
      'moonchildPick', 'pendingMoonchild', 'diedToday', 'outsiderDiedToday', 'mastermindDay', 'demonExecuted', 'nightRevived', 'newbies', 'deadDrunk', 'lunaticGhost', 'evilMessages', 'midNight', 'lunaticFake', 'goonHit', 'pendingGoonNews', 'blocked', 'lunaticPicks',
      'firstDone', 'twin', 'fangUsed', 'vigKept', 'abnormal', 'demonVoted', 'minionNominated', 'dayVoters', 'jugglerDay', 'juggled', 'juggleLog', 'madness', 'savantDay', 'declared', 'claims', 'records', 'sageHit', 'barberDue', 'pendingKlutz', 'klutzQueue', 'klutzNow', 'madNight', 'curseFail', 'pitNight',
      'balloon', 'leviGood', 'goblinMark', 'amnesiacDay', 'amnesiacKnown', 'woke', 'pardonDay',
      'harpyMad', 'farmerDue', 'rkDue', 'damselTried', 'damselGuessed', 'boom', 'boffin', 'seat7', 'lunaticTold', 'lunaticTellTo', 'heard',
      'pixie', 'mez', 'execHist', 'nomBy', 'blockVoters', 'politicianDone', 'fibbinUsed', 'riotChain',
      'atheist', 'evilStart', 'poppyHid', 'poppyDue', 'poppyRevealed', 'ahNight', 'ahNews', 'psychoDay', 'psychoSpared', 'aiLead', 'politicianEval', 'scapegoatDay', 'gunDay', 'judgeUsed',
      'leviDue', 'goblinClaimDay', 'widowTold', 'baristaFx', 'harlotAsk', 'matronDay', 'butcherDay', 'mezEasy', 'nomHistory', 'demonSwap', 'monsta', 'lleechHost', 'lleechDue', 'fear', 'fearNews', 'evilHist',
      'rochDone', 'bhEvilTf', 'fauxPaw', 'bh', 'acro', 'lycanNight', 'hatterDue', 'hatterNight', 'allKnown',
      'yagg', 'yaggFake', 'doomUsed', 'duchess', 'alsaahirDay', 'puzzle', 'knaves', 'kingKilled', 'cultDay', 'gangDay', 'chairs', 'chairLeft', 'ogDrunk']; // 2026-11-22 小剧本：牙噶巴卜的暗号、末日预言者、公爵夫人、戏法师（漏存的话重启后全丢）
    const out = Object.fromEntries(keys.map((k) => [k, this[k]]));
    out.nominators = [...this.nominators];
    out.nominees = [...this.nominees];
    out.acted = [...(this.acted ?? [])]; // 侍女：今晚为能力醒来的人（Set）
    out.st = this.st.toJSON();
    return out;
  }

  static fromJSON(data, { rng = Math.random } = {}) {
    const g = Object.create(Game.prototype);
    g.rng = rng;
    g.st = new Storyteller(g, rng);
    const { nominators, nominees, journal, st, acted, ...rest } = data;
    Object.assign(g, structuredClone(rest));
    g.timeline ??= [];
    g.nominators = new Set(nominators);
    g.nominees = new Set(nominees);
    g.acted = new Set(acted ?? []);
    g.st.load(st ?? { journal });
    // 旧存档补字段
    g.evilInfo ??= g.players.length >= 7;
    if (g.firstDemon === undefined) g.firstDemon = g.players.find((p) => p.role === 'imp')?.id ?? null;
    if (g.evilKnown === undefined) g.evilKnown = g.evilInfo && (g.night > 1 || g.phase === 'day' || g.phase === 'ended') ? g.knownMap() : null;
    g.bluffsShared ??= false;
    g.id ??= `old-${g.players.map((p) => p.seat + p.id.slice(-3)).join('')}`;
    g.script ??= 'tb';
    if (g.engine === 'snv') { g.claims ??= {}; g.balloon ??= {}; g.leviGood ??= []; g.amnesiacDay ??= {}; g.amnesiacKnown ??= {}; g.woke ??= []; g.farmerDue ??= []; g.damselTried ??= {}; g.doomUsed ??= []; g.alsaahirDay ??= {}; g.yaggFake ??= {}; }
    if (g.script === 'bmr') { g.wokeTonight = new Set(); g.goonHit = false; g.blocked = null; g.nightRevived ??= []; }
    return g;
  }

  /** 恶魔和爪牙互相知道谁是谁（按现在的角色）：id → [{id, team:'恶魔'|'爪牙'}] */
  knownMap() {
    const evil = this.players.filter((p) => ['minion', 'demon'].includes(ROLES[p.role].team));
    // 提线木偶不知道自己是邪恶的，别的爪牙也不知道他；只有恶魔知道
    const sees = (p, x) => x.id !== p.id && (x.role !== 'marionette' || ROLES[p.role].team === 'demon');
    return Object.fromEntries(evil.filter((p) => p.role !== 'marionette').map((p) => [p.id, evil.filter((x) => sees(p, x)).map((x) => ({ id: x.id, team: ROLES[x.role].team === 'demon' ? '恶魔' : '爪牙' }))]));
  }

  /** 开局的恶魔把 3 个伪装告诉爪牙（现实里是私聊，这里一键分享）。 */
  shareBluffs(uid) {
    // 疯子以为自己是恶魔：点了也照样显示"已告诉"，不能报错露馅（其实谁都没收到）
    if (this.lunaticFake?.id === uid) { this.lunaticFake.shared = true; this.record('st', `疯子 ${this.tag(uid)} 以为自己把伪装告诉了"爪牙"（没有效果）`); return; }
    if (uid !== this.firstDemon || !this.evilKnown?.[uid]) throw new Error('只有第一夜拿到伪装的恶魔能分享');
    if (this.bluffsShared) return;
    this.bluffsShared = true;
    this.record('st', `${this.tag(uid)} 把 3 个伪装告诉了爪牙`);
  }

  // ───────────────────────── 查询 ─────────────────────────
  get(id) { return this.players.find((p) => p.id === id); }
  /**
   * 暗流涌动、黯月初升的公开声明：只记下来，说书人编假信息、间谍误登记时配合他的伪装（官方《给说书人的建议》第 7 条）。
   * 梦殒春宵引擎有自己的 declare（还管疯狂）。
   */
  claimRole(uid, role, max = 2) {
    if (this.phase !== 'day') throw new Error('只能在白天声明');
    if (!this.get(uid)) throw new Error('你不是这局的玩家');
    if (!ROLES[role] || !inScript(role, this.script)) throw new Error('选一个这个剧本里的角色');
    this.declared ??= {}; this.claims ??= {};
    const d = this.declared[uid]?.day === this.day ? this.declared[uid] : { day: this.day, n: 0 };
    if (d.n >= max) throw new Error(`每天最多声明 ${max} 次`);
    d.n += 1; this.declared[uid] = d;
    this.claims[uid] = role;
    return { text: `我是${ROLES[role].name}`, mutant: false };
  }

  alive() { return this.players.filter((p) => p.alive); }
  aliveCount() { return this.alive().length; }
  byRole(role) { return this.players.find((p) => p.role === role); }
  demon() { return this.players.find((p) => p.alive && (ROLES[p.role].team === 'demon' || this.monsta?.holder === p.id)); } // 小怪宝：照看的人「是恶魔」
  /** 这局剧本的角色（夜半狂欢的恶魔开关：亡骨魔换成了谁）。 */
  scriptRoles(team) { return rolesOf(this.script, team, this.demonSwap); }
  name(id) { if (id === 'storyteller') return '说书人'; const p = this.get(id); return p ? `${p.seat}号 ${p.name}` : '?'; }

  visAlive(p) { return p.alive && !p.apparentDead; }
  evilOf(p) { return p.evil ?? isEvilRole(p.role); }
  /** 城镇广场上看起来活着的人数（被当作死亡的僵怖不算）。 */
  visAliveCount() { return this.players.filter((p) => this.visAlive(p)).length; }

  isPoisoned(p) {
    if (this.script === 'bmr') return this.fx.some((f) => f.kind === 'poison' && f.target === p.id && this.fxLive(f));
    if (this.engine === 'snv') return this.snvPoisoned(p);
    const poisoner = this.byRole('poisoner');
    return this.poisonTarget === p.id && poisoner?.alive;
  }
  /** 能力失效：酒鬼或中毒。 */
  broken(p) {
    if (this.script === 'bmr') return this.bmrBroken(p);
    if (this.engine === 'snv') return this.snvBroken(p);
    return p.role === 'drunk' || this.isPoisoned(p);
  }

  /** 坐在 p 两侧最近的存活玩家。 */
  aliveNeighbours(p) {
    const n = this.players.length;
    const res = [];
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = this.players[(p.seat - 1 + dir * k + n * k) % n];
        if (q.id === p.id) break;
        if (this.visAlive(q)) { res.push(q); break; } // 被当作死亡的僵怖不算存活邻座
      }
    }
    return res[0] && res[1] && res[0].id === res[1].id ? [res[0]] : res;
  }

  // 陌客/间谍的"登记"。健康的陌客可能被当作邪恶，健康的间谍可能被当作善良。by：谁在检测（写进说书人手记）。
  // help：这次误登记帮哪边（见 storyteller.misregister），默认帮邪恶。
  misreg(p, by = '检测', help = 'evil') {
    if ((p.role !== 'recluse' && p.role !== 'spy') || this.isPoisoned(p)) return false;
    if (this.misregister != null) return this.rng() < this.misregister;
    return this.st.misregister(p, by, help);
  }
  regEvil(p, by, help) { const evil = this.evilOf(p); return this.misreg(p, by, help) ? !evil : evil; }
  regDemon(p, by) { return p.role === 'imp' || (p.role === 'recluse' && this.misreg(p, by)); }
  regTownsfolk(p, by, help) { return ROLES[p.role].team === 'townsfolk' || (p.role === 'spy' && this.misreg(p, by, help)); }
  /** 被送葬者/守鸦人看到的角色。 */
  regRole(p, by) {
    if (this.misreg(p, by)) return this.st.misregRole(p);
    return p.role;
  }
  /** 能力失效的人拿假信息：按说书人给他编的那套假世界回答（前后一致，见 storyteller.js）。 */
  lies(p) {
    if (!this.broken(p)) return false;
    // 邪恶碾压时，真酒鬼偶尔拿真信息（官方《给说书人的建议》）；中毒的照给假的
    if (p.role === 'drunk' && !this.isPoisoned(p) && this.st.drunkTruth(p)) return false;
    return true;
  }

  // ───────────────────────── 夜晚 ─────────────────────────
  startNight() {
    this.phase = 'night';
    this.night += 1;
    if (this.script === 'tb') this.fact({ kind: 'night', alive: this.alive().map((p) => p.id) });
    this.choices = {};
    this.nightDeaths = [];
    this.demonKills = [];
    this.poisonTarget = null; // 上一晚的毒到黄昏结束
    this.monkTarget = null;
    this.butlerMaster = null;
    if (this.script === 'bmr') {
      this.startNightBMR();
      this.apprenticeSetup?.(); // 学徒的首个夜晚：说书人给他一个镇民 / 爪牙能力
      if (this.night === 1) this.evilMessages = this.evilInfoBMR();
      return this.nightPrompts();
    }
    if (this.engine === 'snv') {
      this.startNightSNV();
      this.apprenticeSetup?.(); // 学徒（瓦釜雷鸣）
      if (this.night === 1) this.rochSetup?.(); // 赏金猎人转邪恶的镇民、半兽人的失足（心理博弈）
      if (this.night === 1) this.evilMessages = [...this.evilInfoSNV(), ...(this.rochEvilNews?.() ?? [])];
      return this.nightPrompts();
    }
    // 第一夜一开始就告诉恶魔和爪牙彼此是谁（投毒者选人之前就知道恶魔）；房间马上发出去
    if (this.night === 1 && this.evilInfo) this.evilMessages = this.evilInfoMessages();
    return this.nightPrompts();
  }

  /** 官方的「爪牙信息」「恶魔信息」：爪牙得知恶魔和其他爪牙；恶魔得知爪牙和 3 个伪装。 */
  evilInfoMessages() {
    const messages = [];
    const say = (p, text) => messages.push({ playerId: p.id, text });
    if (SCRIPTS[this.script].ragnarok) { // 诸神黄昏：狼人互相认识，没有爪牙也没有伪装
      const wolves = this.players.filter((p) => p.role === 'imp');
      this.evilKnown = this.knownMap();
      for (const w of wolves) {
        const mates = wolves.filter((x) => x.id !== w.id).map((x) => `**${this.name(x.id)}**`);
        say(w, mates.length ? `你的狼人同伴：${mates.join('、')}。每晚你们各自选一个人杀死。` : '你是唯一的狼人。每晚选一个人杀死。');
      }
      return messages;
    }
    const demon = this.demon();
    const minions = this.players.filter((p) => ROLES[p.role].team === 'minion');
    this.evilKnown = this.knownMap();
      for (const m of minions) {
        const mates = minions.filter((x) => x.id !== m.id).map((x) => this.name(x.id));
        say(m, `恶魔是 **${this.name(demon.id)}**。${mates.length ? `其他爪牙：${mates.join('、')}。` : ''}`);
      }
      say(demon, `你的爪牙：${minions.map((x) => `**${this.name(x.id)}**`).join('、')}。\n` +
        `不在场的角色（可用来伪装）：${this.bluffs.map((r) => ROLES[r].name).join('、')}。`);
    return messages;
  }

  /** 今晚需要选人的玩家。酒鬼按他以为的角色醒来。 */
  nightPrompts() {
    if (this.script === 'bmr') return this.nightPromptsBMR();
    if (this.engine === 'snv') return this.nightPromptsSNV();
    const first = this.night === 1;
    return this.nightOrder()
      .filter((p) => ROLES[p.shownRole].choose)
      .filter((p) => !(first && p.shownRole === 'monk') && !(first && p.shownRole === 'imp'))
      .map((p) => {
        const c = ROLES[p.shownRole].choose;
        // 官方规则：能力没写"存活的"就可以选死人。小恶魔选一个已死的玩家 = 空刀（今晚没人死）
        const options = this.players.filter((q) => !c.notSelf || q.id !== p.id);
        return { playerId: p.id, role: p.shownRole, count: c.count, options: options.map((q) => q.id) };
      });
  }

  nightOrder() {
    const key = this.night === 1 ? 'firstNight' : 'otherNight';
    return this.alive().filter((p) => ROLES[p.shownRole][key] > 0 && !(p.traveller && p.joinedNight === this.night))
      .sort((a, b) => ROLES[a.shownRole][key] - ROLES[b.shownRole][key]);
  }

  submitChoice(playerId, targets, extra = {}) {
    if (this.script === 'bmr') return this.submitChoiceBMR(playerId, targets, extra);
    if (this.engine === 'snv') return this.submitChoiceSNV(playerId, targets, extra);
    const prompt = this.nightPrompts().find((x) => x.playerId === playerId);
    if (!prompt) throw new Error('你今晚不需要选择');
    // 暗流涌动夜里要选人的能力都是"你要选择"（官方），不能空过；小恶魔想空刀就选一名已经死了的玩家
    if (targets.length === 0 && prompt.options.length >= prompt.count) throw new Error(`需要选择 ${prompt.count} 名玩家`);
    if (targets.length === 0) { this.choices[playerId] = []; return; } // 可选的人不够（比如活人太少）：只能不选
    if (targets.length !== prompt.count || new Set(targets).size !== targets.length) throw new Error(`需要选择 ${prompt.count} 名不同的玩家`);
    if (!targets.every((t) => prompt.options.includes(t))) throw new Error('选择了不可选的玩家');
    this.choices[playerId] = targets;
  }

  /** 随机替没选的人选（超时或机器人玩家）。 */
  autoChoose(playerId) {
    if (this.script === 'bmr') return this.autoChooseBMR(playerId);
    if (this.engine === 'snv') return this.autoChooseSNV(playerId);
    const prompt = this.nightPrompts().find((x) => x.playerId === playerId);
    if (!prompt) return;
    let opts = prompt.options;
    // 自动替小恶魔/投毒者选时别选自己人、也别选死人（超时替他选不该变成空刀），免得太蠢
    if (['imp', 'poisoner'].includes(prompt.role)) {
      const notEvil = opts.filter((id) => !isEvilRole(this.get(id).role) && this.get(id).alive);
      if (notEvil.length) opts = notEvil;
    }
    this.choices[playerId] = sample(opts, prompt.count, this.rng);
  }

  missingChoices() {
    return this.nightPrompts().filter((p) => !this.choices[p.playerId]).map((p) => p.playerId);
  }

  /**
   * 按夜晚顺序结算。返回：
   *   messages: [{playerId, text}] 要私下告诉每个人的信息
   *   ravenkeeper: 今晚死掉、需要再选一个人的守鸦人 id（或 null）
   */
  resolveNight() {
    if (this.script === 'bmr') return this.resolveNightBMR();
    if (this.engine === 'snv') return this.resolveNightSNV();
    const messages = [];
    const say = (p, text) => messages.push({ playerId: p.id, text });
    const first = this.night === 1;
    const n = this.players.length;

    let ravenkeeper = null;
    for (const p of this.nightOrder()) {
      // 房规"夜里死了仍拿信息"：今晚被杀的信息角色照样醒来拿信息，但按醉酒处理（真假由说书人定），信息末尾会注明
      const deadInfo = this.deadDrunk && !p.alive && this.nightDeaths.includes(p.id) && DEAD_INFO_TB.has(p.shownRole);
      if (!p.alive && p.shownRole !== 'ravenkeeper' && !deadInfo) continue;
      const role = p.shownRole;
      const choice = this.choices[p.id];
      const broken = this.broken(p) || deadInfo;
      const lies = () => (deadInfo && !this.broken(p) ? this.st.deadLies(p) : this.lies(p));
      const said = messages.length;
      switch (role) {
        case 'poisoner':
          if (choice) this.poisonTarget = choice[0];
          break;
        case 'monk':
          if (choice && !broken) this.monkTarget = choice[0];
          break;
        case 'imp':
          if (choice && !broken) this.impKill(p, this.get(choice[0]), messages);
          break;
        case 'washerwoman': say(p, this.infoPair(p, 'townsfolk', lies())); break;
        case 'librarian': say(p, this.infoPair(p, 'outsider', lies())); break;
        case 'investigator': say(p, this.infoPair(p, 'minion', lies())); break;
        case 'chef': say(p, `场上有 **${this.chefInfo(p, lies())}** 对相邻的邪恶玩家。`); break;
        case 'empath': say(p, `你两侧的存活邻座中有 **${this.empathInfo(p, lies())}** 名邪恶玩家。`); break;
        case 'fortuneteller': {
          if (!choice) break;
          if (!choice.length) { say(p, '你今晚没有选人，没有得到信息。'); break; }
          const [a, b] = choice.map((id) => this.get(id));
          let yes = [a, b].some((q) => this.regDemon(q, '占卜师查验') || q.id === this.redHerring);
          if (broken && lies()) yes = this.st.fakeFortune(p, a, b, yes);
          this.fact({ kind: 'ft', by: p.id, a: a.id, b: b.id, yes });
          say(p, `${this.name(a.id)} 与 ${this.name(b.id)} 之中${yes ? '**有**' : '**没有**'}恶魔。`);
          break;
        }
        case 'undertaker': {
          if (this.lastExecuted == null) break;
          const ex = this.get(this.lastExecuted);
          const r = broken && lies() ? this.st.falseRole(p, ex) : this.regRole(ex, '送葬者查看');
          this.fact({ kind: 'role', by: p.id, target: ex.id, role: r });
          say(p, `今天被处决的 ${this.name(ex.id)} 是 **${ROLES[r].name}**。`);
          break;
        }
        case 'butler':
          if (choice && !choice.length) { // 没选主人：没有人能"带"你投票，明天不能投
            if (p.role === 'butler') this.butlerMaster = 'none';
            say(p, '你今晚没有选主人：明天你不能投票。');
          } else if (choice) {
            if (p.role === 'butler') this.butlerMaster = choice[0];
            say(p, `你的主人是 ${this.name(choice[0])}。明天只有他举手时你才能投票。`);
          }
          break;
        case 'spy':
          // 官方：间谍看到的魔典和说书人的一样，包括提示标记和恶魔拿到的伪装
          say(p, `魔典（和说书人看到的一样）：\n${this.grimoire()}${this.bluffs?.length ? `\n恶魔拿到的伪装（不在场的角色）：${this.bluffs.map((r) => ROLES[r].name).join('、')}` : ''}`);
          break;
        default: break;
      }
      if (deadInfo) for (let i = said; i < messages.length; i++) if (messages[i].playerId === p.id) messages[i].text += '\n（你今晚死了。按房规你仍得到了这条信息，但它按醉酒处理：**可能是假的**。）';
    }
    // 守鸦人在恶魔之后醒；今晚被杀才会被唤醒
    const rk = this.players.find((p) => p.shownRole === 'ravenkeeper' && this.nightDeaths.includes(p.id));
    if (rk) ravenkeeper = rk.id;
    this.lastExecuted = null;
    this.checkWinner();
    return { messages, ravenkeeper };
  }

  resolveRavenkeeper(targetId) {
    if (this.engine === 'snv') {
      const rk = this.get(this.rkDue); const t = this.get(targetId);
      if (!rk || !t) throw new Error('无效的守鸦人选择');
      this.rkDue = null;
      const lie = this.lieMode(rk);
      const r = lie ? this.st.falseRoleSNV(rk, t, this.st.snvWorld(rk, lie)) : this.seenRole(t, '守鸦人查看');
      return { playerId: rk.id, text: `${this.name(t.id)} 的角色是 **${ROLES[r].name}**。` };
    }
    const rk = this.players.find((p) => p.shownRole === 'ravenkeeper' && this.nightDeaths.includes(p.id));
    const t = this.get(targetId);
    if (!rk || !t) throw new Error('无效的守鸦人选择');
    const r = this.lies(rk) ? this.st.falseRole(rk, t) : this.regRole(t, '守鸦人查看');
    this.fact({ kind: 'role', by: rk.id, target: t.id, role: r });
    return { playerId: rk.id, text: `${this.name(t.id)} 的角色是 **${ROLES[r].name}**。` };
  }

  impKill(imp, target, messages) {
    if (!target || !target.alive) return;
    if (this.monkTarget === target.id) return; // 被僧侣保护：包括小恶魔自刀——无事发生，不传位（官方）
    if (target.id === imp.id) { this.kill(imp, 'starpass', messages); return; }
    if (target.role === 'soldier' && !this.broken(target)) return;
    if (target.role === 'mayor' && !this.broken(target)) {
      const others = this.alive().filter((q) => q.id !== target.id && q.id !== imp.id &&
        q.id !== this.monkTarget && !(q.role === 'soldier' && !this.broken(q)));
      const victim = this.st.mayorBounce(target, others);
      if (victim) { this.kill(victim, 'demon', messages); return; }
    }
    this.kill(target, 'demon', messages);
  }

  /** 死亡，含红唇女郎接任与小恶魔传位。 */
  kill(p, cause, messages = []) {
    if (!p.alive) return;
    if (this.script === 'bmr') { this.bmrDie(p, cause, messages); return; }
    if (this.engine === 'snv') { this.snvDie(p, cause, messages); return; }
    const aliveBefore = this.townAlive?.() ?? this.aliveCount(); // 红唇女郎的「五名玩家存活」不算旅行者（官方）
    p.alive = false;
    if (this.phase === 'night') this.nightDeaths.push(p.id);
    if (this.phase === 'night' && cause === 'demon') (this.demonKills ??= []).push(p.id); // 夜里被恶魔破门杀死的（前端播破门动画）
    this.log.push(`${this.name(p.id)} 死亡（${cause}）`);
    const why = { demon: '被恶魔杀死', starpass: '恶魔自杀（传位）', execution: '被处决', slayer: '被猎手射杀', storyteller: '说书人判定死亡' }[cause] ?? cause;
    this.record('death', `${this.tag(p.id)} ${why}`);
    if (cause === 'execution') this.fact({ kind: 'executed', target: p.id });
    if (ROLES[p.role].team !== 'demon') return;

    const minions = this.alive().filter((q) => ROLES[q.role].team === 'minion');
    const sw = minions.find((q) => q.role === 'scarletwoman' && !this.isPoisoned(q));
    let heir = null;
    if (sw && aliveBefore >= 5) heir = sw;
    else if (cause === 'starpass' && minions.length) heir = this.st.starpassHeir(minions);
    if (heir) {
      heir.role = 'imp';
      heir.shownRole = 'imp';
      this.log.push(`${this.name(heir.id)} 成为了小恶魔`);
      this.record('death', `${this.name(heir.id)} 接任，成为新的小恶魔`);
      messages.push({ playerId: heir.id, text: '恶魔死去了——**你现在是小恶魔**。从下一个夜晚开始，每晚选择一名玩家杀死。' });
    }
  }

  /** 白天发生的死亡带出来的私信（比如红唇女郎接任恶魔）：官方是当晚唤醒告诉她，这里入夜时送到。 */
  dayMessages() { return (this.evilMessages ??= []); }

  /** 洗衣妇/图书管理员/调查员：两人之一是某角色。lies：能力失效且说书人决定给假信息。 */
  infoPair(p, team, lies) {
    const others = this.players.filter((q) => q.id !== p.id);
    const pool = { townsfolk: TOWNSFOLK, outsider: OUTSIDERS, minion: MINIONS }[team];
    const by = ROLES[p.shownRole].name;
    let target; let role;
    if (lies) {
      const fake = this.st.falsePair(p, team);
      if (!fake) { this.fact({ kind: 'none', by: p.id, team }); return { outsider: '场上**没有**外来者。', minion: '场上**没有**爪牙。' }[team] ?? '没有可以告诉你的信息。'; }
      ({ target, role } = fake);
    } else {
      const cands = others.filter((q) => {
        if (team === 'townsfolk') return this.regTownsfolk(q, by);
        if (team === 'outsider') return ROLES[q.role].team === 'outsider' || (q.role === 'spy' && this.misreg(q, by));
        // 间谍可能登记成善良（调查员看不到他），陌客可能登记成爪牙
        if (q.role === 'spy') return !this.misreg(q, by);
        return ROLES[q.role].team === 'minion' || (q.role === 'recluse' && this.misreg(q, by));
      });
      if (!cands.length && team === 'townsfolk' && p.role === p.shownRole && TOWNSFOLK.includes(p.role)) cands.push(p);
      if (!cands.length) { this.fact({ kind: 'none', by: p.id, team }); return { outsider: '场上**没有**外来者。', minion: '场上**没有**爪牙。' }[team] ?? '没有可以告诉你的信息。'; }
      target = this.st.choose('pairTarget', cands, { who: p.id, team });
      role = ROLES[target.role].team === team ? target.role : this.st.misregRole(target, pool); // 间谍/陌客：前后一致、配合伪装
    }
    const decoy = this.st.choose('pairDecoy', others.filter((q) => q.id !== target.id), { who: p.id, team });
    this.fact({ kind: 'pair', by: p.id, team, a: target.id, b: decoy.id, role });
    const pair = shuffle([target, decoy], this.rng).map((q) => `**${this.name(q.id)}**`);
    return `${pair[0]} 与 ${pair[1]} 之中，有一人是 **${ROLES[role].name}**。`;
  }

  chefInfo(p, lies) {
    const n = this.players.length;
    // 拿假信息时只需要真相作对照，不用掷陌客/间谍的错误登记
    const evil = this.players.map((q) => (lies ? isEvilRole(q.role) : this.regEvil(q, '厨师检测', q.role === 'recluse' ? 'good' : 'evil'))); // 陌客被算成邪恶会多出一对、指向他身边的真邪恶
    let pairs = 0;
    for (let i = 0; i < n; i++) if (evil[i] && evil[(i + 1) % n]) pairs++;
    const value = lies ? this.st.fakeChef(p, pairs) : pairs;
    this.fact({ kind: 'chef', by: p.id, value, truth: pairs });
    return value;
  }

  empathInfo(p, lies) {
    const around = this.aliveNeighbours(p);
    const truth = around.filter((q) => (lies ? isEvilRole(q.role) : this.regEvil(q, '共情者检测'))).length;
    const value = lies ? this.st.fakeEmpath(p, truth) : truth;
    this.fact({ kind: 'empath', by: p.id, around: around.map((q) => q.id), value, truth });
    return value;
  }

  dawn() {
    if (!this.winner) this.phase = 'day';
    this.day += 1;
    if (this.script === 'bmr') this.dawnBMR();
    if (this.engine === 'snv') this.dawnSNV();
    this.resetDay();
    this.checkWinner();
    return { deaths: [...this.nightDeaths] };
  }

  // ───────────────────────── 白天 ─────────────────────────
  resetDay() {
    this.nominators = new Set();
    this.nominees = new Set();
    this.block = null;     // 当前要被处决的玩家
    this.blockVotes = 0;   // 当前最高票（平票时 block 为 null）
    this.blockTied = [];   // 平票时同票的几个人（只用来显示：他们一起站在台上，但谁都不会被处决）
    this.executedToday = false;
    this.nomBy = {};       // 今天谁提名了谁：被提名者 → 提名者（政客终局判责任用）
    this.blockVoters = []; // 台上那个人的举手名单
    this.riotChain = null; // 暴乱：接着提名的人（只在当天有效）
  }

  /** 提名。返回 {virgin:true, executed} 表示贞洁者触发、提名者被立即处决。 */
  nominate(nominatorId, nomineeId) {
    if (this.phase !== 'day') throw new Error('只能在白天提名');
    if (this.executedToday) throw new Error('今天已经处决过了');
    if (this.pardonDay === this.day) throw new Error('今天特赦过了，不再处决');
    if (nomineeId === 'storyteller' && this.engine === 'snv') return this.nominateST(nominatorId); // 有无神论者的剧本：提名说书人
    const a = this.get(nominatorId); const b = this.get(nomineeId);
    if (!a || !b) throw new Error('提名者或被提名者不在游戏中');
    if (b.left || a.left) throw new Error('离开了这局的人不能提名，也不能被提名');
    if (b.traveller) throw new Error('旅行者不能被提名处决：要让他出局，用「提议流放」');
    const riot = this.engine === 'snv' && this.riotOn?.(); // 暴乱：被提名就死，被提名的人接着提名
    const chain = riot && this.riotChain === a.id;
    if (riot && this.riotChain && !chain) throw new Error(`现在轮到 ${this.name(this.riotChain)} 接着提名`);
    if (!chain && !this.visAlive(a)) throw new Error('死亡玩家不能提名');
    if (this.engine === 'snv' && this.golemBlocked?.(a)) throw new Error('你整局只能提名一次，已经用掉了');
    if (!chain && this.nominators.has(a.id)) throw new Error('你今天已经提名过了');
    if (this.nominees.has(b.id)) throw new Error(`${this.name(b.id)} 今天已经被提名过了`);
    if (riot && !b.alive) throw new Error('暴乱在场时不能提名死亡的玩家');
    this.nominators.add(a.id);
    this.nominees.add(b.id);
    (this.nomBy ??= {})[b.id] = a.id;
    (this.nomHistory ??= []).push([a.id, b.id]); // 整局的提名记录：谁提名过谁（读场没有发言时的兜底）
    this.suspicion[b.id] = (this.suspicion[b.id] ?? 0) + 1;
    this.log.push(`第${this.day}天 ${this.name(a.id)} 提名 ${this.name(b.id)}`);
    this.record('nominate', `${this.tag(a.id)} 提名了 ${this.tag(b.id)}`);
    if (riot) { this.riotChain = null; this.riotNominated(b); return { virgin: false, riot: true }; }
    if (this.engine === 'snv') {
      const cursed = this.nominateSNV(a);
      const golem = !cursed && !this.winner && this.golemSNV(a, b); // 魔像：提名的人不是恶魔就死，提名照常进行
      if (golem) this.checkWinner();
      const executed = cursed || this.winner ? null : this.virginSNV(a, b);
      return executed ? { virgin: true, executed, cursed, golem } : { virgin: false, cursed, golem };
    }

    if (b.role === 'virgin' && b.alive && !this.virginUsed) {
      this.virginUsed = true;
      if (!this.broken(b) && this.regTownsfolk(a, '贞洁者被提名', 'good')) { // 间谍被当成镇民 = 间谍被处决：帮善良
        this.record('nominate', '贞洁者能力触发：提名者是镇民，立即被处决');
        this.execute(a);
        return { virgin: true, executed: a.id };
      }
    }
    return { virgin: false };
  }

  /** 投票顺序：从被提名者的下一位开始顺时针，被提名者最后。 */
  voteOrder(nomineeId) {
    const n = this.players.length;
    const start = (nomineeId === 'storyteller' ? this.get(this.nomBy?.storyteller) ?? this.players[0] : this.get(nomineeId)).seat; // 下标 = seat；说书人没有座位，从提名者的下一位开始
    return Array.from({ length: n }, (_, k) => this.players[(start + k) % n].id);
  }

  canVote(id) {
    const p = this.get(id);
    if (!p || p.left) return false;
    if (this.voudonOn?.()) return (p.role === 'voudon' && p.alive) || !this.visAlive(p); // 巫毒师：只有他和死人能投，死人不用票
    if (p.role === 'beggar' && p.traveller && this.visAlive(p)) return (p.beggarTokens ?? 0) > 0; // 乞丐：只能用别人给的投票标记
    return this.visAlive(p) || p.ghostVote;
  }
  /** 管家：主人举手时才能投票（管家能力失效时不受限）。yesIds 是此刻举着手的人。 */
  butlerOk(id, yesIds) {
    const p = this.get(id);
    if (p?.role !== 'butler' || this.broken(p) || !this.butlerMaster) return true;
    return yesIds.includes(this.butlerMaster);
  }
  threshold() { return this.voudonOn?.() ? 1 : Math.ceil(this.visAliveCount() / 2); } // 巫毒师：不需要过半数

  /** 记录一次投票结果（yesIds 为举手的人）。死人举手会消耗他唯一的幽灵票。 */
  recordVote(nomineeId, yesIds, force = null) {
    // 管家没跟着主人投的违规票也照算（官方：说书人不替管家把关，不算的话大家就知道谁是管家了）
    const voters = yesIds.filter((id) => this.canVote(id));
    const voudon = this.voudonOn?.();
    for (const id of voters) { const p = this.get(id); if (!this.visAlive(p) && !voudon) p.ghostVote = false; this.beggarVoted?.(id); }
    if (this.engine === 'snv') this.voteSNV(voters);
    // 旅行者：窃贼选的人算负票、官员选的人算三票（count 可能比举手的人数多或少）
    let count = voters.reduce((a, id) => a + (this.voteWeight?.(id) ?? 1), 0);
    if (force === 'pass') count = Math.max(count, this.threshold(), this.blockVotes + 1); // 法官：强制成功
    if (force === 'fail') count = 0; // 法官：强制失败，官方「视为得到了 0 票」，台上的人不变
    if (!force && this.legionZero?.(voters)) { count = 0; this.record('st', `军团：对 ${this.name(nomineeId)} 举手的只有邪恶玩家，投票无效（算 0 票）`); }
    this.suspicion[nomineeId] = (this.suspicion[nomineeId] ?? 0) + count;
    const threshold = this.threshold();
    let outcome = 'fail';
    if (count >= threshold) {
      if (count > this.blockVotes) { this.block = nomineeId; this.blockVotes = count; this.blockTied = []; this.blockVoters = [...voters]; outcome = 'block'; }
      else if (count === this.blockVotes) { this.blockTied = [...new Set([...(this.block ? [this.block] : this.blockTied ?? []), nomineeId])]; this.block = null; outcome = 'tie'; }
      else outcome = 'lower';
    }
    this.log.push(`对 ${this.name(nomineeId)} 投票：${count} 票（需 ${threshold}）→ ${outcome}`);
    const what = { block: '送上处决台', tie: '平票，台上清空', lower: '票数不如台上的人', fail: '票数不够' }[outcome];
    this.record('vote', `对 ${this.name(nomineeId)} 投票 ${count} 票（需 ${threshold}）→ ${what}${voters.length ? `。举手：${voters.map((id) => this.name(id)).join('、')}` : ''}`);
    return { count, threshold, outcome, voters };
  }

  execute(p) {
    if (this.script === 'bmr') return this.executeBMR(p);
    if (this.engine === 'snv') return this.executeSNV(p);
    p = this.scapegoatSwap(p); // 替罪羊可能替死
    this.executedToday = true;
    if (p.alive) this.lastExecuted = p.id; // 送葬者看的是"今天死于处决"的人：处决一个已经死了的人不算
    this.log.push(`${this.name(p.id)} 被处决`);
    if (p.role === 'saint' && p.alive && !this.broken(p)) {
      this.kill(p, 'execution');
      this.setWinner('evil', `圣徒 ${this.name(p.id)} 被处决`);
      return;
    }
    this.kill(p, 'execution', this.dayMessages());
    this.checkWinner();
  }

  /** 黄昏：处决台上的人，然后检查镇长胜利。 */
  endDay() {
    if (this.script === 'bmr') return this.endDayBMR();
    if (this.engine === 'snv') return this.endDaySNV();
    let executed = null;
    if (!this.executedToday && this.block) {
      executed = this.block;
      this.execute(this.get(executed));
    }
    if (!this.winner && !this.executedToday && this.aliveCount() === 3) {
      const mayor = this.byRole('mayor');
      if (mayor?.alive && !this.broken(mayor)) this.setWinner('good', `只剩三人且无人被处决，镇长 ${this.name(mayor.id)} 带领善良获胜`);
    }
    return { executed };
  }

  /** 猎手开枪。任何人都可以"声称"自己是猎手。 */
  slay(shooterId, targetId) {
    if (this.phase !== 'day') throw new Error('只能在白天开枪');
    const s = this.get(shooterId); const t = this.get(targetId);
    if (!s || !t) throw new Error('玩家不在游戏中');
    if (this.engine === 'snv') return this.slaySNV(s, t);
    // 官方规则里谁都可以声称自己是猎手开枪（诈身份用），这里限制每人每局只能声称一次，免得反复乱点
    this.shooters ??= [];
    if (this.shooters.includes(s.id)) throw new Error('你这局已经开过枪了');
    this.shooters.push(s.id);
    let hit = false;
    if (s.role === 'slayer' && s.alive && (!this.slayerUsed || SCRIPTS[this.script].ragnarok)) { // 死了的猎手没有能力（照样可以假装开枪）；诸神黄昏人人都是猎手，各开各的
      this.slayerUsed = true;
      if (!this.broken(s) && t.alive && this.regDemon(t, '猎手开枪')) hit = true;
    }
    this.log.push(`${this.name(s.id)} 对 ${this.name(t.id)} 开枪 → ${hit ? '命中' : '无事发生'}`);
    this.record('slay', `${this.tag(s.id)} 向 ${this.tag(t.id)} 开枪 → ${hit ? '命中' : '无事发生'}`);
    if (hit) { this.kill(t, 'slayer', this.dayMessages()); this.checkWinner(); }
    return { hit };
  }

  // ───────────────────────── 胜负 ─────────────────────────
  setWinner(team, reason) {
    if (this.winner) return;
    // 异端分子（横行霸道）：对调胜负，死了也对调；醉酒中毒时不对调（集石百科）
    const heretic = this.engine === 'snv' && this.players.find((p) => this.has?.(p, 'heretic') && !p.left);
    if (heretic && !this.snvBroken(heretic)) {
      reason = `${reason}——但异端分子 ${this.name(heretic.id)} 在场，胜负对调`;
      team = team === 'good' ? 'evil' : 'good';
    }
    this.winner = team;
    this.winReason = reason;
    this.phase = 'ended';
    this.record('end', `${team === 'good' ? '善良' : '邪恶'}获胜：${reason}`);
    if (this.engine === 'snv' && !this.politicianDone) { this.politicianDone = true; this.politicianCheck(); } // 政客：不管是怎么分出胜负的，终局都判一次
  }

  checkWinner() {
    if (this.script === 'bmr') return this.checkWinnerBMR();
    if (this.engine === 'snv') return this.checkWinnerSNV();
    if (this.winner) return this.winner;
    if (!this.demon()) this.setWinner('good', SCRIPTS[this.script].ragnarok ? '狼人全部死亡' : '恶魔已经死亡');
    else if (SCRIPTS[this.script].ragnarok && this.alive().filter((p) => p.role === 'imp').length * 2 >= this.aliveCount()) this.setWinner('evil', '存活的狼人追平了好人');
    else if (this.townAlive() <= 2) this.setWinner('evil', '只剩两名存活玩家，恶魔获胜'); // 旅行者不算
    else if (this.allAliveEvil()) this.setWinner('evil', ALL_EVIL);
    return this.winner;
  }
  /**
   * 活着的全是邪恶：善良已经赢不了，提前结束（官方《给说书人的建议》第 1 条：一个阵营已经能确定获胜时可以提前结束）。
   * 被当作死亡的僵怖算活着（他真的活着）。
   */
  allAliveEvil() {
    const live = this.alive().filter((p) => !p.traveller); // 旅行者不算
    return live.length > 0 && live.every((p) => this.evilOf(p));
  }

  // ───────────────────────── 说书人工具 ─────────────────────────
  /** 说书人手记：自动说书人做过的每个判定。 */
  get journal() { return this.st.journal; }
  stKill(id) { const p = this.get(id); if (p) { this.kill(p, 'storyteller'); this.checkWinner(); } }
  stRevive(id) {
    const p = this.get(id);
    if (!p) return;
    if (this.script === 'bmr') { this.revive(p, '说书人'); return; }
    p.alive = true; p.ghostVote = true;
  }
  setRole(id, role) {
    const p = this.get(id);
    if (!p || !ROLES[role]) throw new Error('无效的玩家或角色');
    if (this.engine === 'snv') { this.changeRole(p, role); p.evil = isEvilRole(role); this.afterChange(null); this.checkWinner(); return; }
    p.role = role;
    p.shownRole = role;
    if (this.script === 'bmr') p.evil = isEvilRole(role); // 黯月初升阵营单独记（莽夫会变），换角色要跟着换
  }
  setShownRole(id, role) { const p = this.get(id); if (p) p.shownRole = role; }

  /** viewer：看魔典的人（间谍、寡妇）。全员失忆时他还不知道自己是谁，他自己那一行只写「失忆的 X」。 */
  grimoire(viewer = null) {
    return this.players.map((p) => {
      if (p.id === viewer && this.allAmn?.(p)) return `${this.evilOf(p) ? '【邪】' : '【善】'}${p.seat}号 ${p.name} — ${ROLES[this.amnRoleOf(p)].name}${p.alive ? '' : '（死亡）'}`;
      const tags = [];
      if (!p.alive) tags.push(p.ghostVote ? '死亡（有幽灵票）' : '死亡');
      if (p.role === 'drunk') tags.push(`以为自己是${ROLES[p.shownRole].name}`);
      if (this.isPoisoned(p)) tags.push('中毒');
      if (p.id === this.redHerring) tags.push('占卜师的干扰项');
      if (p.id === this.butlerMaster) tags.push('管家的主人');
      if (p.id === this.monkTarget) tags.push('被僧侣保护');
      if (this.script === 'bmr') {
        if (p.role === 'lunatic') tags.push(`以为自己是${ROLES[p.shownRole].name}`);
        if (p.apparentDead) tags.push('僵怖：被当作死亡');
        if (this.bmrBroken(p) && !this.isPoisoned(p)) tags.push('醉酒');
        if (p.id === this.grandchild) tags.push('祖母的孙子');
        if (p.id === this.pukkaVictim) tags.push('普卡的毒');
        if (this.used[p.id]) tags.push('能力已用');
      }
      if (this.engine === 'snv') {
        if (p.role === 'lunatic') tags.push(`以为自己是${ROLES[p.shownRole].name}`);
        if (p.gained) tags.push(p.role === 'amnesiac' ? `能力其实是${ROLES[p.gained].name}` : `获得了${ROLES[p.gained].name}的能力`);
        if (this.broken(p) && !this.isPoisoned(p)) tags.push('醉酒');
        if (this.kept(p)) tags.push('保留能力');
        if (this.madness[p.id]) tags.push(`疯狂：${ROLES[this.madness[p.id].role].name}`);
        if (this.twin?.b === p.id) tags.push('对立双子');
        if (this.fx.some((f) => f.kind === 'curse' && f.target === p.id)) tags.push('被诅咒');
        if (this.harpyMad?.id === p.id) tags.push(`鹰身女妖：要疯狂地证明 ${this.harpyMad.target ? this.name(this.harpyMad.target) : '?'} 是邪恶的`);
        if (this.harpyMad?.target === p.id) tags.push('鹰身女妖的第二名');
        if (p.id === this.pukkaVictim) tags.push('普卡的毒');
        if (this.extraAbility(p)) tags.push(`科学怪人给的能力：${ROLES[this.extraAbility(p)].name}`);
        if (p.seat7) tags.push('7 号空座（说书人代管）');
      }
      const evil = this.evilOf(p) ? '【邪】' : '【善】';
      return `${evil}${p.seat}号 ${p.name} — ${ROLES[p.role].name}${tags.length ? `（${tags.join('、')}）` : ''}`; // 客户端按这个格式排成表（util.jsx 的 GrimoireLines）
    }).join('\n');
  }
}

// 黯月初升的方法（script === 'bmr' 时上面各处转过去调用）
Object.assign(Game.prototype, BMR_METHODS);
Object.assign(Game.prototype, SNV_METHODS);
Object.assign(Game.prototype, TRAVELLER_METHODS);
Object.assign(Game.prototype, ROCHAMBEAU_METHODS);
Object.assign(Game.prototype, ALL_AMNESIAC_METHODS);
