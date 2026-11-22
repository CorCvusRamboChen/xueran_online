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
import { ROLES, TOWNSFOLK, OUTSIDERS, MINIONS, isEvilRole, inScript, rolesOf, DISTRIBUTION } from './roles.js';
import { chanceOf, drawOdds, DICE } from './dice.js';
import { tableFeatures, mechanicalTable } from './tableRead.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const idOf = (x) => x?.id ?? x;
const upTo = (n) => Array.from({ length: n + 1 }, (_, i) => i);
/** 假世界里这个人是什么类型：假恶魔算恶魔、假爪牙算爪牙，其余照真的（无神论者局的气球驾驶员用）。 */
export const worldTeam = (w, q) => (q.id === w.demon ? 'demon' : w.evil.has(q.id) ? 'minion' : ROLES[q.role].team);

// 算不算"这个人又被说书人挑中了"：同一个人身上别压太多（看决策日志就知道）
const HARM = new Set(['mayorVictim', 'gossipVictim', 'sweetheartDrunk', 'innkeeperDrunk', 'pitVictim']);
const trim = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
const tidy = (features) => Object.fromEntries(Object.entries(features).filter(([, v]) => v != null && v !== false && v !== 0).map(([k, v]) => [k, trim(v)]));
// 梦殒春宵拿信息的镇民：亡骨魔的毒下在这些人身上，影响的是全镇的判断
/** 善良玩家自己通常不公开的角色：筑梦师替邪恶打掩护时可以拿来用（官方筑梦师页举的例子）。 */
const HIDDEN_GOOD = ['snakecharmer', 'sage', 'mutant', 'klutz'];
// 拿信息的镇民（亡骨魔毒谁时看）。混合剧本里也有暗流涌动、黯月初升、七步成诗的信息角色，以前只列了梦殒春宵的，占卜师、气球驾驶员被当成不拿信息
const SNV_INFO = new Set(['clockmaker', 'dreamer', 'mathematician', 'flowergirl', 'towncrier', 'oracle', 'savant', 'seamstress', 'juggler', 'sage',
  'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'ravenkeeper', 'grandmother', 'chambermaid',
  'balloonist', 'noble', 'shugenja', 'villageidiot']); // 艺术家、渔夫是每局一次的提问/建议，不算
