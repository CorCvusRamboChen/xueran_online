// 娱乐模式「暗印」（原创）：每天天亮，钟声响过，每个活着的人后颈烙上一个新的印记（♠♥♦♣，极少数是鬼牌），自己看不到。
// 白天只有和别人关在同一栋房子里，才能绕到他身后看（每天最多看两个人），而且是「对视」：你看他的同时他也看到你的。
// 路上从别人身后经过，有一定概率瞟到他的印记。别人怎么告诉你、是真是假，由他；每人每天还能塞一封只写一个花色的匿名信。
// 回到广场圆桌讨论（没有提名，也没有投票），然后各自回家。夜里在家写下自己的印记：写错或者没写，印记在屋里炸开。
//
// 坏人人数照血染的人数表（爪牙 + 恶魔）：1 个头头，其余是手下；7 人及以上坏人互相认识。
// 头头整局有 2 次机会，自己挑哪天得知当天自己的印记；手下一次都没有。
// 坏人看某人背后的那一刻可以「调包」：把他今天的印记换成指定的一个（每个坏人每两天最多一次，同一个人整局只被调包一次，不能调包自己人）。
// 坏人一天里被三个不同的人看过背后，当晚他的印记会发光，所有人都看得到。
// 坏人全死，好人赢；活着的坏人追平活着的好人，坏人赢。
//
// 这里只管规则和状态，不碰计时、语音、地图（那些在 server/mark.js）。和血染的 Game 共用几个字段名
// （players / get / name / phase / day / night / alive / visAlive / evilOf / nightPrompts / missingChoices / toJSON）。
import { DISTRIBUTION } from './roles.js';

export const SUITS = ['spade', 'heart', 'diamond', 'club'];
export const JOKER = 'joker';
export const MARKS = [...SUITS, JOKER]; // 夜里能写的：四个花色 + 鬼牌
export const SUIT_INFO = {
  spade: { ch: '♠', name: '黑桃', color: 'black' },
  heart: { ch: '♥', name: '红心', color: 'red' },
  diamond: { ch: '♦', name: '方块', color: 'red' },
  club: { ch: '♣', name: '梅花', color: 'black' },
  joker: { ch: '鬼', name: '鬼牌', color: 'joker' },
  // 雾天看到的只是颜色
  red: { ch: '红', name: '红色', color: 'red', fog: true },
  black: { ch: '黑', name: '黑色', color: 'black', fog: true },
};
export const suitText = (s) => (SUIT_INFO[s] ? (SUIT_INFO[s].fog ? SUIT_INFO[s].name : `${SUIT_INFO[s].ch}${SUIT_INFO[s].name}`) : '?');
/** 一个印记的颜色：red / black；鬼牌就是 joker。 */
export const colorOf = (s) => (s === JOKER ? JOKER : SUIT_INFO[s]?.color ?? null);

export const MARK_ROLES = {
  mk_town: { name: '好人', good: true,
    ability: '每天天亮，你后颈会烙上一个新的印记，你自己看不到。白天和别人进同一栋房子，请他帮你看——他可能骗你，你的印记也可能已经被坏人调包。入夜在家写下自己的印记，写错就会爆炸。活下去，熬到坏人全死。' },
  mk_boss: { name: '头头', good: false,
    ability: '你是坏人的头头。整局有 2 次机会，自己挑哪天，得知当天自己的印记。看别人背后的那一刻可以「调包」，把他今天的印记换掉（每两天最多一次，同一个人只能被调包一次，不能调包自己人）。一天里被三个人看过背后，当晚你的印记会发光，暴露给所有人。' },
  mk_hand: { name: '手下', good: false,
    ability: '你是坏人的手下。你和好人一样看不到自己的印记，只能靠别人告诉你。看别人背后的那一刻可以「调包」，把他今天的印记换掉（每两天最多一次，同一个人只能被调包一次，不能调包自己人）。一天里被三个人看过背后，当晚你的印记会发光，暴露给所有人。' },
};
export const isEvilRole = (r) => r === 'mk_boss' || r === 'mk_hand';

