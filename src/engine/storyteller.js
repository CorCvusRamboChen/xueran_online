// 自动说书人的判定：官方规则里"由说书人决定"的地方。两条原则结合着用：
//
// 1. 照顾局势（官方也鼓励说书人这么做）：陌客/间谍要不要错误登记、镇长替不替死、谁当红鲱鱼、
//    自刀后谁接任——哪边领先太多，就在规则允许的范围内帮另一边一点。
// 2. 假信息要自圆其说：酒鬼和中毒的人拿到的不是随手乱编的错信息，而是一套"假世界"里的真信息——
//    说书人给他编一个版本：把几个善良玩家当成恶魔和爪牙、真正的邪恶当成好人，之后每晚都按这套假世界回答，
//    前后能对上（共情者的数字不会乱跳，送葬者看到的角色和洗衣妇的信息不矛盾），别人也有办法反证。
//    中毒按投毒者的意图走：中毒的人一定拿假世界的信息，不会"这次碰巧给真的"。
//    同一个人身上不叠太多隐藏效果：陌客/间谍一晚上最多被错误登记两次。
//
// 每个判定都记进手记（journal），终局时公开。选择本身另记一份决策日志（decisions），只进存档，用来线下比较不同做法。
import { ROLES, TOWNSFOLK, OUTSIDERS, MINIONS, isEvilRole, inScript, rolesOf } from './roles.js';
import { chanceOf, drawOdds, DICE } from './dice.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const idOf = (x) => x?.id ?? x;
const upTo = (n) => Array.from({ length: n + 1 }, (_, i) => i);

// 算不算"这个人又被说书人挑中了"：同一个人身上别压太多（看决策日志就知道）
const HARM = new Set(['mayorVictim', 'gossipVictim', 'sweetheartDrunk', 'innkeeperDrunk']);
const trim = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
const tidy = (features) => Object.fromEntries(Object.entries(features).filter(([, v]) => v != null && v !== false && v !== 0).map(([k, v]) => [k, trim(v)]));
// 梦殒春宵拿信息的镇民：亡骨魔的毒下在这些人身上，影响的是全镇的判断
const SNV_INFO = new Set(['clockmaker', 'dreamer', 'mathematician', 'flowergirl', 'towncrier', 'oracle', 'savant', 'seamstress', 'juggler', 'sage']);
const shuffled = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** 局势的文字描述。 */
export function balanceLabel(b) {
  if (b > 0.4) return '善良明显领先';
  if (b > 0.15) return '善良略占上风';
  if (b < -0.4) return '邪恶明显领先';
  if (b < -0.15) return '邪恶略占上风';
  return '势均力敌';
}

export class Storyteller {
  /** @param {import('./game.js').Game} game */
  constructor(game, rng) {
    this.g = game;
    this.rng = rng;
    this.journal = [];
    this.decisions = [];       // 决策日志：只进存档，不发给任何客户端
    this.worlds = new Map();   // 玩家 id → 他看到的假世界
    this.misCount = new Map(); // "第几夜:玩家" → 这晚被错误登记了几次
    this.covers = {};          // 筑梦师看邪恶玩家时展示的伪装：id → 角色，每晚一样
  }

  when() {
    const g = this.g;
    if (g.phase === 'night') return `第${g.night}夜`;
    if (g.phase === 'day') return `第${g.day}天`;
    return '开局';
  }

  note(text, b = null) {
    const entry = { when: this.when(), text: b == null ? text : `${text}（局势：${balanceLabel(b)}）` };
    this.journal.push(entry);
    this.g.timeline?.push({ ...entry, kind: 'st' });
  }

  // ───────────── 决策日志 ─────────────
  /**
   * 记一次说书人的决定：有哪些候选、选了哪个、抽中的概率、当时的局势。
   * 手记是给玩家看的复盘，这份是给线下分析的：真人局一旦打完，没记的就补不回来了。
   * prob 为 null：这一步不是按概率抽的（比如从假世界算出来的答案）。
   */
  decide(kind, ctx = {}) {
    const g = this.g;
    this.decisions.push({ at: Date.now(), night: g.night ?? 0, day: g.day ?? 0, phase: g.phase ?? 'setup', kind, prob: null, b: g.phase ? this.balance() : null, ...ctx });
  }

  /** 这个人的情况：房间给的信号（战绩、掉线、玩家标记……）加上本局的。权重在 dice.js，没有权重的只记录。 */
  features(who, extra = {}) {
    const g = this.g;
    let signals = {};
    try { signals = g.signals?.(who) ?? {}; } catch (e) { console.warn('[botc] 信号读取失败：', e.message); } // 看情况不能耽误结算
    return { ...signals, ...(who && g.newbies?.includes(who) ? { newbie: 1 } : {}), ...extra };
  }

  /** 掷骰子决定要不要做（dice.js 的 DICE），并记下来。情况和加减值都进日志。 */
  roll(kind, extra = {}, ctx = {}) {
    const features = this.features(ctx.who, extra);
    const prob = chanceOf(kind, features);
    const yes = this.rng() < prob;
    this.decide(kind, { ...ctx, options: [true, false], chosen: yes, prob: yes ? prob : 1 - prob, base: DICE[kind].base, features: tidy(features) });
    return yes;
  }

  /** 这人这局被说书人挑中过几次，最多算 2 次。 */
  hits(id) { return Math.min(2, this.decisions.filter((d) => HARM.has(d.kind) && d.chosen === id).length); }

  /** 这种判定这局成了几次：决策日志在存档里，重启后也算得对。 */
  times(kind) { return this.decisions.filter((d) => d.kind === kind && d.chosen !== false).length; }

  /** 按分数抽一个（dice.js 的 DRAW），并记下来。featuresOf(候选) 给这个候选的情况。 */
  draw(kind, pool, featuresOf, ctx = {}) {
    if (!pool.length) return undefined;
    const list = pool.map((x) => this.features(typeof x === 'object' ? x.id : null, featuresOf(x)));
    const odds = drawOdds(kind, list);
    let left = this.rng();
    let i = 0;
    while (i < pool.length - 1 && left >= odds[i]) { left -= odds[i]; i++; }
    this.decide(kind, { ...ctx, options: pool.map(idOf), chosen: idOf(pool[i]), prob: odds[i], odds: odds.map(trim), features: list.map(tidy) });
    return pool[i];
  }

  /** 从候选里随机挑一个，并记下来。 */
  choose(kind, pool, ctx = {}) {
    const x = pick(pool, this.rng);
    if (pool.length) this.decide(kind, { ...ctx, options: pool.map(idOf), chosen: idOf(x), prob: 1 / pool.length });
    return x;
  }

