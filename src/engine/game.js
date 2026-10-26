// 血染钟楼的规则引擎（暗流涌动 + 黯月初升）。纯逻辑，不碰 Discord，方便测试。
// 暗流涌动的规则写在这个文件里；黯月初升的在 bmr.js（script === 'bmr' 时各个方法转过去）。
//
// 用法（一晚）：
//   const prompts = game.startNight();      // 谁需要选人
//   game.submitChoice(playerId, [ids...]);  // 收集选择
//   const res = game.resolveNight();        // 结算：私密信息、死亡、守鸦人
//   if (res.ravenkeeper) game.resolveRavenkeeper(targetId)
//   const dawn = game.dawn();               // 天亮公布死讯
// 白天：nominate → voteOrder / recordVote → endDay

import {
  ROLES, TOWNSFOLK, OUTSIDERS, MINIONS, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, isEvilRole,
} from './roles.js';
import { Storyteller } from './storyteller.js';
import { BMR_METHODS } from './bmr.js';

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

/** 按人数随机出一套角色（已处理男爵 +2 外来者）。noBaron：这局不发男爵（房规：小局不要男爵）。 */
export function rollRoles(n, rng, { noBaron = false } = {}) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`人数需在 ${MIN_PLAYERS}–${MAX_PLAYERS} 之间`);
  let [t, o, m] = DISTRIBUTION[n];
  const minions = sample(noBaron ? MINIONS.filter((r) => r !== 'baron') : MINIONS, m, rng);
  if (minions.includes('baron')) { t -= 2; o += 2; }
  return shuffle([...sample(TOWNSFOLK, t, rng), ...sample(OUTSIDERS, o, rng), ...minions, 'imp'], rng);
}

export class Game {
  /**
   * @param {{id:string,name:string}[]} players 已按座位顺序排列（顺时针）
   * @param {{rng?:()=>number, roles?:string[], misregister?:number}} opts
   *   misregister：陌客/间谍"错误登记"的固定概率（测试用）；不给就由说书人按局势判定
   */
  constructor(players, { rng = Math.random, roles, misregister = null, evilInfo = null, script = 'tb', drunkAs = null, noBaron = false, deadDrunk = false } = {}) {
    this.rng = rng;
    this.script = script === 'bmr' ? 'bmr' : 'tb';
    // 官方规则：7 人及以上第一夜恶魔和爪牙互认、恶魔拿 3 个伪装；6 人及以下都不给（房规可打开）
    this.evilInfo = evilInfo ?? players.length >= 7;
    this.evilKnown = null;     // 第一夜互认的结果：id → [{id, team}]
    this.bluffsShared = false; // 恶魔有没有把伪装告诉爪牙
    this.id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); // 这一局的编号（客户端按它分开存标记）
    this.misregister = misregister;
    this.deadDrunk = !!deadDrunk; // 房规：夜里被杀的信息角色照样拿当晚的信息，但按醉酒处理（官方：死了就没有能力）
    this.suspicion = {}; // 每个人被提名、得票的累计，说书人判断局势用
    this.timeline = [];  // 终局复盘：每晚谁选了谁、谁得到什么信息（真/假）、死亡、提名投票、说书人的判定
    this.st = new Storyteller(this, rng);
    this.nightDeaths = [];
    if (this.script === 'bmr') this.setupBMR(players, roles, rng);
    else {
      const assigned = roles ?? balancedTB(players.length, rng, { noBaron });
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
      this.bluffs = [...goodOut(TOWNSFOLK), ...goodOut(OUTSIDERS)].slice(0, 3);

      this.redHerring = this.st.redHerring();
      this.firstDemon = this.players.find((p) => p.role === 'imp')?.id ?? null;
    }
    this.record('setup', this.players.map((p) => `${p.seat}号 ${p.name}：${this.roleText(p)}`).join('；'));
    this.record('setup', `恶魔拿到的伪装：${this.bluffs.map((r) => ROLES[r].name).join('、')}`);

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