export const MARK_MIN = 5;
export const MARK_MAX = 15;
/** 坏人几个：照血染人数表的爪牙 + 恶魔（5–9 人 2 个，10–12 人 3 个，13–15 人 4 个）。 */
export const evilCount = (n) => (DISTRIBUTION[n] ? DISTRIBUTION[n][2] + DISTRIBUTION[n][3] : 0);
/** 7 人及以上坏人互相认识（照血染的口径）。 */
export const evilKnow = (n) => n >= 7;

/** 几个可调的数。 */
export const MARK_RULES = {
  peeksPerDay: 2,    // 每天最多主动看几个人的背后
  bossReveals: 2,    // 头头整局能看自己几次
  swapGap: 2,        // 调包后隔几天才能再调（2 = 每两天最多一次）
  exposeAt: 3,       // 坏人一天被几个不同的人看过背后就发光
  jokerChance: 0.04, // 每人每天抽到鬼牌的概率
  fogChance: 0.25,   // 第 2 天起每天起雾的概率
  lastWordMax: 60,   // 遗言最多几个字
};

const shuffleArr = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** 这一局的身份（没打乱）。 */
export function markRoles(n) {
  const e = evilCount(n);
  return [...Array(n - e).fill('mk_town'), 'mk_boss', ...Array(e - 1).fill('mk_hand')];
}

const REASONS = { good: '坏人全死了', evil: '活着的坏人追平了活着的好人' };

export class MarkGame {
  /** players：[{ id, name }]，按座位排好。roles：可选，指定每个座位的身份（测试用）。rules：覆盖 MARK_RULES（测试用）。 */
  constructor(players, { roles, rng = Math.random, rules = {} } = {}) {
    if (!players) return; // fromJSON
    const n = players.length;
    if (n < MARK_MIN || n > MARK_MAX) throw new Error(`暗印要 ${MARK_MIN}–${MARK_MAX} 人`);
    this.id = Math.random().toString(36).slice(2, 10);
    this.rules = { ...MARK_RULES, ...rules };
    const list = roles ?? shuffleArr(markRoles(n), rng);
    this.players = players.map((p, i) => ({ id: p.id, name: p.name, seat: i + 1, role: list[i], alive: true, diedAt: null, cause: null }));
    this.stage = 'setup';   // setup → morning（天亮）→ roam（自由活动）→ table（圆桌讨论）→ dusk（回家）→ night → morning …… / ended
    this.day = 0;
    this.night = 0;
    this.suits = {};        // 今天每个活人后颈的印记（调包后是换过的）
    this.dealt = {};        // 每天天亮发的：day → { id: mark }
    this.suitLog = {};      // 每天入夜时的（算上调包）：day → { id: mark }
    this.fog = {};          // 哪天起雾：day → true
    this.sightings = [];    // 看到谁的背后：{ day, by, target, seen, kind: 'peek' 主动看 | 'mutual' 对视 | 'glimpse' 路上瞟到, at }
    this.glimpsed = [];     // 已经掷过「瞟到」的：`${day}:${by}:${target}`（同一天同一对只掷一次）
    this.tells = [];        // 当面告诉：{ day, from, to, suit, at }
    this.letters = [];      // 匿名信：{ day, from, to, suit, at }（收信人不知道是谁写的）
    this.swaps = [];        // 调包：{ day, by, target, from, to }
    this.reveals = [];      // 头头看自己：{ day, by, suit }
    this.guesses = {};      // 今晚写下的：id → mark
    this.blast = null;      // 今晚结算（天亮才公布）：{ ids, why, guesses, fooled }
    this.nights = [];       // 每晚的死者：{ night, dead, swaps }（swaps：那天被调包的人数，天亮公布）
    this.fooledLog = {};    // 炸死的人被谁骗死：id → [{ by, how }]（终局复盘、战绩用）
    this.glow = {};         // 暴露：day → [{ id, suit }]（入夜时公开）
    this.done = [];         // 圆桌上表示「说完了」的人
    this.lastWords = [];    // 遗言：{ day, by, text } 或 { day, by, reveal: { target, day, seen } }
    this.winner = null;     // 'good' | 'evil'
    this.winReason = null;
    this.timeline = [];
  }