  /**
   * 局势：-1（邪恶大优）到 +1（善良大优）。
   * 看三件事：爪牙死了多少、恶魔被怀疑得多厉害（被提名和得票）、善良死了多少。
   */
  balance() {
    const g = this.g;
    const isEvil = (p) => (g.evilOf ? g.evilOf(p) : isEvilRole(p.role));
    const evil = g.players.filter(isEvil);
    const good = g.players.filter((p) => !isEvil(p));
    const minions = evil.filter((p) => ROLES[p.role].team === 'minion');
    const minionDead = minions.length ? minions.filter((p) => !p.alive).length / minions.length : 0;
    const goodDead = good.length ? good.filter((p) => !p.alive).length / good.length : 0;
    const demon = g.demon();
    const heat = Object.values(g.suspicion);
    const maxHeat = Math.max(1, ...heat);
    const demonHeat = demon ? (g.suspicion[demon.id] ?? 0) / maxHeat : 1;
    return clamp(1.0 * minionDead + 0.4 * demonHeat - 0.8 * goodDead, -1, 1);
  }

  // ───────────── 存档 ─────────────
  toJSON() {
    return {
      journal: this.journal,
      decisions: this.decisions,
      worlds: [...this.worlds.entries()].map(([id, w]) => [id, { demon: w.demon, evil: [...w.evil], roles: [...w.roles.entries()], dream: w.dream }]),
      misCount: [...this.misCount.entries()],
      covers: this.covers,
    };
  }

  load(data) {
    this.journal = data?.journal ?? [];
    this.decisions = data?.decisions ?? [];
    this.worlds = new Map((data?.worlds ?? []).map(([id, w]) => [id, { demon: w.demon, evil: new Set(w.evil), roles: new Map(w.roles), dream: w.dream }]));
    this.misCount = new Map(data?.misCount ?? []);
    this.covers = data?.covers ?? {};
  }

  // ───────────── 开局 ─────────────

  /** 红鲱鱼：一名善良玩家。偏向镇民（被怀疑更有戏剧性），不选占卜师自己。 */
  redHerring() {
    const good = this.g.players.filter((p) => !isEvilRole(p.role));
    const townsfolk = good.filter((p) => ROLES[p.role].team === 'townsfolk' && p.role !== 'fortuneteller');
    const pool = townsfolk.length ? townsfolk : good;
    const p = this.draw('redHerring', pool, () => ({}));
    this.note(`把 ${this.g.name(p.id)}（${ROLES[p.role].name}）定为占卜师的红鲱鱼`);
    return p.id;
  }

  // ───────────── 陌客 / 间谍 ─────────────

  /**
   * 健康的陌客/间谍被检测时，要不要登记成另一个阵营。
   * 两种错误登记都对邪恶有利，所以善良领先时更常发生，邪恶领先时几乎不发生。
   * 同一个人一晚上最多错误登记两次，免得一个人身上压太多误导。
   */
  misregister(p, by) {
    const key = `${this.g.night}:${p.id}`;
    const used = this.misCount.get(key) ?? 0;
    if (used >= 2) return false;
    const b = this.balance();
    const yes = this.roll('misregister', { balance: b }, { who: p.id, b });
    if (yes) {
      this.misCount.set(key, used + 1);
      const as = p.role === 'recluse' ? '邪恶' : '善良';
      this.note(`${by}时，把${ROLES[p.role].name} ${this.g.name(p.id)} 登记成${as}`, b);
    }
    return yes;
  }

  /** 陌客/间谍被看角色时错误登记成什么。 */
  misregRole(p) {
    return this.choose('misregRole', p.role === 'recluse' ? [...MINIONS, 'imp'] : [...TOWNSFOLK, ...OUTSIDERS], { who: p.id });
  }

  // ───────────── 酒鬼 / 中毒：假世界 ─────────────

  why(p) { return p.role === 'drunk' ? `酒鬼（以为是${ROLES[p.shownRole].name}）` : `中毒的${ROLES[p.shownRole].name}`; }

  /**
   * 编一套假世界：恶魔、爪牙换成别人（人数和真的一样），真正的邪恶在这个世界里是好人。
   * 邪恶领先时假世界"掺一点真"——留一个真邪恶在假邪恶里，帮善良一把。
   */
  buildWorld(p) {
    const g = this.g; const rng = this.rng;
    const others = shuffled(g.players.filter((q) => q.id !== p.id), rng);
    const good = others.filter((q) => !isEvilRole(q.role));
    const evil = others.filter((q) => isEvilRole(q.role));
    const nMinions = g.players.filter((q) => ROLES[q.role].team === 'minion').length;
    const b = this.balance();
    const keep = b < -0.15 && evil.length && rng() < 0.5 ? pick(evil, rng) : null;

    let demon = null; const minions = [];
    if (keep?.role === 'imp') demon = keep; else if (keep) minions.push(keep);
    const pool = good.filter((q) => q !== keep);
    if (!demon) demon = pool.shift() ?? keep;
    while (minions.length < nMinions && pool.length) minions.push(pool.shift());

    const roles = new Map();
    const minionRoles = shuffled(MINIONS, rng);
    roles.set(demon.id, 'imp');
    minions.forEach((q, i) => roles.set(q.id, ROLES[q.role].team === 'minion' ? q.role : minionRoles[i % minionRoles.length]));
    // 被"洗白"的真邪恶：给一个场上没有的善良角色
    const inPlay = new Set(g.players.map((q) => q.role));
    const spare = shuffled([...TOWNSFOLK, ...OUTSIDERS].filter((r) => !inPlay.has(r) && r !== 'drunk'), rng);
    for (const q of g.players) {
      if (roles.has(q.id)) continue;
      if (q.id === p.id) roles.set(q.id, p.shownRole);
      else if (isEvilRole(q.role)) roles.set(q.id, spare.pop() ?? 'soldier');
      else roles.set(q.id, q.role === 'drunk' ? q.shownRole : q.role);
    }
    return { demon: demon.id, evil: new Set([demon.id, ...minions.map((q) => q.id)]), roles, keep: keep?.id ?? null, b };
  }

  /**
   * p 看到的假世界。第一次用到时才编；differ(w) 为真表示这套世界里这次的答案和真相不一样，
   * 尽量挑这样的一套（第一条信息一定是假的），之后就固定不变。
   */
  world(p, differ) {
    let w = this.worlds.get(p.id);
    if (w) return w;
    for (let k = 0; k < 40; k++) { w = this.buildWorld(p); if (!differ || differ(w)) break; }
    this.worlds.set(p.id, w);
    this.decide('world', { who: p.id, chosen: { demon: w.demon, evil: [...w.evil] }, b: w.b });
    const g = this.g;
    const minions = [...w.evil].filter((id) => id !== w.demon);
    this.note(`${this.why(p)} ${g.name(p.id)} 的假世界：把 ${g.name(w.demon)} 当成恶魔${minions.length ? `、${minions.map((id) => g.name(id)).join('、')} 当成爪牙` : ''}${w.keep ? `（掺了一个真邪恶 ${g.name(w.keep)}）` : ''}`, w.b);
    return w;
  }