  /** 记一条复盘。kind：setup 开局 / choice 夜里选择 / info 私密信息 / death 死亡 / nominate 提名 / vote 投票 / slay 开枪 / st 说书人判定 / end 终局 */
  record(kind, text, extra = {}) {
    this.timeline.push({ when: this.st.when(), kind, text, ...extra });
  }
  /** 带角色的名字（复盘用）：3号 小明（共情者）；酒鬼写成 酒鬼·以为是xx。 */
  tag(id) {
    const p = this.get(id);
    if (!p) return '?';
    const r = p.role === 'drunk' ? `酒鬼·以为是${ROLES[p.shownRole].name}` : p.role === 'lunatic' ? `疯子·以为是${ROLES[p.shownRole].name}` : ROLES[p.role].name;
    return `${this.name(id)}（${r}）`;
  }
  roleText(p) {
    if (p.role === 'drunk') return `酒鬼（以为自己是${ROLES[p.shownRole].name}）`;
    if (p.role === 'lunatic') return `疯子（以为自己是${ROLES[p.shownRole].name}）`;
    return ROLES[p.role].name;
  }

  // ───────────────────────── 存档 ─────────────────────────
  /** 整局状态转成普通 JSON（服务器重启后用 Game.fromJSON 接着玩）。 */
  toJSON() {
    const keys = ['misregister', 'suspicion', 'timeline', 'players', 'bluffs', 'redHerring', 'phase', 'night', 'day', 'winner', 'winReason',
      'poisonTarget', 'monkTarget', 'butlerMaster', 'virginUsed', 'slayerUsed', 'lastExecuted', 'choices', 'nightDeaths', 'log',
      'block', 'blockVotes', 'blockTied', 'executedToday', 'shooters', 'firstDemon', 'evilInfo', 'evilKnown', 'bluffsShared', 'id',
      'script', 'fx', 'used', 'lastPick', 'pukkaVictim', 'poCharged', 'shabaLast', 'grandchild', 'gossipPending', 'gossipSaid',
      'moonchildPick', 'pendingMoonchild', 'diedToday', 'outsiderDiedToday', 'mastermindDay', 'demonExecuted', 'nightRevived', 'newbies', 'deadDrunk'];
    const out = Object.fromEntries(keys.map((k) => [k, this[k]]));
    out.nominators = [...this.nominators];
    out.nominees = [...this.nominees];
    out.st = this.st.toJSON();
    return out;
  }

  static fromJSON(data, { rng = Math.random } = {}) {
    const g = Object.create(Game.prototype);
    g.rng = rng;
    g.st = new Storyteller(g, rng);
    const { nominators, nominees, journal, st, ...rest } = data;
    Object.assign(g, structuredClone(rest));
    g.timeline ??= [];
    g.nominators = new Set(nominators);
    g.nominees = new Set(nominees);
    g.st.load(st ?? { journal });
    // 旧存档补字段
    g.evilInfo ??= g.players.length >= 7;
    if (g.firstDemon === undefined) g.firstDemon = g.players.find((p) => p.role === 'imp')?.id ?? null;
    if (g.evilKnown === undefined) g.evilKnown = g.evilInfo && (g.night > 1 || g.phase === 'day' || g.phase === 'ended') ? g.knownMap() : null;
    g.bluffsShared ??= false;
    g.id ??= `old-${g.players.map((p) => p.seat + p.id.slice(-3)).join('')}`;
    g.script ??= 'tb';
    if (g.script === 'bmr') { g.wokeTonight = new Set(); g.goonHit = false; g.blocked = null; g.nightRevived ??= []; }
    return g;
  }

  /** 恶魔和爪牙互相知道谁是谁（按现在的角色）：id → [{id, team:'恶魔'|'爪牙'}] */
  knownMap() {
    const evil = this.players.filter((p) => ['minion', 'demon'].includes(ROLES[p.role].team));
    return Object.fromEntries(evil.map((p) => [p.id, evil.filter((x) => x.id !== p.id).map((x) => ({ id: x.id, team: ROLES[x.role].team === 'demon' ? '恶魔' : '爪牙' }))]));
  }