  get mark() { return true; }
  get script() { return 'mark'; }
  get engine() { return 'mark'; }
  get phase() { return this.stage === 'night' ? 'night' : this.stage === 'ended' ? 'ended' : this.stage === 'setup' ? 'setup' : 'day'; }
  get n() { return this.players.length; }
  get foggy() { return !!this.fog[this.day]; }
  get(id) { return this.players.find((p) => p.id === id); }
  name(id) { const p = this.get(id); return p ? `${p.seat}号 ${p.name}` : '?'; }
  alive() { return this.players.filter((p) => p.alive); }
  aliveIds() { return this.alive().map((p) => p.id); }
  aliveCount() { return this.alive().length; }
  visAlive(p) { return !!p?.alive; }
  visAliveCount() { return this.aliveCount(); }
  evilOf(p) { return isEvilRole(p.role); }
  isEvil(id) { return isEvilRole(this.get(id)?.role); }
  evilIds() { return this.players.filter((p) => isEvilRole(p.role)).map((p) => p.id); }
  bossId() { return this.players.find((p) => p.role === 'mk_boss')?.id ?? null; }
  /** 坏人知道的同伴（6 人及以下互相不认识）。 */
  allies(id) { return this.isEvil(id) && evilKnow(this.n) ? this.evilIds().filter((x) => x !== id) : []; }
  nightPrompts() { return []; } // 房间里通用的代码会问：暗印夜里没有血染式的选人
  missingChoices() { return []; }
  daytime() { return ['morning', 'roam', 'table'].includes(this.stage); }

  require(...stages) {
    if (!stages.includes(this.stage)) throw new Error({ roam: '只有白天自由活动时能这么做', table: '现在不是圆桌讨论的时候', night: '现在不是夜里' }[stages[0]] ?? '现在不能这么做');
  }
  requireAlive(id, what = '你') {
    const p = this.get(id);
    if (!p) throw new Error('你不是这局的玩家');
    if (!p.alive) throw new Error(what === '你' ? '你已经死了' : `${what}已经死了`);
  }

  // ───────────── 天亮：发新的印记 ─────────────
  begin(rng = Math.random) {
    if (this.stage !== 'setup') return;
    this.day = 1;
    this.deal(rng);
    this.stage = 'morning';
    this.note(`开局：${this.players.map((p) => `${p.seat}号 ${p.name}（${MARK_ROLES[p.role].name}）`).join('；')}`);
  }

  /** 每个活人换一个新的随机印记（极少数是鬼牌）；第 2 天起有时起雾。 */
  deal(rng = Math.random) {
    this.suits = Object.fromEntries(this.alive().map((p) => [p.id, rng() < this.rules.jokerChance ? JOKER : SUITS[Math.floor(rng() * SUITS.length)]]));
    this.dealt[this.day] = { ...this.suits };
    this.suitLog[this.day] = { ...this.suits };
    if (this.day >= 2 && rng() < this.rules.fogChance) this.fog[this.day] = true;
    this.done = [];
  }

  /** 看到的样子：雾天只看得出红黑（鬼牌一眼就认得出）。 */
  look(mark) { return this.foggy && mark !== JOKER ? colorOf(mark) : mark; }

  // ───────────── 白天：自由活动 ─────────────
  openRoam() { if (this.stage === 'morning') this.stage = 'roam'; }

  /** 今天这个人主动看过的人。 */
  peeked(by) { return [...new Set(this.sightings.filter((x) => x.day === this.day && x.by === by && x.kind === 'peek').map((x) => x.target))]; }
  peeksLeft(by) { return Math.max(0, this.rules.peeksPerDay - this.peeked(by).length); }
  /** 那天看到过 target 背后的人（主动看、对视、路上瞟到都算）。 */
  viewers(target, day = this.day) { return [...new Set(this.sightings.filter((x) => x.day === day && x.target === target).map((x) => x.by))]; }
  /** 今天在屋里看过 target 的背后（主动看或对视）。 */
  saw(by, target) { return this.sightings.some((x) => x.day === this.day && x.by === by && x.target === target && x.kind !== 'glimpse'); }