  /** 洗衣妇/图书管理员/调查员：按假世界里的某个镇民/外来者/爪牙给信息；假世界里没有就返回 null。 */
  falsePair(p, team) {
    const g = this.g;
    const others = g.players.filter((q) => q.id !== p.id);
    const fit = (w) => others.filter((q) => ROLES[w.roles.get(q.id)].team === team);
    // 挑一套"指认的人其实不是那个阵营"的假世界
    const w = this.world(p, (cand) => fit(cand).some((q) => ROLES[q.role].team !== team));
    const cands = fit(w);
    if (!cands.length) {
      this.note(`${this.why(p)} ${g.name(p.id)}：按假世界，场上没有${{ townsfolk: '镇民', outsider: '外来者', minion: '爪牙' }[team]}`);
      return null;
    }
    const wrong = cands.filter((q) => ROLES[q.role].team !== team);
    const target = this.choose('falsePair', wrong.length ? wrong : cands, { who: p.id, team });
    const role = w.roles.get(target.id);
    this.note(`${this.why(p)} ${g.name(p.id)}：假信息，指向 ${g.name(target.id)} 是${ROLES[role].name}（真实是${ROLES[target.role].name}）`);
    return { target, role };
  }

  /** 厨师：假世界里相邻的邪恶有几对。 */
  fakeChef(p, truth) {
    const g = this.g; const n = g.players.length;
    const count = (w) => g.players.reduce((k, q, i) => k + (w.evil.has(q.id) && w.evil.has(g.players[(i + 1) % n].id) ? 1 : 0), 0);
    const v = count(this.world(p, (w) => count(w) !== truth));
    this.decide('fakeChef', { who: p.id, options: upTo(g.players.filter((q) => isEvilRole(q.role)).length), chosen: v, truth });
    this.note(`${this.why(p)} ${g.name(p.id)}：按假世界报 ${v} 对（真实是 ${truth}）`);
    return v;
  }

  /** 共情者：假世界里两侧存活邻座有几个邪恶。 */
  fakeEmpath(p, truth) {
    const g = this.g;
    const count = (w) => g.aliveNeighbours(p).filter((q) => w.evil.has(q.id)).length;
    const v = count(this.world(p, (w) => count(w) !== truth));
    this.decide('fakeEmpath', { who: p.id, options: upTo(g.aliveNeighbours(p).length), chosen: v, truth });
    this.note(`${this.why(p)} ${g.name(p.id)}：按假世界报 ${v} 个（真实是 ${truth}）`);
    return v;
  }

  /** 占卜师：假世界里选中的两人有没有恶魔。 */
  fakeFortune(p, a, b, truth) {
    const g = this.g;
    const yes = (w) => w.demon === a.id || w.demon === b.id;
    const v = yes(this.world(p, (w) => yes(w) !== truth));
    this.decide('fakeFortune', { who: p.id, options: [true, false], chosen: v, truth, about: [a.id, b.id] });
    this.note(`${this.why(p)} ${g.name(p.id)}：按假世界答「${v ? '有' : '没有'}」（真实是「${truth ? '有' : '没有'}」）`);
    return v;
  }

  /** 送葬者/守鸦人：假世界里这个人的角色。 */
  falseRole(p, target) {
    const g = this.g;
    const r = this.world(p, (w) => w.roles.get(target.id) !== target.role).roles.get(target.id);
    this.decide('falseRole', { who: p.id, about: target.id, chosen: r, truth: target.role });
    this.note(`${this.why(p)} ${g.name(p.id)}：按假世界把 ${g.name(target.id)} 说成${ROLES[r].name}（真实是${ROLES[target.role].name}）`);
    return r;
  }

  // ───────────── 镇长 / 传位 ─────────────

  /** 镇长夜里被刀：替不替死、替给谁。替死保护了镇长（帮善良），所以善良领先时少替。 */
  mayorBounce(mayor, candidates) {
    const b = this.balance();
    if (!candidates.length || !this.roll('mayorBounce', { balance: b }, { who: mayor.id, b })) {
      this.note(`恶魔刀了镇长 ${this.g.name(mayor.id)}，没有替死`, b);
      return null;
    }
    // 邪恶明显领先时，偶尔让爪牙替死（大幅帮善良）；否则替给一名善良玩家
    const minions = candidates.filter((q) => ROLES[q.role].team === 'minion');
    const good = candidates.filter((q) => !isEvilRole(q.role));
    const fair = (q) => ({ hits: this.hits(q.id) });
    const victim = b < -0.4 && minions.length && this.roll('mayorBounceMinion', { balance: b }, { b }) ? this.draw('mayorVictim', minions, fair, { b }) : this.draw('mayorVictim', good.length ? good : candidates, fair, { b });
    this.note(`恶魔刀了镇长 ${this.g.name(mayor.id)}，由 ${this.g.name(victim.id)} 替死`, b);
    return victim;
  }

  /** 小恶魔自刀且红唇女郎接不了：被怀疑越少的爪牙越容易接任（对邪恶最有利，也最有戏）。 */
  starpassHeir(minions) {
    const g = this.g;
    const heat = (q) => g.suspicion[q.id] ?? 0;
    const top = Math.max(1, ...minions.map(heat));
    const heir = this.draw('starpassHeir', minions, (q) => ({ heat: heat(q) / top }));
    this.note(`小恶魔自刀，${g.name(heir.id)} 接任恶魔`);
    return heir;
  }

  // ───────────── 黯月初升：说书人要做的选择 ─────────────
  // 原则：规则允许的范围里，往落后的一方偏一点；不要用能力直接定胜负。

  /**
   * 房规"夜里死了仍拿信息"：这条信息按醉酒处理，给真的还是假的。善良领先时多给假的，邪恶领先时多给真的（大约 25%–75%）。
   * 同一个人同一晚只判一次。
   */
  deadLies(p) {
    const done = this.decisions.find((d) => d.kind === 'deadLies' && d.night === this.g.night && d.who === p.id);
    if (done) return done.chosen;
    const b = this.balance();
    const lie = this.roll('deadLies', { balance: b }, { who: p.id, b });
    this.note(`夜里死了仍拿信息（醉酒）：${this.g.name(p.id)} 这次给${lie ? '假' : '真'}信息`, b);
    return lie;
  }

  /** 和平主义者：被处决的善良玩家要不要活下来。邪恶领先时更常救；每局别救太多次。 */
  pacifistSaves(p) {
    const b = this.balance();
    const save = this.roll('pacifist', { balance: b, used: this.times('pacifist') }, { who: p.id, b });
    this.note(`和平主义者：被处决的善良玩家 ${this.g.name(p.id)} ${save ? "活了下来" : "照常死亡"}`, b);
    return save;
  }

  /** 水手选了人：谁醉酒。惯例：选了镇民就让镇民醉，选了外来者/邪恶就让水手自己醉。 */
  sailorDrunk(sailor, target) {
    const who = ROLES[target.role].team === "townsfolk" ? target : sailor;
    this.note(`水手 ${this.g.name(sailor.id)} 选了 ${this.g.name(target.id)}，${who === sailor ? "水手自己" : "对方"}醉酒`);
    return who;
  }

  /** 旅店老板保护的两人里谁醉酒：通常是更需要准确信息/能力的善良玩家。 */
  innkeeperDrunk(pair) {
    const g = this.g;
    const good = pair.filter((q) => !g.evilOf(q));
    const who = this.draw('innkeeperDrunk', good.length ? good : pair, (q) => ({ hits: this.hits(q.id) }));
    this.note(`旅店老板保护了 ${pair.map((q) => g.name(q.id)).join("、")}，让 ${g.name(who.id)} 醉酒`);
    return who;
  }