  /** 开局的恶魔把 3 个伪装告诉爪牙（现实里是私聊，这里一键分享）。 */
  shareBluffs(uid) {
    if (uid !== this.firstDemon || !this.evilKnown?.[uid]) throw new Error('只有第一夜拿到伪装的恶魔能分享');
    if (this.bluffsShared) return;
    this.bluffsShared = true;
    this.record('st', `${this.tag(uid)} 把 3 个伪装告诉了爪牙`);
  }

  // ───────────────────────── 查询 ─────────────────────────
  get(id) { return this.players.find((p) => p.id === id); }
  alive() { return this.players.filter((p) => p.alive); }
  aliveCount() { return this.alive().length; }
  byRole(role) { return this.players.find((p) => p.role === role); }
  demon() { return this.players.find((p) => p.alive && ROLES[p.role].team === 'demon'); }
  name(id) { const p = this.get(id); return p ? `${p.seat}号 ${p.name}` : '?'; }

  visAlive(p) { return p.alive && !p.apparentDead; }
  evilOf(p) { return p.evil ?? isEvilRole(p.role); }
  /** 城镇广场上看起来活着的人数（被当作死亡的僵怖不算）。 */
  visAliveCount() { return this.players.filter((p) => this.visAlive(p)).length; }

  isPoisoned(p) {
    if (this.script === 'bmr') return this.fx.some((f) => f.kind === 'poison' && f.target === p.id && this.fxLive(f));
    const poisoner = this.byRole('poisoner');
    return this.poisonTarget === p.id && poisoner?.alive;
  }
  /** 能力失效：酒鬼或中毒。 */
  broken(p) { return this.script === 'bmr' ? this.bmrBroken(p) : p.role === 'drunk' || this.isPoisoned(p); }