  /**
   * 看后颈（房间负责检查两人在同一栋房子里）：对视——你看到他的，他同时看到你的。每天最多主动看两个人，
   * 同一个人再看一次不算次数（看到的是现在的，可能已经被调包了）。返回 { seen, mutual }。
   */
  peek(by, target, at = Date.now()) {
    this.require('roam');
    this.requireAlive(by);
    if (by === target) throw new Error('自己看不到自己的后颈');
    this.requireAlive(target, '他');
    const again = this.peeked(by).includes(target);
    if (!again && this.peeksLeft(by) <= 0) throw new Error(`今天已经看过 ${this.rules.peeksPerDay} 个人了`);
    const seen = this.look(this.suits[target]);
    const mutual = this.look(this.suits[by]);
    this.sightings.push({ day: this.day, by, target, seen, kind: 'peek', at });
    this.sightings.push({ day: this.day, by: target, target: by, seen: mutual, kind: 'mutual', at });
    if (!again) this.note(`${this.name(by)} 看了 ${this.name(target)} 的后颈（${suitText(seen)}），同时被他看到（${suitText(mutual)}）`);
    return { seen, mutual };
  }

  /** 路上从 target 身后经过：同一天同一对只掷一次，命中（rng() < chance）就瞟到。返回看到的样子；没瞟到 / 掷过了返回 null。 */
  glimpse(by, target, rng = Math.random, chance = 0.3) {
    if (this.stage !== 'roam' || by === target || !this.get(by)?.alive || !this.get(target)?.alive) return null;
    const key = `${this.day}:${by}:${target}`;
    if (this.glimpsed.includes(key)) return null;
    this.glimpsed.push(key);
    if (rng() >= chance) return null;
    const seen = this.look(this.suits[target]);
    this.sightings.push({ day: this.day, by, target, seen, kind: 'glimpse', at: Date.now() });
    this.note(`${this.name(by)} 从 ${this.name(target)} 身后经过，瞟到了 ${suitText(seen)}`);
    return seen;
  }

  /** 当面告诉别人他的印记（真假由自己定，可以说鬼牌）。一天里对同一个人说第二次，以最后一次为准。 */
  tell(from, to, suit) {
    this.require('roam');
    this.requireAlive(from);
    if (from === to) throw new Error('这是在告诉别人');
    this.requireAlive(to, '他');
    if (!MARKS.includes(suit)) throw new Error('选一个花色');
    this.tells = this.tells.filter((t) => !(t.day === this.day && t.from === from && t.to === to));
    const real = this.suits[to];
    this.tells.push({ day: this.day, from, to, suit, lie: suit !== real, at: Date.now() }); // lie：说的那一刻是不是假话（之后被调包不算谎；只进终局复盘和战绩）
    this.note(`${this.name(from)} 告诉 ${this.name(to)}：你是 ${suitText(suit)}${suit === real ? '（真话）' : `（假话，其实是 ${suitText(real)}）`}`);
  }

  /** 匿名信：每人每天一封，只写一个花色（白天任何时候）。 */
  letter(from, to, suit) {
    if (!this.daytime()) throw new Error('只有白天能塞信');
    this.requireAlive(from);
    if (from === to) throw new Error('信是塞给别人的');
    this.requireAlive(to, '他');
    if (!MARKS.includes(suit)) throw new Error('信上只能写一个花色');
    if (this.letters.some((x) => x.day === this.day && x.from === from)) throw new Error('今天已经塞过一封信了');
    this.letters.push({ day: this.day, from, to, suit, lie: suit !== this.suits[to], at: Date.now() });
    this.note(`${this.name(from)} 给 ${this.name(to)} 塞了匿名信：${suitText(suit)}${suit === this.suits[to] ? '（真）' : '（假）'}`);
  }