  /** 沙巴洛斯反刍：偶尔（每局一两次）把上一夜吃掉的人吐回来，通常是善良玩家；邪恶领先时更常发生。 */
  /** 醉酒中毒的教父首夜：给一份假的"在场外来者"名单（随机换一两个，有时说没有）。 */
  fakeOutsidersBMR(p, truthNames) { // eslint-disable-line no-unused-vars
    const all = rolesOf(this.g.script ?? 'bmr', 'outsider'); // 只从这个剧本的外来者里编，报出剧本外的角色等于露馅
    const n = Math.max(0, Math.min(all.length, truthNames.length + (this.rng() < 0.5 ? 1 : -1)));
    const said = [...all].sort(() => this.rng() - 0.5).slice(0, n);
    this.decide('fakeOutsiders', { who: p.id, options: all, chosen: said, truth: truthNames });
    return said;
  }

  shabaRegurgitate(cands) {
    if (!cands.length) return null;
    const b = this.balance();
    if (this.times('shabalothBack') >= 2 || !this.roll('shabaloth', { balance: b }, { b })) return null;
    const good = cands.filter((q) => !this.g.evilOf(q));
    const back = this.choose('shabalothBack', good.length ? good : cands, { b });
    this.note(`沙巴洛斯反刍了 ${this.g.name(back.id)}`, b);
    return back;
  }

  /** 造谣者的声明为真：选一个能死的人。善良领先时多杀善良，邪恶领先时偶尔杀邪恶。 */
  gossipVictim() {
    const g = this.g;
    const shared = g.engine === 'snv'; // 通用引擎的免死和弄臣记法不一样
    const can = g.alive().filter((q) => !q.apparentDead && !(shared ? g.safeFrom(q, 'gossip') || g.bmrProtection(q, 'gossip') : g.protection(q, "gossip")) && !(q.role === "fool" && !g.used[shared ? `fool-${q.id}` : q.id]));
    if (!can.length) return null;
    const b = this.balance();
    // 新手照顾：说书人自己挑谁死的时候，能不挑新手就不挑
    const easy = (list) => { const vet = list.filter((q) => !g.newbies?.includes(q.id)); return vet.length ? vet : list; };
    const evil = easy(can.filter((q) => g.evilOf(q) && ROLES[q.role].team !== "demon"));
    const good = easy(can.filter((q) => !g.evilOf(q) && q.role !== "gossip"));
    const fair = (q) => ({ hits: this.hits(q.id) });
    const v = b < -0.3 && evil.length && this.roll('gossipEvil', { balance: b }, { b }) ? this.draw('gossipVictim', evil, fair, { b }) : this.draw('gossipVictim', good.length ? good : can, fair, { b });
    this.note(`造谣者的声明为真，说书人选 ${g.name(v.id)} 死亡`, b);
    return v;
  }

  /** 修补匠：随时可能死。善良领先时更容易死；剩的人少时绝不让他的死结束游戏。 */
  tinkerDies(p) {
    const g = this.g;
    if (g.aliveCount() <= 4) return false;
    const b = this.balance();
    const die = this.roll('tinker', { balance: b }, { who: p.id, b });
    if (die) this.note(`修补匠 ${g.name(p.id)} 突然死亡`, b);
    return die;
  }

  /** 祖母的孙子：一名善良玩家（不是她自己）。 */
  chooseGrandchild(gm) {
    const g = this.g;
    const good = g.players.filter((q) => q.id !== gm.id && !g.evilOf(q));
    const gc = this.choose('grandchild', good);
    if (gc) this.note(`祖母 ${g.name(gm.id)} 的孙子是 ${g.name(gc.id)}（${ROLES[gc.role].name}）`);
    return gc;
  }

  /** 失效的祖母：给一个错的角色（另一个本剧本的善良角色）。 */
  falseRoleBMR(p, target) {
    const pool = Object.keys(ROLES).filter((r) => ROLES[r].script === "bmr" && ["townsfolk", "outsider"].includes(ROLES[r].team) && r !== target.role);
    const r = this.choose('falseRoleBMR', pool, { who: p.id, about: target.id, truth: target.role });
    this.note(`失效的 ${ROLES[p.role].name} ${this.g.name(p.id)}：把 ${this.g.name(target.id)} 说成${ROLES[r].name}`);
    return r;
  }

  // ───────────── 梦殒春宵：说书人要做的选择 ─────────────

  /**
   * 梦殒春宵的假世界：和暗流涌动一样，失效的人每晚按同一套假世界回答，前后对得上。
   * 涡流在场时所有镇民共用一套（key 'vortox'），大家的错信息互相印证，比各编各的更难识破。
   * differ(w) 为真表示这套世界里这次的答案和真相不一样，第一条信息尽量是假的。
   */
  snvWorld(p, mode, differ) {
    const key = mode === 'must' ? 'vortox' : p.id;
    let w = this.worlds.get(key);
    if (w) return w;
    for (let k = 0; k < 40; k++) { w = this.buildSnvWorld(p); if (!differ || differ(w)) break; }
    this.worlds.set(key, w);
    this.decide('world', { who: key, chosen: { demon: w.demon, evil: [...w.evil] }, mode, b: w.b });
    const g = this.g;
    const others = [...w.evil].filter((id) => id !== w.demon);
    this.note(`${mode === 'must' ? '涡流下镇民共用' : `失效的 ${g.name(p.id)} 用`}的假世界：把 ${g.name(w.demon)} 当成恶魔${others.length ? `、${others.map((id) => g.name(id)).join('、')} 当成爪牙` : ''}`, w.b);
    return w;
  }

  /**
   * 人数和真的一样；邪恶领先时掺一个真邪恶帮善良一把。
   * 真邪恶在这个世界里是好人，假邪恶就挑能帮他们圆谎的人：和邪恶公开声明撞了身份的真好人排最前（谁是假的一目了然地指向他），
   * 然后是活人、已经有人怀疑的人。语音里说的身份这里看不到，只算公开声明。
   */
  buildSnvWorld(p) {
    const g = this.g; const rng = this.rng;
    const others = shuffled(g.players.filter((q) => q.id !== p.id), rng);
    const size = g.players.filter((q) => g.evilOf(q)).length;
    const b = this.balance();
    const real = others.filter((q) => g.evilOf(q));
    const keep = b < -0.15 && real.length && rng() < 0.5 ? pick(real, rng) : null;
    const taken = new Set(real.map((q) => g.claims?.[q.id]).filter(Boolean));
    const rank = (q) => (taken.has(q.role) ? 4 : 0) + (q.alive ? 2 : 0) + ((g.suspicion[q.id] ?? 0) > 0 ? 1 : 0);
    const pool = others.filter((q) => !g.evilOf(q)).sort((x, y) => rank(y) - rank(x));
    const demon = keep && ROLES[keep.role].team === 'demon' ? keep : pool.shift() ?? keep ?? others[0];
    const evil = new Set([demon.id]);
    if (keep) evil.add(keep.id);
    for (const q of pool) { if (evil.size >= size) break; evil.add(q.id); }
    return { demon: demon.id, evil, roles: new Map(), b };
  }