const shuffled = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** 局势的文字描述。 */
/** 看不出谁领先时偏向邪恶多少（见 balance）。 */
export const EVIL_LEAN = 0.1;

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
    this.tilt = 0;             // 帮邪恶的程度：按真实对局的邪恶胜率定（server/winrate.js），加在局势上；正数 = 多帮邪恶
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

  /**
   * 这个人报的身份：公开声明过就用声明，没有就看大家在小魔典里把他标成什么（多半是他语音里报的）。
   * 说书人配合邪恶伪装时用（官方《给说书人的建议》第 7 条）。
   */
  claimOf(id) {
    const g = this.g;
    if (g.claims?.[id]) return g.claims[id];
    const said = this.table()?.claims?.[id]?.role; // 读场：他在语音里报的身份（2026-11-19）
    if (said) return said;
    try { return g.markedRole?.(id) ?? null; } catch { return null; }
  }

  /** 读场结果：房间黄昏时让 AI 听完大家的发言整理的（tableRead.js）。没有就 null。 */
  table() {
    try { const t = this.g.tableRead?.(); return t && (t.gameId == null || t.gameId === this.g.id) ? t : null; } catch { return null; }
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
    // 亡骨魔杀死的爪牙保留能力，不算死（以前算死：亡骨魔一刀杀了唯一的爪牙，局势直接跳到「善良明显领先」）
    const minionDead = minions.length ? minions.filter((p) => !p.alive && !g.kept?.(p)).length / minions.length : 0;
    const goodDead = good.length ? good.filter((p) => !p.alive).length / good.length : 0;
    const demon = g.demon();
    const heat = Object.values(g.suspicion);
    const maxHeat = Math.max(1, ...heat);
    const demonHeat = demon ? (g.suspicion[demon.id] ?? 0) / maxHeat : 1;
    let raw = 1.0 * minionDead + 0.4 * demonHeat - 0.8 * goodDead;
    // 2026-11-16 用户要的三条（影响从大到小）：
    // ① 小魔典：好人们（只算善良玩家的标记）怀疑的是真邪恶就算善良领先，集体怀疑好人算邪恶领先。房间层算好放在 signals 里，没有就不算
    let sig = {};
    try { sig = g.signals?.() ?? {}; } catch { /* 看情况不能耽误结算（features 里会记一次警告） */ }
    // 小魔典和读场（AI 听了大家的发言，看大家怀疑的是不是真邪恶）都有就各占一半
    const leads = [sig.marksLead, sig.tableLead].filter((v) => typeof v === 'number');
    if (leads.length) raw += 0.6 * leads.reduce((a, v) => a + v, 0) / leads.length;
    // ② 离终局多近：剩 5 人起越来越偏邪恶；恶魔已经被大家盯上（被提名投票多、或者小魔典里多数人怀疑他）就打折
    const alive = g.aliveCount();
    const end = alive <= 5 ? Math.min(1, (6 - alive) / 3.5) : 0;
    if (end && demon) raw -= 0.9 * end * (1 - Math.max(demonHeat, sig.demonExposed ?? 0));
    // 帮邪恶的程度（2026-11-20 用户：看邪恶的真实胜率来调）：邪恶赢得少就把局势看得更偏善良，骰子多往邪恶偏
    raw = clamp(raw + (this.tilt || 0), -1, 1);
    // ③ AI 说书人黄昏时听了大家今天说的话、看了真实情况，判断谁在赢（有将军或政客的剧本才问）：当晚一半听它的
    if (g.aiLead && g.aiLead.day === g.day) raw = clamp(0.5 * raw + 0.5 * ({ good: 0.6, evil: -0.6, neither: 0 }[g.aiLead.side] ?? 0), -1, 1);
    // 官方《给说书人的建议》：「如果你不知道你应该帮助哪个阵营，要么哪个阵营都不帮，要么就帮助邪恶阵营」。
    // 看不出谁领先时，当作善良略好一点（所有骰子都是往落后的一方偏，这就等于稍微帮邪恶），但不越过「略占上风」的线
    return Math.abs(raw) < 0.15 ? Math.min(0.149, raw + EVIL_LEAN) : raw;
  }

  // ───────────── 存档 ─────────────
  toJSON() {
    return {
      journal: this.journal,
      decisions: this.decisions,
      worlds: [...this.worlds.entries()].map(([id, w]) => [id, { demon: w.demon, evil: [...w.evil], roles: [...w.roles.entries()], dream: w.dream, demonOk: w.demonOk ?? null }]),
      misCount: [...this.misCount.entries()],
      covers: this.covers,
      tilt: this.tilt,
    };
  }

  load(data) {
    this.journal = data?.journal ?? [];
    this.decisions = data?.decisions ?? [];
    this.worlds = new Map((data?.worlds ?? []).map(([id, w]) => [id, { demon: w.demon, evil: new Set(w.evil), roles: new Map(w.roles), dream: w.dream, demonOk: w.demonOk ?? null }]));
    this.misCount = new Map(data?.misCount ?? []);
    this.covers = data?.covers ?? {};
    this.tilt = data?.tilt ?? 0;
  }

  // ───────────── 开局 ─────────────

  /**
   * 红鲱鱼：一名善良玩家。只从善良镇民里挑（被怀疑更有戏剧性；一个都没有才从所有善良里挑），新手少当，一般不选占卜师自己。
   * 例外：官方占卜师页「在小型游戏中…我们建议你在某些情况下将占卜师本人作为"干扰项"」——5–6 人局有时让占卜师自己当，
   * 这样他不查自己时的结果都是干净的；新手占卜师不这么做（他想不到）。
   */
  redHerring() {
    const ft = this.g.players.find((p) => p.role === 'fortuneteller');
    if (ft && this.g.players.length <= 6 && !this.g.newbies?.includes(ft.id) && this.roll('ftSelfHerring', {}, { who: ft.id })) {
      this.note(`小局：把占卜师 ${this.g.name(ft.id)} 自己定为红鲱鱼`);
      return ft.id;
    }
    const good = this.g.players.filter((p) => !(this.g.evilOf ? this.g.evilOf(p) : isEvilRole(p.role)) && !p.traveller); // 按现在的阵营：被灵言师转成邪恶的不算
    const townsfolk = good.filter((p) => ROLES[p.role].team === 'townsfolk' && p.role !== 'fortuneteller');
    const pool = townsfolk.length ? townsfolk : good;
    const p = this.draw('redHerring', pool, () => ({}));
    this.note(`把 ${this.g.name(p.id)}（${ROLES[p.role].name}）定为占卜师的红鲱鱼`);
    return p.id;
  }

  // ───────────── 陌客 / 间谍 ─────────────

  /**
   * 健康的陌客/间谍被检测时，要不要登记成另一个阵营。
   * help：这次误登记帮哪边。大多数帮邪恶（误导信息、陌客被当恶魔挨枪），善良领先时更常发生；
   * 有几种帮善良：间谍被贞洁者当成镇民（间谍被处决）、陌客被厨师算成邪恶（官方陌客页的范例：厨师看到「2」
   * 过于暴露邪恶，说书人改给「0」）——这些反过来，邪恶领先时更常发生。
   * 同一个人一晚上最多错误登记两次，免得一个人身上压太多误导。
   */
  misregister(p, by, help = 'evil') {
    const key = `${this.g.night}:${p.id}`;
    const used = this.misCount.get(key) ?? 0;
    if (used >= 2) return false;
    const b = this.balance();
    const yes = this.roll('misregister', { balance: help === 'good' ? -b : b }, { who: p.id, b, help });
    if (yes) {
      this.misCount.set(key, used + 1);
      const as = p.role === 'recluse' ? '邪恶' : '善良';
      this.note(`${by}时，把${ROLES[p.role].name} ${this.g.name(p.id)} 登记成${as}`, b);
    }
    return yes;
  }

  /**
   * 陌客/间谍被看角色时错误登记成什么。官方陌客页「由说书人来选择最有趣的结果」，《给说书人的建议》举例：
   * 间谍声称自己是占卜师，被守鸦人选中时就让他被当作占卜师。所以按这个顺序：
   *   1. 这局之前已经给他登记过的角色（前后一致：洗衣妇看到守鸦人，送葬者也看到守鸦人）
   *   2. 间谍公开声明过的角色（配合邪恶的伪装；暗流涌动、黯月初升没记声明时跳过）
   *   3. 间谍优先不在场的善良角色（报成在场的角色等于当场撞身份，帮不了邪恶）
   * pool：可以登记成的角色（通用引擎按剧本给）。
   */
  misregRole(p, pool = p.role === 'recluse' ? [...MINIONS, 'imp'] : [...TOWNSFOLK, ...OUTSIDERS]) {
    const g = this.g;
    const before = this.decisions.findLast?.((d) => d.kind === 'misregRole' && d.who === p.id)?.chosen;
    if (before && pool.includes(before)) { this.decide('misregRole', { who: p.id, options: pool, chosen: before, prob: 1, why: 'same' }); return before; }
    const said = this.claimOf(p.id);
    if (p.role === 'spy' && said && pool.includes(said)) { this.decide('misregRole', { who: p.id, options: pool, chosen: said, prob: 1, why: 'claim' }); return said; }
    const out = p.role === 'spy' ? pool.filter((r) => !g.players.some((q) => q.role === r)) : pool;
    return this.choose('misregRole', out.length ? out : pool, { who: p.id });
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
    // 配合邪恶的伪装（官方《给说书人的建议》第 7 条）：和邪恶公开声明撞了身份的真好人排最前，假世界里由他当邪恶
    const taken = new Set(evil.map((q) => this.claimOf(q.id)).filter(Boolean));

    let demon = null; const minions = [];
    if (keep?.role === 'imp') demon = keep; else if (keep) minions.push(keep);
    const pool = good.filter((q) => q !== keep).sort((x, y) => (taken.has(y.role) ? 1 : 0) - (taken.has(x.role) ? 1 : 0));
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
      else if (isEvilRole(q.role)) {
        const said = this.claimOf(q.id);
        roles.set(q.id, said && ROLES[said] && !isEvilRole(said) && said !== 'drunk' ? said : spare.pop() ?? 'soldier'); // 假世界里他就是他声称的角色
      }
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

  /**
   * 真酒鬼这一晚要不要拿真信息。官方《给说书人的建议》第 6 条：邪恶已经碾压善良时，可以在一些夜晚给酒鬼正确的信息。
   * 只在邪恶明显领先（局势 < -0.4）时掷；中毒的人不走这里（那是投毒者的意图，照给假的）。同一个人同一晚只判一次。
   */
  drunkTruth(p) {
    const done = this.decisions.find((d) => d.kind === 'drunkTruth' && d.night === this.g.night && d.who === p.id);
    if (done) return done.chosen;
    const b = this.balance();
    if (b >= -0.4) return false;
    const yes = this.roll('drunkTruth', { balance: b }, { who: p.id, b });
    if (yes) this.note(`邪恶明显领先：酒鬼 ${this.g.name(p.id)} 今晚拿到真信息`, b);
    return yes;
  }

  /** 醉酒的村夫这晚拿不拿真信息（官方村夫页：可以给，免得几个村夫一对就知道谁醉了）。同一晚只掷一次。 */
  idiotTruth(p) {
    const done = this.decisions.find((d) => d.kind === 'idiotTruth' && d.night === this.g.night && d.who === p.id);
    if (done) return done.chosen;
    const b = this.balance();
    const yes = this.roll('idiotTruth', { balance: b }, { who: p.id, b });
    if (yes) this.note(`醉酒的村夫 ${this.g.name(p.id)} 今晚拿到真信息`, b);
    return yes;
  }

  /** 和平主义者：被处决的善良玩家要不要活下来。邪恶领先时更常救；每局别救太多次。 */
  pacifistSaves(p) {
    const b = this.balance();
    const save = this.roll('pacifist', { balance: b, used: this.times('pacifist') }, { who: p.id, b });
    this.note(`和平主义者：被处决的善良玩家 ${this.g.name(p.id)} ${save ? "活了下来" : "照常死亡"}`, b);
    return save;
  }

  /**
   * 水手选了人：谁醉酒。惯例：选了镇民就让镇民醉，选了外来者/邪恶就让水手自己醉。
   * 选了镇民时偶尔（约 10%，善良领先时多一点）反过来让水手自己醉；邪恶领先时不反，免得雪上加霜。
   */
  sailorDrunk(sailor, target) {
    const townsfolk = ROLES[target.role].team === "townsfolk";
    let who = townsfolk ? target : sailor;
    if (townsfolk) {
      const b = this.balance();
      if (b >= -0.15 && this.roll('sailorFlip', { balance: b }, { who: sailor.id, b })) who = sailor;
    }
    this.note(`水手 ${this.g.name(sailor.id)} 选了 ${this.g.name(target.id)}，${who === sailor ? "水手自己" : "对方"}醉酒`);
    return who;
  }

  /** 旅店老板保护的两人里谁醉酒：通常是更需要准确信息/能力的善良玩家。 */
  /**
   * 旅店老板保护的两人里谁醉。官方：「该玩家可以是善良的或邪恶的，但几乎总会是善良的，这取决于你的游戏走向」。
   * 两人里有邪恶时掷一次（innkeeperEvil）：多半醉善良，善良落后时偶尔醉邪恶。
   */
  innkeeperDrunk(pair) {
    const g = this.g;
    const good = pair.filter((q) => !g.evilOf(q));
    const evil = pair.filter((q) => g.evilOf(q));
    const b = this.balance();
    const pool = good.length && evil.length && this.roll('innkeeperEvil', { balance: b }, { b }) ? evil : good.length ? good : pair;
    const who = this.draw('innkeeperDrunk', pool, (q) => ({ hits: this.hits(q.id) }));
    this.note(`旅店老板保护了 ${pair.map((q) => g.name(q.id)).join("、")}，让 ${g.name(who.id)} 醉酒`);
    return who;
  }

  /**
   * 醉酒中毒的教父首夜：给一份假的"在场外来者"名单——人数比真的多一个或少一个（随机），角色从本剧本外来者里挑。
   * 一定和真名单不一样（以前人数被截到 0 或剧本上限时，可能碰巧报出真名单）。truth：角色 id 或中文名都行。
   */
  fakeOutsidersBMR(p, truth) {
    const all = rolesOf(this.g.script ?? 'bmr', 'outsider'); // 只从这个剧本的外来者里编，报出剧本外的角色等于露馅
    const ids = truth.map((x) => (ROLES[x] ? x : Object.keys(ROLES).find((k) => ROLES[k].name === x) ?? x));
    const key = (a) => [...a].sort().join();
    const lens = [ids.length + 1, ids.length - 1].filter((k) => k >= 0 && k <= all.length);
    let said = [];
    for (let i = 0; i < 20; i++) {
      const n = lens.length ? lens[Math.floor(this.rng() * lens.length)] : ids.length;
      said = [...all].sort(() => this.rng() - 0.5).slice(0, n);
      if (key(said) !== key(ids)) break;
    }
    this.decide('fakeOutsiders', { who: p.id, options: all, chosen: said, truth: ids });
    return said;
  }

  /** 沙巴洛斯反刍：偶尔（每局一两次）把上一夜吃掉的人吐回来，通常是善良玩家；邪恶领先时更常发生。 */

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

  /**
   * 牙噶巴卜（2026-11-22，集石百科）：他今天白天公开说了 said 次暗号，今晚就可能死 said 个人，死谁由说书人选，也可以少杀。
   * 每一次掷「杀不杀」（善良领先时多杀）；杀谁照聪明的恶魔挑（读场：杀被信任的、报了信息的，留被怀疑的背锅），不杀邪恶。
   */
  yaggVictims(said) {
    const g = this.g;
    const t = this.tableOrRules();
    const out = [];
    for (let i = 0; i < said; i++) {
      const b = this.balance();
      if (!this.roll('yaggKill', { balance: b }, { b, nth: i + 1, said })) continue;
      const can = g.alive().filter((q) => !q.apparentDead && !g.evilOf(q) && !out.includes(q) && !g.safeFrom(q, 'demon'));
      if (!can.length) break;
      const v = this.draw('yaggVictim', can, (q) => { const f = tableFeatures(t, q.id); return { hits: this.hits(q.id), trusted: f.trusted ?? 0, info: f.info ?? 0, suspected: f.suspected ?? 0 }; }, { b });
      out.push(v);
    }
    this.note(said ? `牙噶巴卜今天说了 ${said} 次暗号：今晚${out.length ? `让 ${out.map((q) => g.name(q.id)).join('、')} 死亡` : '没有让人死亡'}` : '牙噶巴卜今天没说暗号：今晚没人因他死亡');
    return out;
  }

  /**
   * 末日预言者（传奇角色）：uid 公开用了一次，说书人挑一名和他同阵营的存活玩家死亡（可以是他自己）。
   * 官方建议：别拿它杀恶魔，除非游戏还能继续（红唇女郎能接）；能不挑新手就不挑。
   */
  doomVictim(uid) {
    const g = this.g;
    const me = g.get(uid);
    const evil = g.evilOf(me);
    const heir = g.players.some((q) => q.alive && q.role === 'scarletwoman' && !g.snvBroken?.(q)) && g.alive().length >= 5;
    let can = g.alive().filter((q) => !q.apparentDead && g.evilOf(q) === evil && (ROLES[q.role].team !== 'demon' || heir));
    if (!can.length) can = g.alive().filter((q) => g.evilOf(q) === evil);
    if (!can.length) return null;
    const v = this.draw('doomVictim', can, (q) => ({ hits: this.hits(q.id), self: q.id === uid ? 1 : 0 }), { who: uid });
    this.note(`${g.name(uid)} 用了末日预言者：说书人选 ${g.name(v.id)}（同为${evil ? '邪恶' : '善良'}）死亡`);
    return v;
  }

  /** 异教领袖：两个活邻座一善一恶时，说书人决定他变成哪边。善良落后时多半变善良、领先时多半变邪恶（往落后的一方偏）。 */
  cultSide(p, nb) {
    const b = this.balance();
    const evil = this.roll('cultEvil', { balance: b }, { who: p.id, b });
    this.note(`异教领袖 ${this.g.name(p.id)} 的两个活邻座一善一恶：说书人让他${evil ? '变成邪恶' : '变成 / 保持善良'}`, b);
    return evil;
  }

  /**
   * 国王（死人不少于活人时每晚）：得知一个存活的角色。官方：要给有力的信息——多半给一个活着的邪恶角色（善良落后时更多），
   * 有时给善良角色；失效时给一个不在场或死人的角色。
   */
  kingSees(p, lie) {
    const g = this.g;
    const alive = g.alive().filter((q) => q.id !== p.id && !q.traveller);
    if (!alive.length) return null;
    if (lie) {
      const pool = rolesOf(g.script).filter((r) => !alive.some((q) => q.role === r));
      return pool.length ? this.choose('kingFake', pool, { who: p.id }) : null;
    }
    const b = this.balance();
    const evil = alive.filter((q) => g.evilOf(q));
    const pick = evil.length && this.roll('kingEvil', { balance: b }, { who: p.id, b }) ? this.choose('kingSees', evil, { who: p.id }) : this.choose('kingSees', alive, { who: p.id });
    this.note(`国王 ${g.name(p.id)} 得知存活的 ${ROLES[pick.role].name}`, b);
    return pick.role;
  }

  /**
   * 解谜大师：开局让谁整局醉酒。官方：几乎总是镇民（拿信息的镇民最有戏），给爪牙恶魔要有极好的理由——这里不给。
   */
  puzzleDrunk(pm) {
    const g = this.g;
    const tf = g.players.filter((q) => q.id !== pm.id && ROLES[q.role].team === 'townsfolk');
    const pool = tf.length ? tf : g.players.filter((q) => q.id !== pm.id && !isEvilRole(q.role));
    const v = pool.length ? this.draw('puzzleDrunk', pool, () => ({})) : null;
    if (v) this.note(`解谜大师：让 ${g.name(v.id)}（${ROLES[v.role].name}）整局醉酒`);
    return v;
  }

  /** 解谜大师的回答：猜对（且没失效）告诉他恶魔；否则告诉他一个不是恶魔的人（有多个恶魔时告诉一个活着的邪恶恶魔）。 */
  puzzleAnswer(pm, lie) {
    const g = this.g;
    const demons = g.players.filter((q) => ROLES[q.role].team === 'demon');
    if (!lie) return demons.find((q) => q.alive && g.evilOf(q)) ?? demons[0] ?? null;
    const others = g.players.filter((q) => q.id !== pm.id && ROLES[q.role].team !== 'demon');
    return others.length ? this.choose('puzzleWrong', others, { who: pm.id }) : null;
  }

  /**
   * 军团：今晚死谁（说书人决定）。官方运作方式：大多数夜晚杀一个军团（杀善良通常不公平），目标是走到三人（两善一军团）；
   * 那天没处决就杀一名善良，邪恶获胜。这里：军团还多就杀军团（善良领先时偶尔杀善良），只剩一个军团时杀善良。
   */
  legionVictim() {
    const g = this.g;
    const alive = g.alive().filter((q) => !q.traveller);
    const legion = alive.filter((q) => q.role === 'legion');
    const good = alive.filter((q) => !g.evilOf(q) && !g.safeFrom?.(q, 'demon'));
    const b = this.balance();
    let pool;
    if (legion.length > 1 && good.length > 2 && !this.roll('legionKillGood', { balance: b }, { b })) pool = legion;
    else pool = good.length ? good : legion;
    const v = pool.length ? this.draw('legionVictim', pool, (q) => ({ hits: this.hits(q.id) }), { b }) : null;
    if (v) this.note(`军团：说书人让 ${g.name(v.id)}（${g.evilOf(v) ? '军团' : '善良'}）今晚死亡`, b);
    return v;
  }

  /** 诡诈杰克：今天黄昏两位说书人互换吗（整局一次）。官方：通常在善良玩家开始弄清谁说真话时换。善良领先、天数越往后越可能换。 */
  knavesSwap() {
    const g = this.g;
    if ((g.day ?? 0) < 2) return false;
    const b = this.balance();
    return this.roll('knavesSwap', { balance: b, late: Math.min(1, ((g.day ?? 0) - 1) / 3) }, { b });
  }

  /** 公爵夫人（传奇角色）：三名拜访者里谁拿错的数，和那个错的数（0–3 里随便一个不对的，尽量只差一）。 */
  duchessFalse(visitors, truth) {
    const who = this.choose('duchessFalse', visitors);
    const near = [truth - 1, truth + 1].filter((n) => n >= 0 && n <= 3);
    const pool = near.length ? near : [0, 1, 2, 3].filter((n) => n !== truth);
    const n = this.choose('duchessNumber', pool, { truth });
    this.note(`公爵夫人：三名拜访者里有 ${truth} 个邪恶，${this.g.name(who.id)} 拿到错的数 ${n}`);
    return { who, n };
  }

  /** 修补匠：随时可能死。善良领先时更容易死；剩的人少时绝不让他的死结束游戏。 */
  tinkerDies(p) {
    const g = this.g;
    if (g.aliveCount() <= 4) return false;
    const b = this.balance();
    // 制造混乱的时机（权重见 dice.js）：今晚已经死了几个（最多算 2）、恶魔被驱魔人挡住、今天有人发表过造谣式声明；
    // 大家猜的恶魔不一致（demonSplit）由房间的信号给
    const crowd = Math.min(2, (g.nightDeaths ?? []).filter((id) => id !== p.id).length);
    const extra = { balance: b, crowd, blocked: g.blocked ? 1 : 0, gossip: Object.keys(g.gossipSaid ?? {}).length ? 1 : 0 };
    const die = this.roll('tinker', extra, { who: p.id, b });
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
    const key = mode === 'must' ? 'vortox' : mode === 'atheist' ? 'atheist' : p.id;
    let w = this.worlds.get(key);
    if (w) return w;
    for (let k = 0; k < 40; k++) { w = mode === 'atheist' ? this.buildAtheistWorld() : this.buildSnvWorld(p); if (!differ || differ(w)) break; }
    this.worlds.set(key, w);
    this.decide('world', { who: key, chosen: { demon: w.demon, evil: [...w.evil] }, mode, b: w.b });
    const g = this.g;
    const others = [...w.evil].filter((id) => id !== w.demon);
    this.note(`${mode === 'must' ? '涡流下镇民共用' : mode === 'atheist' ? '无神论者局所有人共用' : `失效的 ${g.name(p.id)} 用`}的假世界：把 ${g.name(w.demon)} 当成恶魔${others.length ? `、${others.map((id) => g.name(id)).join('、')} 当成爪牙` : ''}`, w.b);
    return w;
  }

  /**
   * 人数和真的一样；邪恶领先时掺一个真邪恶帮善良一把。
   * 真邪恶在这个世界里是好人，假邪恶就挑能帮他们圆谎的人：和邪恶公开声明撞了身份的真好人排最前（谁是假的一目了然地指向他），
   * 然后是活人、已经有人怀疑的人。语音里说的身份这里看不到，只算公开声明。
   */
  /** 无神论者局：说书人假装有一个邪恶阵营（人数照标准表），从无神论者以外的人里挑。整局共用。 */
  /**
   * 无神论者局：给出去的信息里有跟「谁是恶魔」有关的，记下假世界里哪些人当恶魔还对得上（demonOk）。
   * ok(w2)：把假恶魔换成 w2.demon 时，这条信息给的答案不变。假恶魔死了、被舞蛇人选中时，只在对得上的人里挪。
   */
  pinAtheist(w, ok) {
    if (!w || this.worlds.get('atheist') !== w) return;
    const fits = [...w.evil].filter((id) => { try { return ok({ ...w, demon: id }); } catch { return id === w.demon; } });
    w.demonOk = w.demonOk ? w.demonOk.filter((id) => fits.includes(id)) : fits;
  }

  /** 读场结果；没有就用提名投票兜底（无神论者局挑人一定要有点依据）。 */
  tableOrRules() { return this.table() ?? mechanicalTable(this.g); }

  /**
   * 无神论者局：说书人假装的恶魔今晚杀谁。照一个聪明的真恶魔会怎么杀（2026-11-19 用户：要胜过真人说书人）：
   * - 杀大家最信任的、报了信息的、一直在指认假恶魔的人（真恶魔要灭口、要削弱好人的信息）；
   * - 不杀被大家怀疑的人（真恶魔留着他们背锅）；
   * - 不杀在喊「处决说书人」的人：真邪恶最希望好人去处决说书人（那样邪恶赢），绝不会杀他——杀了反而露馅。
   */
  atheistVictim(pool, w) {
    const g = this.g;
    const t = this.tableOrRules();
    const v = this.draw('atheistKill', pool, (q) => tableFeatures(t, q.id, { demon: w.demon }));
    if (!v) return v;
    const f = tableFeatures(t, v.id, { demon: w.demon });
    const why = [f.accuser && `他一直在指认假恶魔 ${g.name(w.demon)}`, f.trusted >= 0.4 && '大家很信任他', f.info && `他报了${ROLES[t.claims[v.id].role].name}、在给信息`].filter(Boolean);
    const spared = pool.filter((q) => q.id !== v.id && tableFeatures(t, q.id).stVoice).map((q) => g.name(q.id));
    this.note(`无神论者局：假恶魔杀 ${g.name(v.id)}${why.length ? `（${why.join('，')}）` : ''}${spared.length ? `；没杀 ${spared.join('、')}——他们在推处决说书人，真恶魔不会杀这样的人` : ''}${t.mechanical ? '（没有读场，只看提名投票）' : ''}`);
    return v;
  }

  /** 小怪宝：说书人替「恶魔」杀人，照聪明的恶魔挑（读场有就用：杀被信任的、报信息的、指认照看者的，留着被怀疑的人）。 */
  monstaVictim(pool, holder) {
    const g = this.g;
    const t = this.tableOrRules();
    const v = this.draw('monstaKill', pool, (q) => tableFeatures(t, q.id, { demon: holder.id }));
    if (v) this.note(`小怪宝：说书人替恶魔杀死 ${g.name(v.id)}（照看的是 ${g.name(holder.id)}）`);
    return v;
  }
  /** 小怪宝：爪牙没定（机器人、超时）时说书人挑照看的人：大家越不怀疑越安全（官方：交给可靠的人）。 */
  monstaSitter(sitters, m) {
    const t = this.tableOrRules();
    return this.draw('monstaSitter', sitters, (q) => ({ ...tableFeatures(t, q.id), keep: q.id === m.holder ? 1 : 0 }));
  }

  /** 无神论者局：假恶魔死了（多半是被处决），从对得上的人里挑下一个「恶魔」：大家越不怀疑的越像没被发现的恶魔。 */
  atheistHeir(cands, w) {
    const t = this.tableOrRules();
    return this.draw('atheistDemon', cands, (q) => tableFeatures(t, q.id, { demon: w.demon }));
  }

  buildAtheistWorld() {
    const g = this.g; const rng = this.rng;
    const m = DISTRIBUTION[g.players.length]?.[2] ?? 1;
    const pool = shuffled(g.players.filter((q) => q.role !== 'atheist'), rng);
    return { demon: pool[0].id, evil: new Set(pool.slice(0, m + 1).map((q) => q.id)), roles: new Map(), b: this.balance() };
  }

  buildSnvWorld(p) {
    const g = this.g; const rng = this.rng;
    const others = shuffled(g.players.filter((q) => q.id !== p.id), rng);
    const size = g.players.filter((q) => g.evilOf(q)).length;
    const b = this.balance();
    const real = others.filter((q) => g.evilOf(q));
    const keep = b < -0.15 && real.length && rng() < 0.5 ? pick(real, rng) : null;
    const taken = new Set(real.map((q) => this.claimOf(q.id)).filter(Boolean));
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
    // 涡流下的数学家：官方范例六人异常得知 3。不总是 0、1，从 0 到真相之间挑（离得远，又不至于离谱）
    const far = p.role === 'mathematician' && this.g.vortoxOn?.() && truth >= 3 && this.roll('mathFar', {}, { who: p.id })
      ? Array.from({ length: truth - 1 }, (_, i) => i + 1).filter((n) => n >= min && n <= max) : [];
    const small = far.length ? far : p.role === 'mathematician' ? [0, 1].filter((n) => n !== truth && n >= min && n <= max) : [];
    const near = small.length ? small : [truth - 1, truth + 1].filter((n) => n >= min && n <= max);
    const pool = near.length ? near : [min, max].filter((n) => n !== truth);
    const v = pool.length ? this.choose('fakeNumber', pool, { who: p.id, truth }) : truth;
    this.note(`失效的 ${ROLES[p.role].name} ${this.g.name(p.id)}：真实 ${truth}，告诉他 ${v}`);
    return v;
  }

  /**
   * 镜像双子的对立双子：对立阵营的一人，优先活着的镇民。
   * late：麻脸巫婆在最后几夜（剩 4 人以下）造出的双子。官方：这时「可以选择恶魔或一名死亡的玩家作为对立双子，这样善良玩家仍然有机会获胜」。
   */
  twinFor(a, late = false) {
    const g = this.g;
    const opp = g.players.filter((q) => q.id !== a.id && g.evilOf(q) !== g.evilOf(a));
    if (late) {
      const fair = opp.filter((q) => !q.alive || ROLES[q.role].team === 'demon');
      if (fair.length) {
        const t = this.choose('twin', fair, { who: a.id, late: true });
        this.note(`麻脸巫婆在最后几夜造出镜像双子：对立双子选 ${g.name(t.id)}（${t.alive ? '恶魔' : '死人'}），善良还有机会赢`);
        return t;
      }
    }
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

  /**
   * 贤者得知的两个人：lie 时两个都不是恶魔，有假世界就指假世界的恶魔。前期指活人（给邪恶留机会）。
   * 最后一夜（只剩三个活人）官方说可以指一个活人和一个死人：健康时等于点出恶魔，善良落后时多给；
   * 失效时等于把善良推向错的活人（官方范例就是醉酒贤者最后一夜看到一个死人和一个善良活人），善良领先时多给。
   */
  sagePair(sage, demon, lie, w = null) {
    const g = this.g;
    const fake = g.players.filter((q) => q.id !== sage.id && ROLES[q.role].team !== 'demon');
    const live = fake.filter((q) => q.alive);
    const dead = fake.filter((q) => !q.alive);
    const b = this.balance();
    if (g.aliveCount() <= 3 && dead.length && live.length && this.roll('sageDead', { balance: lie ? -b : b }, { who: sage.id, lie: !!lie })) {
      const ghost = this.choose('sageOther', dead, { who: sage.id, dead: true });
      if (!lie) return shuffled([demon, ghost], this.rng);
      const one = live.find((q) => q.id === w?.demon) ?? this.choose('sageAlive', live, { who: sage.id });
      this.decide('sagePair', { who: sage.id, options: fake.map(idOf), chosen: [one.id, ghost.id], truth: demon?.id });
      return shuffled([one, ghost], this.rng);
    }
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
    const said = this.claimOf(t.id);
    // 官方筑梦师页：帮邪恶时展示他正在伪装的角色，或者一个本来就要藏着的角色（舞蛇人、贤者、畸形秀演员、呆瓜），没人能当面对质
    const hidden = HIDDEN_GOOD.filter(good);
    const cover = good(said) ? said : this.choose('dreamerCover', [...new Set([...(g.bluffs ?? []).filter(good), ...hidden])], { who: t.id }) ?? null;
    if (cover) this.covers[t.id] = cover;
    return cover;
  }

  /** 筑梦师看到的 [善良角色, 邪恶角色]。邪恶那一项几乎都用在场爪牙。lie 时两个都错，同一套假世界里同一个人每晚答案一样。不会给涡流（涡流在场时必须都错，给了就等于说破）。 */
  dreamerRoles(t, lie, w = null, viewer = null) {
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
    const goods = all(['townsfolk', 'outsider']); const notMine = goods.filter((r) => r !== viewer?.role && r !== viewer?.shownRole); // 不报筑梦师自己的角色
    const fakeGood = cover ?? this.choose('dreamerGood', notMine.length ? notMine : goods, { who: t.id, truth: t.role, lie: !!lie });
    if (lie) {
      if (w) (w.dream ??= {})[t.id] = [fakeGood, fakeEvil];
      return [fakeGood, fakeEvil];
    }
    return trueGood ? [t.role, fakeEvil] : [fakeGood, t.role];
  }

  /**
   * 麻脸巫婆造出恶魔，当晚的死亡怎么安排（官方麻脸巫婆页的建议）：
   * - 恶魔换成别的恶魔：今晚没人死，提示恶魔变了。
   * - 造出邪恶的新恶魔：老恶魔死，新恶魔照常刀一个（「最好杀死老恶魔和一名其他玩家」）。
   * - 造出善良的恶魔：不是最后几夜就两个恶魔一起杀；最后几夜只留一个恶魔。官方范例杀的是邪恶的老恶魔，
   *   善良落后时多照范例做，善良领先时杀新造的善良恶魔。老恶魔死了以后场上得还有邪恶活着，不然等于把胜利送给善良。
   * - 不是最后几夜、局势一边倒时（官方：「你能在当晚杀死任意数量的玩家或阻止被恶魔攻击的玩家死亡来平衡游戏」）：
   *   善良大优多死一名善良，邪恶大优让恶魔这一刀落空。
   */
  pitPlan(t, wasDemon, old) {
    const g = this.g;
    if (!t.alive) { this.note(`麻脸巫婆把死人变成了${ROLES[t.role].name}：死人不杀人，今晚照常`); return { suppress: false, kill: [] }; }
    if (wasDemon) { this.note(`麻脸巫婆把恶魔换成了${ROLES[t.role].name}：今晚没有人死，提示大家恶魔变了`); return { suppress: true, kill: [] }; }
    const b = this.balance();
    const late = g.aliveCount() <= 4;
    if (g.evilOf(t)) {
      this.note(`麻脸巫婆造出了邪恶的${ROLES[t.role].name}：老恶魔今晚死亡`, b);
      return this.pitBalance({ suppress: false, kill: [...old] }, t, late, b);
    }
    if (late) {
      const evilLeft = g.alive().some((q) => g.evilOf(q) && !old.includes(q));
      if (old.length && evilLeft && this.roll('pitOldDies', { balance: b }, { who: t.id, b })) {
        this.note(`麻脸巫婆造出了善良的${ROLES[t.role].name}，已是最后几夜：照官方范例杀死邪恶的老恶魔，只留善良的恶魔`, b);
        return { suppress: false, kill: [...old] };
      }
      this.note(`麻脸巫婆造出了善良的${ROLES[t.role].name}，已是最后几夜：让它死去，只留一个恶魔`, b);
      return { suppress: false, kill: [t] };
    }
    this.note(`麻脸巫婆造出了善良的${ROLES[t.role].name}：两个恶魔一起杀人`, b);
    return this.pitBalance({ suppress: false, kill: [] }, t, late, b);
  }

  /** 麻脸巫婆当晚的死亡由说书人定：局势一边倒时拉回来一点（最后几夜不动，别让说书人决定结局）。 */
  pitBalance(plan, t, late, b) {
    const g = this.g;
    if (late || Math.abs(b) <= 0.4 || !this.roll('pitBalance', {}, { who: t.id, b })) return plan;
    if (b < 0) { plan.suppress = true; this.note('邪恶明显领先：今晚恶魔的刀落空', b); return plan; }
    const pool = g.alive().filter((q) => !g.evilOf(q) && q.id !== t.id && !plan.kill.includes(q) && ROLES[q.role].team !== 'demon');
    const v = this.draw('pitVictim', pool, (q) => ({ hits: this.hits(q.id) }), { b });
    if (v) { plan.kill.push(v); this.note(`善良明显领先：今晚多死一人（${g.name(v.id)}）`, b); }
    return plan;
  }

  /**
   * 疯狂的处决会不会让邪恶当场获胜（善良双子、只剩 3 人时处决非恶魔）：官方「『可能』意味着你可以选择不这么做，
   * 以防止邪恶玩家通过这种策略获胜」，这种时候放过。处决的是恶魔（善良会赢）不放过：《给说书人的建议》第 6 条，
   * 「你可以通过处决一名应该『疯狂』但没有照做的玩家来结束游戏」。
   */
  evilWinsBy(p) { return this.decidesGame(p) && ROLES[p.role]?.team !== 'demon'; }

  /** 处决这个人会不会当场定胜负。 */
  decidesGame(p) {
    const g = this.g;
    if (!p.alive) return p.id === g.twinGoodId(); // 处决死人不改变存活人数，只有善良的双子还能定胜负
    const lastBlock = g.twinBlocks() && [g.twin.a, g.twin.b].includes(p.id) && !g.alive().some((q) => ROLES[q.role].team === 'demon'); // 恶魔已死，就差双子挡着善良赢
    return p.id === g.twinGoodId() || ROLES[p.role].team === 'demon' || g.aliveCount() <= 3 || lastBlock;
  }

  /** 畸形秀演员声称自己是外来者：要不要处决。"可能"被处决：大多会罚，新手宽一点；会直接定胜负的不罚。how：{ voice: true } 是语音转写听到的。 */
  mutantExecuted(p, how = {}) {
    const g = this.g;
    if (this.evilWinsBy(p)) { // 处决会让邪恶当场获胜：放过（官方）；处决恶魔照常
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
    if (this.evilWinsBy(p)) { // 处决会让邪恶当场获胜：放过（官方）；处决恶魔照常（《给说书人的建议》第 6 条）
      this.decide('madness', { who: p.id, options: [false], chosen: false, prob: 1, forced: 'decidesGame' });
      this.note(`${g.name(p.id)} 没有疯狂证明，但处决他会直接定胜负：放过`);
      return false;
    }
    const yes = this.roll('madness', { ...how, evil: g.evilOf(p) }, { who: p.id });
    this.note(`${g.name(p.id)} 今天没有疯狂证明：${yes ? '处决' : '放过'}`);
    return yes;
  }

  /** 博学者的两条信息：从真实局面算出来，保证真的就是真的、假的就是假的。 */
  savantFacts(w = null) {
    const g = this.g; const rng = this.rng;
    const ps = g.players; const n = ps.length;
    const isEvil = (q) => (w ? w.evil.has(q.id) : g.evilOf(q));
    const evilIn = (list) => list.filter(isEvil).length;
    const pins = (list) => { const k = evilIn(list); return k >= 1 && list.length - k <= 1; }; // 这群人里几乎全是邪恶：说出人数就等于点名
    const num = (v, lo, hi) => { const o = [v - 1, v + 1].filter((x) => x >= lo && x <= hi); return o.length ? pick(o, rng) : v + 1; };
    const demons = ps.filter((q) => (w ? q.id === w.demon : g.demonNow ? g.demonNow(q) : ROLES[q.role].team === 'demon'));
    // 官方：「避免提供恶魔是谁这种信息」。点名一两个人的那几条不点恶魔，善良明显落后时才偶尔放开
    const open = !demons.length || this.roll('savantDemon', { balance: this.balance() }, {});
    const named = open ? ps : ps.filter((q) => !demons.includes(q));
    const two = shuffled(named, rng).slice(0, 2);
    const one = pick(named, rng);
    const dead = ps.filter((q) => !q.alive);
    const alive = ps.filter((q) => q.alive);
    const outs = ps.filter((q) => ROLES[q.role].team === 'outsider').length;
    const pool = rolesOf(g.script);
    // 无神论者局：「场上有无神论者」真假都不说（说了就是在暗示）
    const absent = pool.filter((r) => !ps.some((q) => q.role === r) && !(w && r === 'atheist'));
    const present = pool.filter((r) => ps.some((q) => q.role === r) && ROLES[r].team !== 'demon' && !(w && r === 'atheist'));
    const half = Math.floor(n / 2);
    const lo = 1 + Math.floor(rng() * n);
    const seats = Array.from({ length: half }, (_, k) => ((lo + k - 1) % n) + 1);
    const demonIn = demons.some((q) => seats.includes(q.seat));
    let pairs = 0;
    for (let i = 0; i < n; i++) if (isEvil(ps[i]) && isEvil(ps[(i + 1) % n])) pairs++;
    const same = isEvil(two[0]) === isEvil(two[1]);
    const facts = [
      { t: `场上有 ${outs} 名外来者`, f: `场上有 ${num(outs, 0, n)} 名外来者` },
      { t: `死亡的玩家里有 ${evilIn(dead)} 名邪恶`, f: `死亡的玩家里有 ${num(evilIn(dead), 0, n)} 名邪恶`, sharp: pins(dead) },
      { t: `存活的玩家里有 ${evilIn(alive)} 名邪恶`, f: `存活的玩家里有 ${num(evilIn(alive), 0, n)} 名邪恶` },
      { t: `相邻而坐的邪恶玩家有 ${pairs} 对`, f: `相邻而坐的邪恶玩家有 ${num(pairs, 0, n)} 对` },
      { t: `${g.name(two[0].id)} 和 ${g.name(two[1].id)} ${same ? '是' : '不是'}同一阵营`, f: `${g.name(two[0].id)} 和 ${g.name(two[1].id)} ${same ? '不是' : '是'}同一阵营` },
      ...(w ? [] : [{ t: `恶魔${demonIn ? '在' : '不在'} ${seats[0]} 号到 ${seats.at(-1)} 号之间`, f: `恶魔${demonIn ? '不在' : '在'} ${seats[0]} 号到 ${seats.at(-1)} 号之间` }]), // 无神论者局不说恶魔在哪（假恶魔以后可能要换人）
      { t: `${g.name(one.id)} 是${isEvil(one) ? '邪恶' : '善良'}的`, f: `${g.name(one.id)} 是${isEvil(one) ? '善良' : '邪恶'}的`, sharp: isEvil(one) },
    ];
    if (absent.length && present.length) facts.push({ t: `场上有${ROLES[pick(present, rng)].name}`, f: `场上有${ROLES[pick(absent, rng)].name}` });
    facts.push(...this.savantMore(w, { isEvil, demons, dead, num, pins }));
    return shuffled(facts, rng);
  }

  /**
   * 博学者的更多种类（2026-11-20 用户给的真人说书人的口径）：单双数座位的邪恶谁多、爪牙外来者对座 / 邻座、
   * 四个角色里有且只有两个在场、几人醉酒中毒、恶魔醉酒中毒、恶魔能不能转移座位、死人里几个善良、邪恶座位号加起来和某数比、
   * 有没有能让别人死的镇民、从第几夜开始邪恶数量异常。每条都有真的和假的说法。
   * 无神论者局（w）：中毒醉酒、恶魔状态这几类不说（假世界里说不圆，说了就是暗示没有邪恶）。
   */
  savantMore(w, { isEvil, demons, dead, num, pins = () => false }) {
    const g = this.g; const rng = this.rng;
    const ps = g.players; const n = ps.length;
    const kind = (q) => (w ? worldTeam(w, q) : ROLES[q.role].team);
    const out = [];
    const neg = (yes, a, b) => ({ t: yes ? a : b, f: yes ? b : a });
    // ① 单双数座位的邪恶谁多
    const even = ps.filter((q) => q.seat % 2 === 0 && isEvil(q)).length;
    const odd = ps.filter((q) => q.seat % 2 === 1 && isEvil(q)).length;
    const cmp = ['更多', '更少', '一样多'];
    const truth = even > odd ? '更多' : even < odd ? '更少' : '一样多';
    out.push({ t: `坐在双数号的邪恶玩家比单数号的${truth}`, f: `坐在双数号的邪恶玩家比单数号的${pick(cmp.filter((x) => x !== truth), rng)}` });
    // ②③ 爪牙 / 外来者对座、邻座
    const name = { minion: '爪牙', outsider: '外来者' };
    const combos = [['minion', 'outsider'], ['minion', 'minion'], ['outsider', 'outsider']]
      .filter(([a, b]) => ps.filter((q) => kind(q) === a).length >= (a === b ? 2 : 1) && ps.filter((q) => kind(q) === b).length >= 1);
    const pairText = (a, b) => (a === b ? `两名${name[a]}` : `${name[a]}和${name[b]}`);
    const hasPair = (a, b, step) => ps.some((q, i) => { const r = ps[(i + step) % n]; return (kind(q) === a && kind(r) === b) || (kind(q) === b && kind(r) === a); });
    if (combos.length) {
      const [a, b] = pick(combos, rng);
      out.push(neg(hasPair(a, b, 1), `有${pairText(a, b)}相邻而坐`, `没有${pairText(a, b)}相邻而坐`));
      if (n % 2 === 0) out.push(neg(hasPair(a, b, n / 2), `有${pairText(a, b)}坐在正对面`, `没有${pairText(a, b)}坐在正对面`));
    }
    // ④ 某四个角色中有且只有两个在场（不点邪恶角色、不点无神论者）
    const roles = rolesOf(g.script).filter((r) => ['townsfolk', 'outsider'].includes(ROLES[r].team) && r !== 'atheist');
    const inPlay = roles.filter((r) => ps.some((q) => q.role === r));
    const outPlay = roles.filter((r) => !inPlay.includes(r));
    const four = (k) => (inPlay.length >= k && outPlay.length >= 4 - k ? shuffled([...shuffled(inPlay, rng).slice(0, k), ...shuffled(outPlay, rng).slice(0, 4 - k)], rng) : null);
    const yes4 = four(2); const no4 = four(pick([1, 3], rng)) ?? four(1) ?? four(3);
    const say4 = (list) => `${list.map((r) => ROLES[r].name).join('、')}这四个角色中，有且只有两个在场`;
    if (yes4 && no4) out.push({ t: say4(yes4), f: say4(no4) });
    // ⑧ 死人里有几个善良
    const goodDead = dead.filter((q) => !isEvil(q)).length;
    out.push({ t: `死亡的玩家里有 ${goodDead} 名善良`, f: `死亡的玩家里有 ${num(goodDead, 0, n)} 名善良`, sharp: pins(dead) });
    // ⑨ 邪恶座位号加起来和某数比
    const sum = ps.filter(isEvil).reduce((a, q) => a + q.seat, 0);
    if (sum > 0) {
      const T = Math.max(1, sum + pick([-4, -3, -2, 2, 3, 4], rng));
      out.push(neg(sum > T, `所有邪恶玩家的座位号加起来大于 ${T}`, `所有邪恶玩家的座位号加起来小于 ${T}`));
    }
    // ⑩ 有没有能让别人死亡的镇民（杀手、造谣者、贞洁者、拿了精神病患者能力的炼金术士）
    const KILL = new Set(['slayer', 'gossip', 'virgin']);
    const killer = ps.some((q) => kind(q) === 'townsfolk' && (KILL.has(q.role) || (q.role === 'alchemist' && q.gained === 'psychopath')));
    out.push(neg(killer, '这局有镇民的能力可以导致别人死亡', '这局没有镇民的能力可以导致别人死亡'));
    // ⑪ 从第几夜开始邪恶数量异常
    const start = w ? w.evil.size : (g.evilStart ?? ps.filter((q) => g.evilOf(q)).length);
    const odd1 = w ? null : (g.evilHist ?? []).find((h) => h.count !== start);
    const night = g.night ?? 1;
    if (night >= 1) {
      const never = '邪恶玩家的数量一直和开局时一样';
      const from = (k) => `从第 ${k} 个夜晚开始，邪恶玩家的数量就和开局时不一样了`;
      const other = Array.from({ length: Math.max(1, night) }, (_, i) => i + 1).filter((k) => k !== odd1?.night);
      out.push(odd1 ? { t: from(odd1.night), f: other.length && rng() < 0.5 ? from(pick(other, rng)) : never } : { t: never, f: from(pick(other, rng)) });
    }
    if (!w) {
      // ⑤ 几人醉酒中毒（活人）
      const broken = ps.filter((q) => q.alive && g.snvBroken?.(q)).length;
      out.push({ t: `场上有 ${broken} 名玩家醉酒或中毒`, f: `场上有 ${num(broken, 0, n)} 名玩家醉酒或中毒` });
      const live = demons.filter((q) => q.alive);
      if (live.length) {
        // ⑥ 恶魔醉酒中毒
        const off = live.some((q) => g.snvBroken?.(q));
        out.push(neg(off, '有一名恶魔正处于醉酒或中毒状态', '没有恶魔处于醉酒或中毒状态'));
        // ⑦ 恶魔能不能转移座位（小恶魔自杀传位、方古跳到外来者身上、小怪宝换人照看）
        const MOVE = new Set(['imp', 'fanggu', 'lilmonsta']);
        const move = live.some((q) => MOVE.has(q.role)) || !!g.monsta;
        out.push(neg(move, '场上的恶魔具备转移座位的能力', '场上的恶魔不具备转移座位的能力'));
      }
    }
    return out;
  }

  /** lie：null 一真一假；'must' 两条都假（涡流）；'fake' 两真或两假（醉酒中毒）。 */
  savantLines(p, lie) {
    // 无神论者局：两条信息照常一真一假，「真」是假世界里的真（说书人整局假装有邪恶）
    const w = lie === 'atheist' ? this.snvWorld(p, 'atheist') : null;
    if (w) lie = null;
    // 2026-11-20 用户：夜半狂欢那局博学者第二天的真信息「死亡的玩家里有 1 名邪恶」（只死了一个人）等于点名。
    // 一下子把人圈到一两个里的真话（sharp）少给：善良落后时才多放
    const facts = this.savantFacts(w);
    const soft = facts.filter((f) => !f.sharp);
    const keep = (f, other) => (!f.sharp || !soft.some((x) => x !== other) || this.roll('savantSharp', { balance: this.balance() }, { who: p.id }) ? f : soft.find((x) => x !== other));
    const a = lie === 'must' ? facts[0] : keep(facts[0], null); // 涡流两条都假，不用挑
    let b = facts.find((f) => f !== a);
    if (lie === 'fake') b = keep(b, a); // 醉酒中毒可能两条都真
    if (lie === 'true2') { // 诡诈杰克：说真话的那位说书人，两条都给真的
      const both = [a.t, b.t];
      this.decide('savant', { who: p.id, options: [a.t, a.f, b.t, b.f], chosen: both, lie });
      this.note(`博学者 ${this.g.name(p.id)}：诡诈杰克说真话的那位，两条都是真的`);
      return both;
    }
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
      role = ROLES[target.role].team === 'minion' ? target.role : this.misregRole(target, minionRoles); // 陌客：前后一致
    }
    const decoy = this.choose('pairDecoy', others.filter((q) => q.id !== target.id), { who: p.id });
    return { pair: shuffled([target, decoy], this.rng), role };
  }

  /**
   * 气球驾驶员今晚看谁：和上一晚看到的人类型不同（首夜随便），活人死人都行。
   * 失效时随便给，多半给同一类型的人（这样他的信息链就断了）。前期多指活人：有话可聊。
   */
  balloonPick(p, last, lie, w = null) {
    const g = this.g;
    const others = g.players.filter((q) => q.id !== p.id);
    const type = (q) => (w ? worldTeam(w, q) : ROLES[q.role].team); // 无神论者局：假世界里的「爪牙」「恶魔」也是一种类型
    const live = (list) => { const a = list.filter((q) => q.alive); return a.length ? a : list; };
    if (lie && last) {
      const same = others.filter((q) => type(q) === last);
      if (same.length && this.roll('balloonSame', {}, { who: p.id })) { g.flag(p, '气球驾驶员看到了和上一晚同类型的人'); return this.choose('balloon', live(same), { who: p.id, lie }); }
    }
    let pool = last ? others.filter((q) => type(q) !== last) : others;
    // 2026-11-20 用户：夜半狂欢那局气球驾驶员第二晚就看到恶魔 8 号，信息太直接。能力正常时少给恶魔，善良领先、前两晚更少（还能给外来者、爪牙）
    const demons = pool.filter((q) => type(q) === 'demon');
    if (!lie && demons.length && demons.length < pool.length && !this.roll('balloonDemon', { balance: this.balance(), early: (g.night ?? 1) <= 2 ? 1 : 0 }, { who: p.id })) pool = pool.filter((q) => type(q) !== 'demon');
    return pool.length ? this.choose('balloon', live(pool), { who: p.id, lie: !!lie }) : null;
  }

  /**
   * 渔夫的建议（没有大模型时用）：让他去做一件事，不是告诉他一条事实（官方建议）。
   * 健康：善良落后就给能直接帮到忙的（处决某个邪恶、保住某个说真话的人），领先就给模糊一点的；失效时给坏建议。
   */
  /** 渔夫这一边的自己人和对面的人（不含渔夫自己）。邪恶渔夫的自己人不含恶魔（不点恶魔）。 */
  fishermanSides(p) {
    const g = this.g;
    const alive = g.players.filter((q) => q.alive && q.id !== p.id);
    const evil = alive.filter((q) => g.evilOf(q));
    const good = alive.filter((q) => !g.evilOf(q));
    const mine = !g.evilOf(p);
    return { mine, friends: mine ? good : evil.filter((q) => !(g.demonNow?.(q) ?? ROLES[q.role].team === 'demon')), foes: mine ? evil : good };
  }

  /**
   * 渔夫失效：说书人先定好要把他引向谁（对面阵营的一个人），AI 和规则版都用这个人。
   * 2026-11-23 用户：渔夫中毒还拿到「相信 1 号的信息，恶魔不具备转移座位的能力」——1 号是真博学者，这句还替他挑出了博学者两条里真的那条。
   * 只告诉模型「给坏建议」管不住，现在指定误导对象、建议里必须点到他、不许点自己人。
   */
  fishermanMislead(p) {
    const { foes } = this.fishermanSides(p);
    return foes.length ? this.choose('fishBad', foes, { who: p.id }) : null;
  }

  fishermanAdvice(p, lie, bad = null) {
    // 2026-11-18 用户：渔夫太直接了。集石百科：给「去做什么」的建议，范例是「你不应该相信小八」「让声称自己是外来者的玩家活着」；
    // 不单独点名恶魔，要点到邪恶玩家时和善良玩家放在一起说，让他自己去想。
    const g = this.g;
    const alive = g.players.filter((q) => q.alive && q.id !== p.id);
    const evil = alive.filter((q) => g.evilOf(q));
    const good = alive.filter((q) => !g.evilOf(q));
    const b = this.balance();
    const name = (q) => g.name(q.id);
    const mine = !g.evilOf(p); // 渔夫的阵营：建议帮他这一边
    const friends = mine ? good : evil.filter((q) => !(g.demonNow?.(q) ?? ROLES[q.role].team === 'demon')); const foes = mine ? evil : good; // 邪恶渔夫也不点恶魔（罂粟种植者在场时爪牙不认识恶魔）
    const broken = friends.filter((q) => g.snvBroken?.(q)); // 自己人里信息不可靠的（醉酒中毒）
    let text;
    if (lie && foes.length) text = `相信 ${name(bad ?? this.choose('fishBad', foes, { who: p.id }))}。`; // 失效：让他相信对面的人
    else if (!foes.length || !friends.length) text = '相信你自己的判断，不要被别人带着走。';
    else {
      const realOut = alive.some((q) => ROLES[q.role].team === 'outsider' && !g.evilOf(q)); // 官方范例里声称外来者的都是真外来者
      const kinds = ['trust', ...(realOut && mine ? ['outsider'] : []), ...(broken.length ? ['distrust'] : [])]; // 渔夫页：「两人之中有恶魔」这类不是建议，不给
      const k = this.choose('fishKind', kinds, { who: p.id });
      if (k === 'distrust') text = `你不应该相信 ${name(this.choose('fishDistrust', broken, { who: p.id }))}。`;
      else if (k === 'pair') {
        const a = this.choose('fishFoe', foes.filter((q) => ROLES[q.role].team !== 'demon').length ? foes.filter((q) => ROLES[q.role].team !== 'demon') : foes, { who: p.id });
        const c = this.choose('fishMate', friends, { who: p.id });
        const [x, y] = [a, c].sort((m, n) => m.seat - n.seat);
        text = `多留意 ${name(x)} 和 ${name(y)} 的说法，他们之中有人在骗你。`;
      } else if (k === 'outsider') text = '让声称自己是外来者的玩家活着。';
      else text = `相信 ${name(this.choose('fishTrust', friends, { who: p.id }))}。`;
    }
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
      role = (w.pairRole ??= {})[key] ?? this.choose('pairRole', pool.filter((r) => r !== target.role && r !== p.role && r !== p.shownRole), { who: p.id }); // 不报他自己的角色
      w.pairRole[key] = role;
      g.flag(p, `${by}看到了假的${kind === 'outsider' ? '外来者' : '镇民'} ${g.name(target.id)}`);
    } else {
      const real = others.filter((q) => (kind === 'townsfolk' ? g.seenTownsfolk(q, by) : ROLES[q.role].team === 'outsider' || (q.role === 'spy' && g.misregSNV(q, by))));
      if (!real.length) return null;
      target = this.choose('pairTarget', real, { who: p.id });
      role = ROLES[target.role].team === kind ? target.role : this.misregRole(target, pool); // 间谍：前后一致、配合伪装
    }
    const decoy = this.choose('pairDecoy', others.filter((q) => q.id !== target.id), { who: p.id });
    return { pair: shuffled([target, decoy], this.rng), role };
  }

  /** 送葬者/守鸦人失效：按假世界说一个角色（假恶魔说成恶魔，假爪牙说成爪牙，其余说成善良角色），不说真的。 */
  falseRoleSNV(p, target, w) {
    const g = this.g;
    const kind = w?.demon === target.id ? ['demon'] : w?.evil.has(target.id) ? ['minion'] : ['townsfolk', 'outsider'];
    const own = (r) => r === p.role || r === p.shownRole; // 假信息不报他自己的角色：一看就是假的，全员失忆时还等于告诉他自己是谁
    const pool = rolesOf(g.script).filter((r) => kind.includes(ROLES[r].team) && r !== target.role && !own(r));
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
    // 官方：「说书人很可能向你展示了一名爪牙玩家而非恶魔玩家」。失效时假世界里的"恶魔"同样少给
    const demonId = lie ? this.snvWorld(p, lie).demon : null;
    const isDemon = (q) => (lie ? q.id === demonId : ROLES[q.role].team === 'demon');
    const minions = live(evil).filter((q) => !isDemon(q));
    const pool = minions.length && minions.length < live(evil).length && this.roll('nobleMinion', { balance: this.balance() }, { who: p.id, lie: !!lie }) ? minions : live(evil);
    const e = this.choose('nobleEvil', pool, { who: p.id, lie: !!lie });
    const gs = shuffled(live(good), this.rng).slice(0, 2);
    if (gs.length < 2) gs.push(...shuffled(good.filter((q) => !gs.includes(q)), this.rng).slice(0, 2 - gs.length));
    this.decide('nobleGood', { who: p.id, options: good.map(idOf), chosen: gs.map(idOf) });
    return shuffled([e, ...gs], this.rng);
  }

  /**
   * 修行者：最近的邪恶玩家在顺时针（+1）还是逆时针（-1）。两边一样近时说书人定（官方），往落后的一方偏：
   * 善良落后多指恶魔那一侧，善良领先多指爪牙那一侧。失效时按假世界算，假世界里的"恶魔"一样对待。
   */
  shugenjaSide(p, lie) {
    const g = this.g; const n = g.players.length;
    const w = lie ? this.snvWorld(p, lie) : null;
    const isEvil = w ? (q) => w.evil.has(q.id) : (q) => g.seenEvil(q, '修行者');
    const isDemon = w ? (q) => q.id === w.demon : (q) => ROLES[q.role].team === 'demon';
    const near = (dir) => { for (let k = 1; k < n; k++) { const q = g.players[(p.seat - 1 + dir * k + n * k) % n]; if (q.id !== p.id && isEvil(q)) return { k, q }; } return { k: Infinity, q: null }; };
    const cw = near(1); const ccw = near(-1);
    const b = this.balance();
    const side = cw.k === ccw.k
      ? this.draw('shugenjaTie', [1, -1], (dir) => ({ pressure: (dir === 1 ? cw : ccw).q && isDemon((dir === 1 ? cw : ccw).q) ? -b : b }), { who: p.id, b, lie: !!lie })
      : cw.k < ccw.k ? 1 : -1;
    if (lie) g.flag(p, '修行者按假世界得到了方向');
    return side;
  }

  /**
   * 农夫夜里死了，谁接班：存活的善良玩家（新手稍微优先：多一个有能力的人）。按局势挑（官方农夫页）：
   * 善良落后多给外来者（白得一个能力），其次能力已经用完的人；善良领先多给还有持续能力的强力角色（换掉等于削弱善良）。
   */
  farmerHeir(farmer) {
    const g = this.g;
    const good = g.players.filter((q) => q.alive && q.id !== farmer.id && !g.evilOf(q));
    if (!good.length) return null;
    const b = this.balance();
    const gain = (q) => {
      const r = ROLES[g.abilityOf?.(q) ?? q.role] ?? ROLES[q.role];
      if (r.team === 'outsider') return 1;
      const spent = g.used?.[q.id] || (r.firstNight && !r.otherNight && !r.day);
      return spent ? 0.5 : -0.5;
    };
    const who = this.draw('farmerHeir', good, (q) => ({ lift: gain(q) * -b }), { b });
    this.note(`农夫 ${g.name(farmer.id)} 夜里死了，${g.name(who.id)} 变成农夫`);
    return who;
  }

  /**
   * 鹰身女妖的疯狂没做到：杀不杀、杀谁。"可能"死亡：多半杀疯狂的那个；善良领先时偶尔两个都杀。
   * 会直接定胜负的不杀（和疯狂处决一样，别让这种判定决定一局）。返回要死的人（活人）。
   */
  harpyVictims(mad, second) {
    const g = this.g;
    // 官方：「说书人不太可能会通过你的能力杀死恶魔」。恶魔没做到疯狂就整个放过（别反过来杀被他指认的善良玩家）
    if (ROLES[mad.role].team === 'demon') { this.note(`${g.name(mad.id)} 没有疯狂地证明，但他是恶魔：鹰身女妖的能力不杀恶魔，放过`); return []; }
    const live = [mad, second].filter((q) => q?.alive && ROLES[q.role].team !== 'demon');
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

  /**
   * 女祭司：说书人认为她最该和谁聊。往落后的一方偏：善良落后时多指拿着真信息的善良玩家（帮她们对上信息），
   * 偶尔直接指恶魔；善良领先时多指一个满嘴假话的邪恶或随便一个人。失效时随便指。
   */
  priestessPick(p, lie) {
    const g = this.g;
    const others = g.alive().filter((q) => q.id !== p.id);
    if (!others.length) return null;
    if (lie) return this.choose('priestessFake', others, { who: p.id });
    const b = this.balance();
    const evil = others.filter((q) => g.evilOf(q));
    const goodInfo = others.filter((q) => !g.evilOf(q) && ROLES[q.role].team === 'townsfolk' && !g.snvBroken?.(q));
    const pool = b < -0.15 ? (goodInfo.length && this.roll('priestessGood', {}, { who: p.id }) ? goodInfo : evil.length ? evil : others)
      : b > 0.15 ? (evil.length && this.roll('priestessEvil', {}, { who: p.id }) ? evil : others)
        : goodInfo.length ? goodInfo : others; // 势均力敌：女祭司页要挑「对女祭司和善良阵营更加有利」的人
    return this.choose('priestess', pool.length ? pool : others, { who: p.id, b });
  }

  /** 失效的侍女：给一个错的数字。 */
  fakeChambermaid(p, truth) {
    const opts = [0, 1, 2].filter((n) => n !== truth);
    const n = this.choose('fakeChambermaid', opts, { who: p.id, truth });
    this.note(`失效的侍女 ${this.g.name(p.id)}：真实 ${truth}，告诉她 ${n}`);
    return n;
  }
}