  /** 今天当面告诉这个人的（知道是谁说的）。 */
  heard(id, day = this.day) { return this.tells.filter((t) => t.to === id && t.day === day); }
  /** 收到的匿名信（去掉写信人）。 */
  mail(id) { return this.letters.filter((t) => t.to === id).map(({ from, lie, ...x }) => x); }

  // ───────────── 坏人：调包、头头看自己 ─────────────
  /** 能不能调包 target（不检查在不在同一栋房子）。不能就返回原因。 */
  swapBlock(by, target) {
    if (this.stage !== 'roam') return '只有白天自由活动时能调包';
    if (!this.isEvil(by)) return '只有坏人能调包';
    if (!this.get(by)?.alive) return '你已经死了';
    if (!this.get(target)?.alive) return '他已经死了';
    if (!this.saw(by, target)) return '只能在看他背后的那一刻调包';
    if (this.isEvil(target)) return '不能调包自己人';
    if (this.swaps.some((s) => s.target === target)) return '他已经被调包过了，一个人只能被调包一次';
    const last = this.swaps.filter((s) => s.by === by).at(-1);
    if (last && this.day - last.day < this.rules.swapGap) return last.day === this.day ? '你今天已经调包过了' : '你昨天调包过，今天不能再调';
    return null;
  }

  swap(by, target, suit) {
    const why = this.swapBlock(by, target);
    if (why) throw new Error(why);
    if (!SUITS.includes(suit)) throw new Error('换成哪个花色？');
    const from = this.suits[target];
    if (suit === from) throw new Error('他现在就是这个花色');
    this.suits[target] = suit;
    this.suitLog[this.day][target] = suit;
    this.swaps.push({ day: this.day, by, target, from, to: suit });
    this.note(`${this.name(by)} 把 ${this.name(target)} 的印记从 ${suitText(from)} 调包成了 ${suitText(suit)}`);
  }

  revealsLeft(id) { return this.get(id)?.role === 'mk_boss' ? Math.max(0, this.rules.bossReveals - this.reveals.filter((r) => r.by === id).length) : 0; }
  /** 头头看自己今天的印记（整局 2 次，白天或夜里写之前；同一天再看不算次数）。返回印记。 */
  reveal(id) {
    if (this.get(id)?.role !== 'mk_boss') throw new Error('只有头头能看自己的印记');
    this.requireAlive(id);
    if (!this.daytime() && !(this.stage === 'night' && !this.blast && !(id in this.guesses))) throw new Error('现在不能看');
    const today = this.reveals.find((r) => r.by === id && r.day === this.day);
    if (today) return today.suit;
    if (!this.revealsLeft(id)) throw new Error('两次机会已经用完了');
    const suit = this.suits[id];
    this.reveals.push({ day: this.day, by: id, suit });
    this.note(`头头 ${this.name(id)} 看了自己今天的印记：${suitText(suit)}`);
    return suit;
  }

  // ───────────── 圆桌讨论（没有提名，也没有投票） ─────────────
  openTable() { if (this.stage === 'roam' || this.stage === 'morning') this.stage = 'table'; }
  /** 表示说完了（再点一次撤回）。返回是不是所有活人都说完了。 */
  finish(id, on = true) {
    this.require('table');
    this.requireAlive(id);
    this.done = on ? [...new Set([...this.done, id])] : this.done.filter((x) => x !== id);
    return this.aliveIds().every((x) => this.done.includes(x));
  }

  /** 回家。坏人一天里被三个不同的人看过背后：他今晚的印记发光，所有人都看得到。返回发光的 [{ id, suit }]。 */
  dusk() {
    if (!this.daytime()) return this.glow[this.day] ?? [];
    this.stage = 'dusk';
    const glow = this.alive().filter((p) => isEvilRole(p.role) && this.viewers(p.id).length >= this.rules.exposeAt).map((p) => ({ id: p.id, suit: this.suits[p.id] }));
    if (glow.length) {
      this.glow[this.day] = glow;
      this.note(`暴露：${glow.map((x) => `${this.name(x.id)}（${suitText(x.suit)}）`).join('、')} 的印记在发光`);
    }
    return glow;
  }