  /** 假数字：和真的不一样，尽量只差一点（差太多一眼就能看穿）。数学家通常是 0 或 1（官方给伪装者的建议，借来用）。 */
  fakeNumber(p, truth, { min = 0, max = 15 } = {}) {
    const small = p.role === 'mathematician' ? [0, 1].filter((n) => n !== truth && n >= min && n <= max) : [];
    const near = small.length ? small : [truth - 1, truth + 1].filter((n) => n >= min && n <= max);
    const pool = near.length ? near : [min, max].filter((n) => n !== truth);
    const v = pool.length ? this.choose('fakeNumber', pool, { who: p.id, truth }) : truth;
    this.note(`失效的 ${ROLES[p.role].name} ${this.g.name(p.id)}：真实 ${truth}，告诉他 ${v}`);
    return v;
  }

  /** 镜像双子的对立双子：对立阵营的一人，优先活着的镇民。 */
  twinFor(a) {
    const g = this.g;
    const opp = g.players.filter((q) => q.id !== a.id && g.evilOf(q) !== g.evilOf(a));
    const alive = opp.filter((q) => q.alive);
    const list = alive.length ? alive : opp;
    const tf = list.filter((q) => ROLES[q.role].team === 'townsfolk');
    return tf.length ? this.choose('twin', tf, { who: a.id }) : list.length ? this.choose('twin', list, { who: a.id }) : null;
  }

  /**
   * 亡骨魔杀了爪牙：毒他哪一侧最近的镇民（官方：说书人选）。挑还活着的那一侧（毒死人没意思）；
   * 两边都活着时往落后的一方偏：善良领先多半毒拿信息的，邪恶领先多半毒不拿信息的。
   */
  vigSide(minion) {
    const g = this.g;
    const b = this.balance();
    const live = [1, -1].filter((dir) => g.nearestTownsfolk(minion, dir)?.alive);
    const info = live.filter((dir) => SNV_INFO.has(g.nearestTownsfolk(minion, dir).role));
    return this.draw('vigSide', live.length ? live : [1, -1], (dir) => ({ pressure: info.includes(dir) ? b : -b }), { who: minion.id, b });
  }

  /** 心上人死亡：谁醉酒。通常是善良的镇民；邪恶领先时偶尔醉到恶魔或爪牙。 */
  sweetheartDrunk(sw) {
    const g = this.g;
    const b = this.balance();
    const others = g.players.filter((q) => q.id !== sw.id && q.alive);
    const evil = others.filter((q) => g.evilOf(q));
    const tf = others.filter((q) => !g.evilOf(q) && ROLES[q.role].team === 'townsfolk');
    const fair = (q) => ({ hits: this.hits(q.id) });
    const v = b < -0.3 && evil.length && this.roll('sweetheartEvil', { balance: b }, { b }) ? this.draw('sweetheartDrunk', evil, fair, { b }) : this.draw('sweetheartDrunk', tf.length ? tf : others, fair, { b });
    if (v) this.note(`心上人死亡，${g.name(v.id)} 从此醉酒`, b);
    return v ?? null;
  }

  /** 理发师：有几个恶魔时选哪个来换。 */
  barberDemon(demons) { return demons.length ? this.choose('barberDemon', demons) : null; }

  /** 贤者得知的两个人：lie 时两个都不是恶魔，有假世界就指假世界的恶魔。前期指活人（给邪恶留机会），最后一夜可以指死人。 */
  sagePair(sage, demon, lie, w = null) {
    const g = this.g;
    const fake = g.players.filter((q) => q.id !== sage.id && ROLES[q.role].team !== 'demon');
    const live = fake.filter((q) => q.alive);
    const pool = live.length >= 2 ? live : fake;
    if (lie) {
      const fakeDemon = pool.find((q) => q.id === w?.demon);
      const rest = shuffled(pool.filter((q) => q !== fakeDemon), this.rng);
      const two = shuffled((fakeDemon ? [fakeDemon, ...rest] : rest).slice(0, 2), this.rng);
      this.decide('sagePair', { who: sage.id, options: pool.map(idOf), chosen: two.map(idOf), truth: demon?.id });
      return two;
    }
    const other = this.choose('sageOther', pool.filter((q) => q.id !== demon.id), { who: sage.id });
    return shuffled([demon, other], this.rng);
  }

  /**
   * 筑梦师看邪恶玩家时，善良那一项展示他的伪装（官方：帮邪恶就这么给）：公开声明过的优先，其次恶魔拿到的不在场角色。
   * 邪恶明显领先时不帮，随机给。同一个人每晚一样。
   */
  coverOf(t) {
    const g = this.g;
    if (this.covers[t.id]) return this.covers[t.id];
    if (this.balance() < -0.15) return null;
    const good = (r) => !!ROLES[r] && inScript(r, g.script) && ['townsfolk', 'outsider'].includes(ROLES[r].team) && r !== t.role;
    const said = g.claims?.[t.id];
    const cover = good(said) ? said : this.choose('dreamerCover', (g.bluffs ?? []).filter(good), { who: t.id }) ?? null;
    if (cover) this.covers[t.id] = cover;
    return cover;
  }

  /** 筑梦师看到的 [善良角色, 邪恶角色]。邪恶那一项几乎都用在场爪牙。lie 时两个都错，同一套假世界里同一个人每晚答案一样。不会给涡流（涡流在场时必须都错，给了就等于说破）。 */
  dreamerRoles(t, lie, w = null) {
    const g = this.g;
    const said = w?.dream?.[t.id];
    if (lie && said && !said.includes(t.role)) return said; // 这人的角色变成了当时的假答案：不能再说，重编
    const hide = g.vortoxOn(); // 涡流真在起作用时才不给：平时也不给，就等于一听到涡流就是真的
    const all = (teams) => rolesOf(g.script).filter((r) => teams.includes(ROLES[r].team) && r !== t.role && !(hide && r === 'vortox'));
    const trueGood = ['townsfolk', 'outsider'].includes(ROLES[t.role].team);
    const inPlay = new Set(g.players.map((q) => q.role));
    const evilPool = all(['minion', 'demon']);
    const live = evilPool.filter((r) => inPlay.has(r));
    const seen = live.filter((r) => ROLES[r].team === 'minion').length ? live.filter((r) => ROLES[r].team === 'minion') : live; // 给在场的角色才迷惑得了人
    const fakeEvil = this.choose('dreamerEvil', seen.length && this.roll('dreamerSeen', {}, { who: t.id }) ? seen : evilPool, { who: t.id, truth: t.role, lie: !!lie });
    const cover = !lie && !trueGood ? this.coverOf(t) : null;
    const fakeGood = cover ?? this.choose('dreamerGood', all(['townsfolk', 'outsider']), { who: t.id, truth: t.role, lie: !!lie });
    if (lie) {
      if (w) (w.dream ??= {})[t.id] = [fakeGood, fakeEvil];
      return [fakeGood, fakeEvil];
    }
    return trueGood ? [t.role, fakeEvil] : [fakeGood, t.role];
  }