  /** 坐在 p 两侧最近的存活玩家。 */
  aliveNeighbours(p) {
    const n = this.players.length;
    const res = [];
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = this.players[(p.seat - 1 + dir * k + n * k) % n];
        if (q.id === p.id) break;
        if (q.alive) { res.push(q); break; }
      }
    }
    return res[0] && res[1] && res[0].id === res[1].id ? [res[0]] : res;
  }

  // 陌客/间谍的"登记"。健康的陌客可能被当作邪恶，健康的间谍可能被当作善良。by：谁在检测（写进说书人手记）。
  misreg(p, by = '检测') {
    if ((p.role !== 'recluse' && p.role !== 'spy') || this.isPoisoned(p)) return false;
    if (this.misregister != null) return this.rng() < this.misregister;
    return this.st.misregister(p, by);
  }
  regEvil(p, by) { const evil = isEvilRole(p.role); return this.misreg(p, by) ? !evil : evil; }
  regDemon(p, by) { return p.role === 'imp' || (p.role === 'recluse' && this.misreg(p, by)); }
  regTownsfolk(p, by) { return ROLES[p.role].team === 'townsfolk' || (p.role === 'spy' && this.misreg(p, by)); }
  /** 被送葬者/守鸦人看到的角色。 */
  regRole(p, by) {
    if (this.misreg(p, by)) return this.st.misregRole(p);
    return p.role;
  }
  /** 能力失效的人拿假信息：按说书人给他编的那套假世界回答（前后一致，见 storyteller.js）。 */
  lies(p) { return this.broken(p); }

  // ───────────────────────── 夜晚 ─────────────────────────
  startNight() {
    this.phase = 'night';
    this.night += 1;
    this.choices = {};
    this.nightDeaths = [];
    this.demonKills = [];
    this.poisonTarget = null; // 上一晚的毒到黄昏结束
    this.monkTarget = null;
    this.butlerMaster = null;
    if (this.script === 'bmr') {
      this.startNightBMR();
      if (this.night === 1) this.evilMessages = this.evilInfoBMR();
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
    return this.alive().filter((p) => ROLES[p.shownRole][key] > 0)
      .sort((a, b) => ROLES[a.shownRole][key] - ROLES[b.shownRole][key]);
  }

  submitChoice(playerId, targets, extra = {}) {
    if (this.script === 'bmr') return this.submitChoiceBMR(playerId, targets, extra);
    const prompt = this.nightPrompts().find((x) => x.playerId === playerId);
    if (!prompt) throw new Error('你今晚不需要选择');
    if (targets.length !== prompt.count || new Set(targets).size !== targets.length) throw new Error(`需要选择 ${prompt.count} 名不同的玩家`);
    if (!targets.every((t) => prompt.options.includes(t))) throw new Error('选择了不可选的玩家');
    this.choices[playerId] = targets;
  }

  /** 随机替没选的人选（超时或机器人玩家）。 */
  autoChoose(playerId) {
    if (this.script === 'bmr') return this.autoChooseBMR(playerId);
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
          const [a, b] = choice.map((id) => this.get(id));
          let yes = [a, b].some((q) => this.regDemon(q, '占卜师查验') || q.id === this.redHerring);
          if (broken && lies()) yes = this.st.fakeFortune(p, a, b, yes);
          say(p, `${this.name(a.id)} 与 ${this.name(b.id)} 之中${yes ? '**有**' : '**没有**'}恶魔。`);
          break;
        }
        case 'undertaker': {
          if (this.lastExecuted == null) break;
          const ex = this.get(this.lastExecuted);
          const r = broken && lies() ? this.st.falseRole(p, ex) : this.regRole(ex, '送葬者查看');
          say(p, `今天被处决的 ${this.name(ex.id)} 是 **${ROLES[r].name}**。`);
          break;
        }
        case 'butler':
          if (choice) {
            if (p.role === 'butler') this.butlerMaster = choice[0];
            say(p, `你的主人是 ${this.name(choice[0])}。明天只有他举手时你才能投票。`);
          }
          break;
        case 'spy':
          say(p, `魔典：\n${this.grimoire()}`);
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
    const rk = this.players.find((p) => p.shownRole === 'ravenkeeper' && this.nightDeaths.includes(p.id));
    const t = this.get(targetId);
    if (!rk || !t) throw new Error('无效的守鸦人选择');
    const r = this.lies(rk) ? this.st.falseRole(rk, t) : this.regRole(t, '守鸦人查看');
    return { playerId: rk.id, text: `${this.name(t.id)} 的角色是 **${ROLES[r].name}**。` };
  }

  impKill(imp, target, messages) {
    if (!target || !target.alive) return;
    if (target.id === imp.id) { this.kill(imp, 'starpass', messages); return; }
    if (this.monkTarget === target.id) return;
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
    const aliveBefore = this.aliveCount();
    p.alive = false;
    if (this.phase === 'night') this.nightDeaths.push(p.id);
    if (this.phase === 'night' && cause === 'demon') (this.demonKills ??= []).push(p.id); // 夜里被恶魔破门杀死的（前端播破门动画）
    this.log.push(`${this.name(p.id)} 死亡（${cause}）`);
    const why = { demon: '被恶魔杀死', starpass: '恶魔自杀（传位）', execution: '被处决', slayer: '被猎手射杀', storyteller: '说书人判定死亡' }[cause] ?? cause;
    this.record('death', `${this.tag(p.id)} ${why}`);
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

  /** 洗衣妇/图书管理员/调查员：两人之一是某角色。lies：能力失效且说书人决定给假信息。 */
  infoPair(p, team, lies) {
    const others = this.players.filter((q) => q.id !== p.id);
    const pool = { townsfolk: TOWNSFOLK, outsider: OUTSIDERS, minion: MINIONS }[team];
    const by = ROLES[p.shownRole].name;
    let target; let role;
    if (lies) {
      const fake = this.st.falsePair(p, team);
      if (!fake) return team === 'outsider' ? '场上**没有**外来者。' : '没有可以告诉你的信息。';
      ({ target, role } = fake);
    } else {
      const cands = others.filter((q) => {
        if (team === 'townsfolk') return this.regTownsfolk(q, by);
        if (team === 'outsider') return ROLES[q.role].team === 'outsider' || (q.role === 'spy' && this.misreg(q, by));
        // 间谍可能登记成善良（调查员看不到他），陌客可能登记成爪牙
        if (q.role === 'spy') return !this.misreg(q, by);
        return ROLES[q.role].team === 'minion' || (q.role === 'recluse' && this.misreg(q, by));
      });
      if (!cands.length) return team === 'outsider' ? '场上**没有**外来者。' : '没有可以告诉你的信息。';
      target = pick(cands, this.rng);
      role = ROLES[target.role].team === team ? target.role : pick(pool, this.rng);
    }
    const decoy = pick(others.filter((q) => q.id !== target.id), this.rng);
    const pair = shuffle([target, decoy], this.rng).map((q) => `**${this.name(q.id)}**`);
    return `${pair[0]} 与 ${pair[1]} 之中，有一人是 **${ROLES[role].name}**。`;
  }

  chefInfo(p, lies) {
    const n = this.players.length;
    // 拿假信息时只需要真相作对照，不用掷陌客/间谍的错误登记
    const evil = this.players.map((q) => (lies ? isEvilRole(q.role) : this.regEvil(q, '厨师检测')));
    let pairs = 0;
    for (let i = 0; i < n; i++) if (evil[i] && evil[(i + 1) % n]) pairs++;
    return lies ? this.st.fakeChef(p, pairs) : pairs;
  }

  empathInfo(p, lies) {
    const truth = this.aliveNeighbours(p).filter((q) => (lies ? isEvilRole(q.role) : this.regEvil(q, '共情者检测'))).length;
    return lies ? this.st.fakeEmpath(p, truth) : truth;
  }

  dawn() {
    if (!this.winner) this.phase = 'day';
    this.day += 1;
    if (this.script === 'bmr') this.dawnBMR();
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
  }

  /** 提名。返回 {virgin:true, executed} 表示贞洁者触发、提名者被立即处决。 */
  nominate(nominatorId, nomineeId) {
    if (this.phase !== 'day') throw new Error('只能在白天提名');
    if (this.executedToday) throw new Error('今天已经处决过了');
    const a = this.get(nominatorId); const b = this.get(nomineeId);
    if (!a || !b) throw new Error('提名者或被提名者不在游戏中');
    if (!this.visAlive(a)) throw new Error('死亡玩家不能提名');
    if (this.nominators.has(a.id)) throw new Error('你今天已经提名过了');
    if (this.nominees.has(b.id)) throw new Error(`${this.name(b.id)} 今天已经被提名过了`);
    this.nominators.add(a.id);
    this.nominees.add(b.id);
    this.suspicion[b.id] = (this.suspicion[b.id] ?? 0) + 1;
    this.log.push(`第${this.day}天 ${this.name(a.id)} 提名 ${this.name(b.id)}`);
    this.record('nominate', `${this.tag(a.id)} 提名了 ${this.tag(b.id)}`);

    if (b.role === 'virgin' && b.alive && !this.virginUsed) {
      this.virginUsed = true;
      if (!this.broken(b) && this.regTownsfolk(a, '贞洁者被提名')) {
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
    const start = this.get(nomineeId).seat; // 下标 = seat
    return Array.from({ length: n }, (_, k) => this.players[(start + k) % n].id);
  }

  canVote(id) { const p = this.get(id); return !!p && (this.visAlive(p) || p.ghostVote); }
  /** 管家：主人举手时才能投票（管家能力失效时不受限）。yesIds 是此刻举着手的人。 */
  butlerOk(id, yesIds) {
    const p = this.get(id);
    if (p?.role !== 'butler' || this.broken(p) || !this.butlerMaster) return true;
    return yesIds.includes(this.butlerMaster);
  }
  threshold() { return Math.ceil(this.visAliveCount() / 2); }

  /** 记录一次投票结果（yesIds 为举手的人）。死人举手会消耗他唯一的幽灵票。 */
  recordVote(nomineeId, yesIds) {
    const voters = yesIds.filter((id) => this.canVote(id) && this.butlerOk(id, yesIds));
    for (const id of voters) { const p = this.get(id); if (!this.visAlive(p)) p.ghostVote = false; }
    const count = voters.length;
    this.suspicion[nomineeId] = (this.suspicion[nomineeId] ?? 0) + count;
    const threshold = this.threshold();
    let outcome = 'fail';
    if (count >= threshold) {
      if (count > this.blockVotes) { this.block = nomineeId; this.blockVotes = count; this.blockTied = []; outcome = 'block'; }
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
    this.executedToday = true;
    this.lastExecuted = p.id;
    this.log.push(`${this.name(p.id)} 被处决`);
    if (p.role === 'saint' && p.alive && !this.broken(p)) {
      this.kill(p, 'execution');
      this.setWinner('evil', `圣徒 ${this.name(p.id)} 被处决`);
      return;
    }
    this.kill(p, 'execution');
    this.checkWinner();
  }

  /** 黄昏：处决台上的人，然后检查镇长胜利。 */
  endDay() {
    if (this.script === 'bmr') return this.endDayBMR();
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
    if (!s.alive) throw new Error('死亡玩家不能开枪');
    // 官方规则里谁都可以声称自己是猎手开枪（诈身份用），这里限制每人每局只能声称一次，免得反复乱点
    this.shooters ??= [];
    if (this.shooters.includes(s.id)) throw new Error('你这局已经开过枪了');
    this.shooters.push(s.id);
    let hit = false;
    if (s.role === 'slayer' && !this.slayerUsed) {
      this.slayerUsed = true;
      if (!this.broken(s) && t.alive && this.regDemon(t, '猎手开枪')) hit = true;
    }
    this.log.push(`${this.name(s.id)} 对 ${this.name(t.id)} 开枪 → ${hit ? '命中' : '无事发生'}`);
    this.record('slay', `${this.tag(s.id)} 向 ${this.tag(t.id)} 开枪 → ${hit ? '命中' : '无事发生'}`);
    if (hit) { this.kill(t, 'slayer'); this.checkWinner(); }
    return { hit };
  }

  // ───────────────────────── 胜负 ─────────────────────────
  setWinner(team, reason) {
    if (this.winner) return;
    this.winner = team;
    this.winReason = reason;
    this.phase = 'ended';
    this.record('end', `${team === 'good' ? '善良' : '邪恶'}获胜：${reason}`);
  }

  checkWinner() {
    if (this.script === 'bmr') return this.checkWinnerBMR();
    if (this.winner) return this.winner;
    if (!this.demon()) this.setWinner('good', '恶魔已经死亡');
    else if (this.aliveCount() <= 2) this.setWinner('evil', '只剩两名存活玩家，恶魔获胜');
    return this.winner;
  }

  // ───────────────────────── 说书人工具 ─────────────────────────
  /** 说书人手记：自动说书人做过的每个判定。 */
  get journal() { return this.st.journal; }
  stKill(id) { const p = this.get(id); if (p) { this.kill(p, 'storyteller'); this.checkWinner(); } }
  stRevive(id) { const p = this.get(id); if (p) { p.alive = true; p.ghostVote = true; } }
  setRole(id, role) {
    const p = this.get(id);
    if (!p || !ROLES[role]) throw new Error('无效的玩家或角色');
    p.role = role;
    p.shownRole = role;
  }
  setShownRole(id, role) { const p = this.get(id); if (p) p.shownRole = role; }

  grimoire() {
    return this.players.map((p) => {
      const tags = [];
      if (!p.alive) tags.push(p.ghostVote ? '死亡（有幽灵票）' : '死亡');
      if (p.role === 'drunk') tags.push(`以为自己是${ROLES[p.shownRole].name}`);
      if (this.isPoisoned(p)) tags.push('中毒');
      if (p.id === this.redHerring) tags.push('红鲱鱼');
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
      const evil = this.evilOf(p) ? '【邪】' : '【善】';
      return `${evil}${p.seat}号 ${p.name} — ${ROLES[p.role].name}${tags.length ? `（${tags.join('，')}）` : ''}`;
    }).join('\n');
  }
}

// 黯月初升的方法（script === 'bmr' 时上面各处转过去调用）
Object.assign(Game.prototype, BMR_METHODS);