  // ───────────── 夜里：写下自己的印记 ─────────────
  startNight() {
    if (this.stage !== 'dusk') return;
    this.night = this.day;
    this.guesses = {};
    this.blast = null;
    this.stage = 'night';
  }

  guess(id, suit) {
    this.require('night');
    if (this.blast) throw new Error('太晚了，钟已经敲过了');
    this.requireAlive(id);
    if (!MARKS.includes(suit)) throw new Error('选一个花色（或鬼牌）');
    if (id in this.guesses) throw new Error('你已经写下了');
    this.guesses[id] = suit;
    return this.missingGuesses().length === 0;
  }
  missingGuesses() { return this.stage === 'night' && !this.blast ? this.aliveIds().filter((id) => !(id in this.guesses)) : []; }

  /** 谁害死了他：写的正好是谁当面说的假话 / 假的匿名信 / 调包之前的样子（说的时候是真话、后来被调包的不算谎）。返回 [{ by, how: 'tell' | 'letter' | 'swap' }]。 */
  fooledBy(id, guess) {
    const real = this.suits[id];
    if (!guess || guess === real) return [];
    const out = [];
    for (const t of this.heard(id)) if (t.suit === guess && t.lie !== false) out.push({ by: t.from, how: 'tell' });
    for (const t of this.letters.filter((x) => x.to === id && x.day === this.day)) if (t.suit === guess && t.lie !== false) out.push({ by: t.from, how: 'letter' });
    for (const s of this.swaps.filter((x) => x.target === id && x.day === this.day)) if (s.from === guess) out.push({ by: s.by, how: 'swap' });
    return out;
  }

  /** 午夜钟响：写错的、没写的，印记炸开。死者天亮才公布。 */
  resolveNight() {
    this.require('night');
    if (this.blast) return this.blast;
    const why = {};
    const fooled = {};
    for (const id of this.aliveIds()) {
      if (!(id in this.guesses)) why[id] = 'timeout';
      else if (this.guesses[id] !== this.suits[id]) { why[id] = 'wrong'; fooled[id] = this.fooledBy(id, this.guesses[id]); }
    }
    this.blast = { ids: Object.keys(why), why, guesses: { ...this.guesses }, fooled };
    for (const [id, w] of Object.entries(why)) this.note(`第 ${this.night} 夜：${this.name(id)} ${w === 'timeout' ? '没写下印记' : `写了 ${suitText(this.guesses[id])}，其实是 ${suitText(this.suits[id])}`}，爆炸`);
    return this.blast;
  }

  /** 天亮：公布昨晚的死者，判胜负；没结束就进入新的一天、发新的印记。返回昨晚的死者。 */
  dawn(rng = Math.random) {
    this.require('night');
    const b = this.resolveNight();
    for (const id of b.ids) { this.kill(id, 'blast', `n${this.night}`); this.fooledLog[id] = b.fooled[id] ?? []; }
    this.nights.push({ night: this.night, dead: [...b.ids], swaps: this.swaps.filter((s) => s.day === this.night).length });
    this.checkWin();
    if (this.winner) return b.ids;
    this.day += 1;
    this.deal(rng);
    this.stage = 'morning';
    return b.ids;
  }