  /** 麻脸巫婆造出恶魔，当晚的死亡怎么安排（官方给的建议）。 */
  pitPlan(t, wasDemon, old) {
    const g = this.g;
    if (!t.alive) { this.note(`麻脸巫婆把死人变成了${ROLES[t.role].name}：死人不杀人，今晚照常`); return { suppress: false, kill: [] }; }
    if (wasDemon) { this.note(`麻脸巫婆把恶魔换成了${ROLES[t.role].name}：今晚没有人死，提示大家恶魔变了`); return { suppress: true, kill: [] }; }
    if (g.evilOf(t)) { this.note(`麻脸巫婆造出了邪恶的${ROLES[t.role].name}：老恶魔今晚死亡`); return { suppress: false, kill: old }; }
    if (g.aliveCount() <= 4) { this.note(`麻脸巫婆造出了善良的${ROLES[t.role].name}，已是最后几夜：让它死去，只留一个恶魔`); return { suppress: false, kill: [t] }; }
    this.note(`麻脸巫婆造出了善良的${ROLES[t.role].name}：两个恶魔一起杀人`);
    return { suppress: false, kill: [] };
  }

  /** 处决这个人会不会当场定胜负：疯狂的处决是"可能"，官方说可以放过，别让这种判定决定一局。 */
  decidesGame(p) {
    const g = this.g;
    if (!p.alive) return p.id === g.twinGoodId(); // 处决死人不改变存活人数，只有善良的双子还能定胜负
    const lastBlock = g.twinBlocks() && [g.twin.a, g.twin.b].includes(p.id) && !g.alive().some((q) => ROLES[q.role].team === 'demon'); // 恶魔已死，就差双子挡着善良赢
    return p.id === g.twinGoodId() || ROLES[p.role].team === 'demon' || g.aliveCount() <= 3 || lastBlock;
  }

  /** 畸形秀演员声称自己是外来者：要不要处决。"可能"被处决：大多会罚，新手宽一点；会直接定胜负的不罚。how：{ voice: true } 是语音转写听到的。 */
  mutantExecuted(p, how = {}) {
    const g = this.g;
    if (this.decidesGame(p)) {
      this.decide('mutant', { who: p.id, options: [false], chosen: false, prob: 1, forced: 'decidesGame' });
      this.note(`畸形秀演员 ${g.name(p.id)} 声称自己是外来者，但处决他会直接定胜负：放过`);
      return false;
    }
    const yes = this.roll('mutant', how, { who: p.id });
    this.note(`畸形秀演员 ${g.name(p.id)} 声称自己是外来者：${yes ? '处决' : '放过'}`);
    return yes;
  }

  /** 被洗脑的人没有声明：要不要罚。邪恶的少罚（官方：别让邪恶靠这个获胜），新手也少罚；会直接定胜负的不罚。how：依据是什么，见 dice.js 的 madness。 */
  madnessPenalty(p, how = {}) {
    const g = this.g;
    if (this.decidesGame(p)) {
      this.decide('madness', { who: p.id, options: [false], chosen: false, prob: 1, forced: 'decidesGame' });
      this.note(`${g.name(p.id)} 没有疯狂证明，但处决他会直接定胜负：放过`);
      return false;
    }
    const yes = this.roll('madness', { ...how, evil: g.evilOf(p) }, { who: p.id });
    this.note(`${g.name(p.id)} 今天没有疯狂证明：${yes ? '处决' : '放过'}`);
    return yes;
  }

  /** 博学者的两条信息：从真实局面算出来，保证真的就是真的、假的就是假的。 */
  savantFacts() {
    const g = this.g; const rng = this.rng;
    const ps = g.players; const n = ps.length;
    const evilIn = (list) => list.filter((q) => g.evilOf(q)).length;
    const num = (v, lo, hi) => { const o = [v - 1, v + 1].filter((x) => x >= lo && x <= hi); return o.length ? pick(o, rng) : v + 1; };
    const two = shuffled(ps, rng).slice(0, 2);
    const one = pick(ps, rng);
    const demons = ps.filter((q) => ROLES[q.role].team === 'demon');
    const dead = ps.filter((q) => !q.alive);
    const alive = ps.filter((q) => q.alive);
    const outs = ps.filter((q) => ROLES[q.role].team === 'outsider').length;
    const pool = rolesOf(g.script);
    const absent = pool.filter((r) => !ps.some((q) => q.role === r));
    const present = pool.filter((r) => ps.some((q) => q.role === r) && ROLES[r].team !== 'demon');
    const half = Math.floor(n / 2);
    const lo = 1 + Math.floor(rng() * n);
    const seats = Array.from({ length: half }, (_, k) => ((lo + k - 1) % n) + 1);
    const demonIn = demons.some((q) => seats.includes(q.seat));
    let pairs = 0;
    for (let i = 0; i < n; i++) if (g.evilOf(ps[i]) && g.evilOf(ps[(i + 1) % n])) pairs++;
    const same = g.evilOf(two[0]) === g.evilOf(two[1]);
    const facts = [
      { t: `场上有 ${outs} 名外来者`, f: `场上有 ${num(outs, 0, n)} 名外来者` },
      { t: `死亡的玩家里有 ${evilIn(dead)} 名邪恶`, f: `死亡的玩家里有 ${num(evilIn(dead), 0, n)} 名邪恶` },
      { t: `存活的玩家里有 ${evilIn(alive)} 名邪恶`, f: `存活的玩家里有 ${num(evilIn(alive), 0, n)} 名邪恶` },
      { t: `相邻而坐的邪恶玩家有 ${pairs} 对`, f: `相邻而坐的邪恶玩家有 ${num(pairs, 0, n)} 对` },
      { t: `${g.name(two[0].id)} 和 ${g.name(two[1].id)} ${same ? '是' : '不是'}同一阵营`, f: `${g.name(two[0].id)} 和 ${g.name(two[1].id)} ${same ? '不是' : '是'}同一阵营` },
      { t: `恶魔${demonIn ? '在' : '不在'} ${seats[0]} 号到 ${seats.at(-1)} 号之间`, f: `恶魔${demonIn ? '不在' : '在'} ${seats[0]} 号到 ${seats.at(-1)} 号之间` },
      { t: `${g.name(one.id)} 是${g.evilOf(one) ? '邪恶' : '善良'}的`, f: `${g.name(one.id)} 是${g.evilOf(one) ? '善良' : '邪恶'}的` },
    ];
    if (absent.length && present.length) facts.push({ t: `场上有${ROLES[pick(present, rng)].name}`, f: `场上有${ROLES[pick(absent, rng)].name}` });
    return shuffled(facts, rng);
  }

  /** lie：null 一真一假；'must' 两条都假（涡流）；'fake' 两真或两假（醉酒中毒）。 */
  savantLines(p, lie) {
    const [a, b] = this.savantFacts();
    const lines = lie === 'must' ? [a.f, b.f] : lie === 'fake' ? (this.roll('savantTrue', {}, { who: p.id }) ? [a.t, b.t] : [a.f, b.f]) : [a.t, b.f];
    this.decide('savant', { who: p.id, options: [a.t, a.f, b.t, b.f], chosen: lines, lie });
    this.note(`博学者 ${this.g.name(p.id)}：${lie ? `失效，给了${lie === 'must' || lines[0] === a.f ? '两条假' : '两条真'}` : `真：${a.t}；假：${b.f}`}`);
    return shuffled(lines, this.rng);
  }

  // ───────────── 两个小剧本（无上愉悦、窃窃私语）：说书人要做的选择 ─────────────

  /** 寡妇下毒以后，哪个善良玩家得知寡妇在场：活着的善良玩家里随便一个（官方：任意一名善良玩家）。 */
  widowWitness(widow) {
    const g = this.g;
    const good = g.players.filter((q) => q.id !== widow.id && !g.evilOf(q));
    const live = good.filter((q) => q.alive);
    return (live.length ? this.choose('widowWitness', live) : good.length ? this.choose('widowWitness', good) : null) ?? null;
  }

  /**
   * 调查员（用梦殒春宵那套假世界）：真的就是一名真爪牙和他的角色；lie 时按假世界把一个"假爪牙"指给他，角色从剧本的爪牙里挑。
   * 返回 { pair: [两名玩家（顺序打乱）], role } 或 null（场上没有爪牙）。
   */
  minionPair(p, lie) {
    const g = this.g;
    const others = g.players.filter((q) => q.id !== p.id);
    const minionRoles = rolesOf(g.script, 'minion');
    let target; let role;
    if (lie) {
      const w = this.snvWorld(p, lie, (x) => [...x.evil].some((id) => id !== x.demon && ROLES[g.get(id).role].team !== 'minion'));
      const fake = others.filter((q) => w.evil.has(q.id) && q.id !== w.demon);
      target = fake.length ? this.choose('pairTarget', fake, { who: p.id, lie }) : this.choose('pairTarget', others.filter((q) => ROLES[q.role].team !== 'minion'), { who: p.id, lie });
      if (!target) return null;
      role = (w.pairRole ??= {})[p.id] ?? this.choose('pairRole', minionRoles, { who: p.id });
      w.pairRole[p.id] = role;
      g.flag(p, `调查员看到了假的爪牙 ${g.name(target.id)}`);
    } else {
      const real = others.filter((q) => (q.role === 'spy' ? !g.misregSNV(q, '调查员') : ROLES[q.role].team === 'minion' || (q.role === 'recluse' && g.misregSNV(q, '调查员'))));
      if (!real.length) return null;
      target = this.choose('pairTarget', real, { who: p.id });
      role = ROLES[target.role].team === 'minion' ? target.role : this.choose('pairRole', minionRoles, { who: p.id });
    }
    const decoy = this.choose('pairDecoy', others.filter((q) => q.id !== target.id), { who: p.id });
    return { pair: shuffled([target, decoy], this.rng), role };
  }

  /**
   * 气球驾驶员今晚看谁：和上一晚看到的人类型不同（首夜随便），活人死人都行。
   * 失效时随便给，多半给同一类型的人（这样他的信息链就断了）。前期多指活人：有话可聊。
   */
  balloonPick(p, last, lie) {
    const g = this.g;
    const others = g.players.filter((q) => q.id !== p.id);
    const type = (q) => ROLES[q.role].team;
    const live = (list) => { const a = list.filter((q) => q.alive); return a.length ? a : list; };
    if (lie && last) {
      const same = others.filter((q) => type(q) === last);
      if (same.length && this.roll('balloonSame', {}, { who: p.id })) { g.flag(p, '气球驾驶员看到了和上一晚同类型的人'); return this.choose('balloon', live(same), { who: p.id, lie }); }
    }
    const pool = last ? others.filter((q) => type(q) !== last) : others;
    return pool.length ? this.choose('balloon', live(pool), { who: p.id, lie: !!lie }) : null;
  }

  /**
   * 渔夫的建议（没有大模型时用）：让他去做一件事，不是告诉他一条事实（官方建议）。
   * 健康：善良落后就给能直接帮到忙的（处决某个邪恶、保住某个说真话的人），领先就给模糊一点的；失效时给坏建议。
   */
  fishermanAdvice(p, lie) {
    const g = this.g;
    const alive = g.players.filter((q) => q.alive && q.id !== p.id);
    const evil = alive.filter((q) => g.evilOf(q));
    const good = alive.filter((q) => !g.evilOf(q));
    const b = this.balance();
    const name = (q) => g.name(q.id);
    let text;
    if (lie && good.length) text = `处决 ${name(this.choose('fishBad', good, { who: p.id }))}。`;
    else if (!evil.length || !good.length) text = '相信你自己的判断，不要被别人带着走。';
    else if (b < 0 && this.roll('fishStrong', { balance: b }, { who: p.id })) {
      const demon = evil.find((q) => ROLES[q.role].team === 'demon');
      text = demon ? `别让 ${name(demon)} 活过明天。` : `盯紧 ${name(this.choose('fishEvil', evil, { who: p.id }))}。`;
    } else text = this.choose('fishSoft', ['trust', 'outsider'], { who: p.id }) === 'trust' ? `相信 ${name(this.choose('fishTrust', good, { who: p.id }))}。` : '今天别急着处决声称自己是外来者的人。';
    this.note(`渔夫 ${g.name(p.id)} 的建议${lie ? '（失效，给了坏建议）' : ''}：${text}`, b);
    return text;
  }

  // ───────────── 通用引擎里的暗流涌动角色、七步成诗的新角色 ─────────────

  /**
   * 洗衣妇（townsfolk）/ 图书管理员（outsider）：两人之一是某个角色。真的照登记算（间谍可能登记成镇民、外来者）；
   * lie 时指一个不是这一类的人，角色从剧本里挑（同一个人每晚一样）；失效的图书管理员有时被告知「没有外来者」。
   */
  teamPairSNV(p, kind, lie) {
    const g = this.g;
    const others = g.players.filter((q) => q.id !== p.id);
    const by = ROLES[g.abilityOf(p)]?.name ?? '检测';
    const pool = rolesOf(g.script, kind);
    let target; let role;
    if (lie) {
      if (kind === 'outsider' && others.some((q) => ROLES[q.role].team === 'outsider') && this.roll('librarianNone', {}, { who: p.id })) {
        g.flag(p, '图书管理员被告知没有外来者（其实有）');
        return null;
      }
      const wrong = others.filter((q) => ROLES[q.role].team !== kind);
      target = this.choose('pairTarget', wrong.length ? wrong : others, { who: p.id, lie });
      const w = this.snvWorld(p, lie);
      const key = `${kind}-${p.id}`;
      role = (w.pairRole ??= {})[key] ?? this.choose('pairRole', pool.filter((r) => r !== target.role), { who: p.id });
      w.pairRole[key] = role;
      g.flag(p, `${by}看到了假的${kind === 'outsider' ? '外来者' : '镇民'} ${g.name(target.id)}`);
    } else {
      const real = others.filter((q) => (kind === 'townsfolk' ? g.seenTownsfolk(q, by) : ROLES[q.role].team === 'outsider' || (q.role === 'spy' && g.misregSNV(q, by))));
      if (!real.length) return null;
      target = this.choose('pairTarget', real, { who: p.id });
      role = ROLES[target.role].team === kind ? target.role : this.choose('pairRole', pool, { who: p.id });
    }
    const decoy = this.choose('pairDecoy', others.filter((q) => q.id !== target.id), { who: p.id });
    return { pair: shuffled([target, decoy], this.rng), role };
  }