  // ───────────── 遗言 ─────────────
  /** 昨晚炸死、今天白天还没留遗言的人。 */
  canLastWord(id) {
    const last = this.nights.at(-1);
    return !!last && last.night === this.day - 1 && last.dead.includes(id) && this.daytime() && !this.lastWords.some((w) => w.by === id);
  }
  /** 留遗言：一句话，或者公开一个自己看过的人那天的印记（reveal：{ target, day }）。 */
  lastWord(id, { text, reveal } = {}) {
    if (!this.canLastWord(id)) throw new Error('现在不能留遗言（只有昨晚炸死的人，在今天白天留一次）');
    if (reveal) {
      const s = this.sightings.filter((x) => x.by === id && x.target === reveal.target && x.day === Number(reveal.day)).at(-1);
      if (!s) throw new Error('只能公开你看过的人');
      const w = { day: this.day, by: id, reveal: { target: s.target, day: s.day, seen: s.seen } };
      this.lastWords.push(w);
      this.note(`${this.name(id)} 的遗言：公开 ${this.name(s.target)} 第 ${s.day} 天的印记 ${suitText(s.seen)}`);
      return w;
    }
    const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, this.rules.lastWordMax);
    if (!t) throw new Error('写一句话，或者公开一个你看过的人');
    const w = { day: this.day, by: id, text: t };
    this.lastWords.push(w);
    this.note(`${this.name(id)} 的遗言：${t}`);
    return w;
  }

  kill(id, cause, at) {
    const p = this.get(id);
    if (!p?.alive) return;
    p.alive = false;
    p.cause = cause;
    p.diedAt = at;
  }

  /** 坏人全死好人赢；活着的坏人 ≥ 活着的好人，坏人赢（两个同时成立按前一个算，比如全员炸死）。 */
  checkWin() {
    if (this.winner) return this.winner;
    const e = this.alive().filter((p) => isEvilRole(p.role)).length;
    const t = this.aliveCount() - e;
    if (e === 0) this.end('good', REASONS.good);
    else if (e >= t) this.end('evil', REASONS.evil);
    return this.winner;
  }

  end(team, reason) {
    this.winner = team;
    this.winReason = reason;
    this.stage = 'ended';
    this.note(`${team === 'good' ? '好人' : '坏人'}获胜：${reason}`);
  }

  /** 每人活到第几天（第 N 夜炸死算活到第 N 天；活到终局算最后一天）和被谁骗死（战绩用）。 */
  survival() {
    return this.players.map((p) => ({
      id: p.id, seat: p.seat, name: p.name, role: p.role, evil: isEvilRole(p.role), alive: p.alive,
      day: p.alive ? this.day : Number(String(p.diedAt).slice(1)) || this.day,
      fooledBy: (this.fooledLog[p.id] ?? []).map((f) => ({ ...f, name: this.get(f.by)?.name ?? '?' })),
    }));
  }

  note(text) { this.timeline.push({ at: Date.now(), day: this.day, text }); }

  toJSON() {
    const { signals, records, ...rest } = this; // 房间接上的回调不存
    return { ...rest, mark: true };
  }

  static fromJSON(s) {
    const g = new MarkGame();
    const { mark, ...rest } = s;
    Object.assign(g, rest);
    g.rules = { ...MARK_RULES, ...rest.rules };
    return g;
  }
}

/**
 * 生还排行：把存下来的每局（{ endedAt, players: survival() }）按真人玩家汇总（机器人不算）。
 * 每人：打了几局、平均活到第几天、活到终局几次、坏人 / 好人各几局，被谁骗死过（{ 名字: 次数 }，匿名信、调包分开记）。
 * 按平均活到第几天从高到低排（局数少于 minGames 的排在后面）。
 */
export function summarizeMark(games, { minGames = 3 } = {}) {
  const by = new Map();
  for (const g of games) {
    for (const p of g.players ?? []) {
      if (!p.id || /^bot-/.test(p.id)) continue;
      const s = by.get(p.id) ?? { id: p.id, name: p.name, games: 0, days: 0, survived: 0, evil: 0, fooledBy: {}, last: 0 };
      if ((g.endedAt ?? 0) >= s.last) { s.name = p.name; s.last = g.endedAt ?? 0; }
      s.games += 1;
      s.days += p.day ?? 0;
      if (p.alive) s.survived += 1;
      if (p.evil) s.evil += 1;
      for (const f of p.fooledBy ?? []) {
        const k = f.how === 'letter' ? '匿名信' : f.how === 'swap' ? `${f.name}（调包）` : f.name;
        s.fooledBy[k] = (s.fooledBy[k] ?? 0) + 1;
      }
      by.set(p.id, s);
    }
  }
  return [...by.values()]
    .map(({ last, ...s }) => ({ ...s, avgDay: Math.round((s.days / s.games) * 10) / 10 }))
    .sort((a, b) => Number(b.games >= minGames) - Number(a.games >= minGames) || b.avgDay - a.avgDay || b.games - a.games);
}