  /** 送葬者/守鸦人失效：按假世界说一个角色（假恶魔说成恶魔，假爪牙说成爪牙，其余说成善良角色），不说真的。 */
  falseRoleSNV(p, target, w) {
    const g = this.g;
    const kind = w?.demon === target.id ? ['demon'] : w?.evil.has(target.id) ? ['minion'] : ['townsfolk', 'outsider'];
    const pool = rolesOf(g.script).filter((r) => kind.includes(ROLES[r].team) && r !== target.role);
    const r = this.choose('falseRole', pool.length ? pool : rolesOf(g.script).filter((x) => x !== target.role), { who: p.id, about: target.id, truth: target.role });
    g.flag(p, `看到了错误的角色（真实是${ROLES[target.role].name}）`);
    return r;
  }

  /** 贵族的三个人：恰好一个邪恶。lie 时按假世界（一个假邪恶两个假好人）。前期多指活人。 */
  nobleTrio(p, lie) {
    const g = this.g;
    const others = g.players.filter((q) => q.id !== p.id);
    const live = (list) => { const a = list.filter((q) => q.alive); return a.length ? a : list; };
    let evil; let good;
    if (lie) {
      const w = this.snvWorld(p, lie, (x) => others.some((q) => x.evil.has(q.id) && !g.evilOf(q)));
      evil = others.filter((q) => w.evil.has(q.id));
      good = others.filter((q) => !w.evil.has(q.id));
      g.flag(p, '贵族得到了假的三个人');
    } else {
      const seen = new Map(others.map((q) => [q.id, g.seenEvil(q, '贵族')]));
      evil = others.filter((q) => seen.get(q.id));
      good = others.filter((q) => !seen.get(q.id));
    }
    if (!evil.length || good.length < 2) return null;
    const e = this.choose('nobleEvil', live(evil), { who: p.id, lie: !!lie });
    const gs = shuffled(live(good), this.rng).slice(0, 2);
    if (gs.length < 2) gs.push(...shuffled(good.filter((q) => !gs.includes(q)), this.rng).slice(0, 2 - gs.length));
    this.decide('nobleGood', { who: p.id, options: good.map(idOf), chosen: gs.map(idOf) });
    return shuffled([e, ...gs], this.rng);
  }

  /** 修行者：最近的邪恶玩家在顺时针（+1）还是逆时针（-1）。一样近时说书人定（往落后的一方偏：善良落后就指对的那一边……两边都对，随机）。 */
  shugenjaSide(p, lie) {
    const g = this.g; const n = g.players.length;
    const isEvil = lie ? ((w) => (q) => w.evil.has(q.id))(this.snvWorld(p, lie)) : (q) => g.seenEvil(q, '修行者');
    const dist = (dir) => { for (let k = 1; k < n; k++) { const q = g.players[(p.seat - 1 + dir * k + n * k) % n]; if (q.id !== p.id && isEvil(q)) return k; } return Infinity; };
    const cw = dist(1); const ccw = dist(-1);
    const side = cw === ccw ? this.choose('shugenjaTie', [1, -1], { who: p.id }) : cw < ccw ? 1 : -1;
    if (lie) g.flag(p, '修行者按假世界得到了方向');
    return side;
  }

  /** 农夫夜里死了，谁接班：存活的善良玩家（新手稍微优先：多一个有能力的人）。 */
  farmerHeir(farmer) {
    const g = this.g;
    const good = g.players.filter((q) => q.alive && q.id !== farmer.id && !g.evilOf(q));
    if (!good.length) return null;
    const who = this.draw('farmerHeir', good, () => ({}));
    this.note(`农夫 ${g.name(farmer.id)} 夜里死了，${g.name(who.id)} 变成农夫`);
    return who;
  }

  /**
   * 鹰身女妖的疯狂没做到：杀不杀、杀谁。"可能"死亡：多半杀疯狂的那个；善良领先时偶尔两个都杀。
   * 会直接定胜负的不杀（和疯狂处决一样，别让这种判定决定一局）。返回要死的人（活人）。
   */
  harpyVictims(mad, second) {
    const g = this.g;
    const live = [mad, second].filter((q) => q?.alive);
    if (!live.length) return [];
    if (live.some((q) => this.decidesGame(q)) && g.aliveCount() <= 4) { this.note(`${g.name(mad.id)} 没有疯狂地证明，但现在杀人可能直接定胜负：放过`); return []; }
    if (!this.roll('harpyKill', { evil: g.evilOf(mad) }, { who: mad.id })) { this.note(`${g.name(mad.id)} 没有疯狂地证明 ${g.name(second.id)} 是邪恶的：这次放过`); return []; }
    const both = live.length === 2 && this.roll('harpyBoth', { balance: this.balance() }, { who: mad.id });
    const out = both ? live : [live.includes(mad) ? mad : live[0]];
    this.note(`${g.name(mad.id)} 没有疯狂地证明 ${g.name(second.id)} 是邪恶的：${out.map((q) => g.name(q.id)).join('、')} 死亡`);
    return out;
  }

  /**
   * 炸弹人引爆：留下包括恶魔在内的三名存活玩家（官方：说书人一个一个挑谁死）。另外两个往落后的一方偏：
   * 善良落后多留善良（三人里两善一恶，倒数时善良指恶魔就赢），邪恶落后多留邪恶。
   */
  boomSurvivors() {
    const g = this.g;
    const alive = g.alive();
    if (alive.length <= 3) return alive;
    const demons = alive.filter((q) => ROLES[q.role].team === 'demon');
    const keep = demons.slice(0, 3);
    const b = this.balance();
    let pool = alive.filter((q) => !keep.includes(q));
    while (keep.length < 3 && pool.length) {
      const x = this.draw('boomSurvivor', pool, (q) => ({ pressure: g.evilOf(q) ? b : -b }), { b });
      keep.push(x); pool = pool.filter((q) => q !== x);
    }
    this.note(`炸弹人引爆：留下 ${keep.map((q) => g.name(q.id)).join('、')}`, b);
    return keep;
  }

  /** 失效的侍女：给一个错的数字。 */
  fakeChambermaid(p, truth) {
    const opts = [0, 1, 2].filter((n) => n !== truth);
    const n = this.choose('fakeChambermaid', opts, { who: p.id, truth });
    this.note(`失效的侍女 ${this.g.name(p.id)}：真实 ${truth}，告诉她 ${n}`);
    return n;
  }
}
