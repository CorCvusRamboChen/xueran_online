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
// 每个判定都记进手记（journal），终局时公开。
import { ROLES, TOWNSFOLK, OUTSIDERS, MINIONS, isEvilRole } from './roles.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
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
    this.worlds = new Map();   // 玩家 id → 他看到的假世界
    this.misCount = new Map(); // "第几夜:玩家" → 这晚被错误登记了几次
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
      worlds: [...this.worlds.entries()].map(([id, w]) => [id, { demon: w.demon, evil: [...w.evil], roles: [...w.roles.entries()] }]),
      misCount: [...this.misCount.entries()],
    };
  }

  load(data) {
    this.journal = data?.journal ?? [];
    this.worlds = new Map((data?.worlds ?? []).map(([id, w]) => [id, { demon: w.demon, evil: new Set(w.evil), roles: new Map(w.roles) }]));
    this.misCount = new Map(data?.misCount ?? []);
  }

  // ───────────── 开局 ─────────────

  /** 红鲱鱼：一名善良玩家。偏向镇民（被怀疑更有戏剧性），不选占卜师自己。 */
  redHerring() {
    const good = this.g.players.filter((p) => !isEvilRole(p.role));
    const townsfolk = good.filter((p) => ROLES[p.role].team === 'townsfolk' && p.role !== 'fortuneteller');
    const pool = townsfolk.length ? townsfolk : good;
    const p = pick(pool, this.rng);
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
    const chance = clamp(0.3 + 0.3 * b, 0.05, 0.65);
    const yes = this.rng() < chance;
    if (yes) {
      this.misCount.set(key, used + 1);
      const as = p.role === 'recluse' ? '邪恶' : '善良';
      this.note(`${by}时，把${ROLES[p.role].name} ${this.g.name(p.id)} 登记成${as}`, b);
    }
    return yes;
  }

  /** 陌客/间谍被看角色时错误登记成什么。 */
  misregRole(p) {
    return p.role === 'recluse' ? pick([...MINIONS, 'imp'], this.rng) : pick([...TOWNSFOLK, ...OUTSIDERS], this.rng);
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
    const target = pick(wrong.length ? wrong : cands, this.rng);
    const role = w.roles.get(target.id);
    this.note(`${this.why(p)} ${g.name(p.id)}：假信息，指向 ${g.name(target.id)} 是${ROLES[role].name}（真实是${ROLES[target.role].name}）`);
    return { target, role };
  }

  /** 厨师：假世界里相邻的邪恶有几对。 */
  fakeChef(p, truth) {
    const g = this.g; const n = g.players.length;
    const count = (w) => g.players.reduce((k, q, i) => k + (w.evil.has(q.id) && w.evil.has(g.players[(i + 1) % n].id) ? 1 : 0), 0);
    const v = count(this.world(p, (w) => count(w) !== truth));
    this.note(`${this.why(p)} ${g.name(p.id)}：按假世界报 ${v} 对（真实是 ${truth}）`);
    return v;
  }

  /** 共情者：假世界里两侧存活邻座有几个邪恶。 */
  fakeEmpath(p, truth) {
    const g = this.g;
    const count = (w) => g.aliveNeighbours(p).filter((q) => w.evil.has(q.id)).length;
    const v = count(this.world(p, (w) => count(w) !== truth));
    this.note(`${this.why(p)} ${g.name(p.id)}：按假世界报 ${v} 个（真实是 ${truth}）`);
    return v;
  }

  /** 占卜师：假世界里选中的两人有没有恶魔。 */
  fakeFortune(p, a, b, truth) {
    const g = this.g;
    const yes = (w) => w.demon === a.id || w.demon === b.id;
    const v = yes(this.world(p, (w) => yes(w) !== truth));
    this.note(`${this.why(p)} ${g.name(p.id)}：按假世界答「${v ? '有' : '没有'}」（真实是「${truth ? '有' : '没有'}」）`);
    return v;
  }

  /** 送葬者/守鸦人：假世界里这个人的角色。 */
  falseRole(p, target) {
    const g = this.g;
    const r = this.world(p, (w) => w.roles.get(target.id) !== target.role).roles.get(target.id);
    this.note(`${this.why(p)} ${g.name(p.id)}：按假世界把 ${g.name(target.id)} 说成${ROLES[r].name}（真实是${ROLES[target.role].name}）`);
    return r;
  }

  // ───────────── 镇长 / 传位 ─────────────

  /** 镇长夜里被刀：替不替死、替给谁。替死保护了镇长（帮善良），所以善良领先时少替。 */
  mayorBounce(mayor, candidates) {
    const b = this.balance();
    if (!candidates.length || this.rng() >= clamp(0.5 - 0.4 * b, 0.1, 0.9)) {
      this.note(`恶魔刀了镇长 ${this.g.name(mayor.id)}，没有替死`, b);
      return null;
    }
    // 邪恶明显领先时，偶尔让爪牙替死（大幅帮善良）；否则替给一名善良玩家
    const minions = candidates.filter((q) => ROLES[q.role].team === 'minion');
    const good = candidates.filter((q) => !isEvilRole(q.role));
    const victim = b < -0.4 && minions.length && this.rng() < 0.5 ? pick(minions, this.rng) : pick(good.length ? good : candidates, this.rng);
    this.note(`恶魔刀了镇长 ${this.g.name(mayor.id)}，由 ${this.g.name(victim.id)} 替死`, b);
    return victim;
  }

  /** 小恶魔自刀且红唇女郎接不了：挑被怀疑最少的爪牙接任（对邪恶最有利，也最有戏）。 */
  starpassHeir(minions) {
    const g = this.g;
    const heat = (q) => g.suspicion[q.id] ?? 0;
    const low = Math.min(...minions.map(heat));
    const heir = pick(minions.filter((q) => heat(q) === low), this.rng);
    this.note(`小恶魔自刀，${g.name(heir.id)}（被怀疑最少的爪牙）接任恶魔`);
    return heir;
  }

  // ───────────── 黯月初升：说书人要做的选择 ─────────────
  // 原则：规则允许的范围里，往落后的一方偏一点；不要用能力直接定胜负。

  /**
   * 房规"夜里死了仍拿信息"：这条信息按醉酒处理，给真的还是假的。善良领先时多给假的，邪恶领先时多给真的（大约 25%–75%）。
   * 同一个人同一晚只判一次。
   */
  deadLies(p) {
    const key = `${this.g.night}:${p.id}`;
    this.deadMemo ??= {};
    if (key in this.deadMemo) return this.deadMemo[key];
    const b = this.balance();
    const lie = this.rng() < clamp(0.5 + 0.25 * b, 0.25, 0.75);
    this.deadMemo[key] = lie;
    this.note(`夜里死了仍拿信息（醉酒）：${this.g.name(p.id)} 这次给${lie ? '假' : '真'}信息`, b);
    return lie;
  }

  /** 和平主义者：被处决的善良玩家要不要活下来。邪恶领先时更常救；每局别救太多次。 */
  pacifistSaves(p) {
    const b = this.balance();
    this.pacifistUsed = this.pacifistUsed ?? 0;
    const chance = clamp(0.45 - 0.35 * b - 0.2 * this.pacifistUsed, 0.05, 0.85);
    const save = this.rng() < chance;
    if (save) this.pacifistUsed++;
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
    const who = pick(good.length ? good : pair, this.rng);
    this.note(`旅店老板保护了 ${pair.map((q) => g.name(q.id)).join("、")}，让 ${g.name(who.id)} 醉酒`);
    return who;
  }

  /** 沙巴洛斯反刍：偶尔（每局一两次）把上一夜吃掉的人吐回来，通常是善良玩家；邪恶领先时更常发生。 */
  shabaRegurgitate(cands) {
    if (!cands.length) return null;
    const b = this.balance();
    this.shabaUsed = this.shabaUsed ?? 0;
    if (this.shabaUsed >= 2 || this.rng() >= clamp(0.25 - 0.25 * b, 0.05, 0.5)) return null;
    const good = cands.filter((q) => !this.g.evilOf(q));
    const back = pick(good.length ? good : cands, this.rng);
    this.shabaUsed++;
    this.note(`沙巴洛斯反刍了 ${this.g.name(back.id)}`, b);
    return back;
  }

  /** 造谣者的声明为真：选一个能死的人。善良领先时多杀善良，邪恶领先时偶尔杀邪恶。 */
  gossipVictim() {
    const g = this.g;
    const can = g.alive().filter((q) => !q.apparentDead && !g.protection(q, "gossip") && !(q.role === "fool" && !g.used[q.id]));
    if (!can.length) return null;
    const b = this.balance();
    // 新手照顾：说书人自己挑谁死的时候，能不挑新手就不挑
    const easy = (list) => { const vet = list.filter((q) => !g.newbies?.includes(q.id)); return vet.length ? vet : list; };
    const evil = easy(can.filter((q) => g.evilOf(q) && ROLES[q.role].team !== "demon"));
    const good = easy(can.filter((q) => !g.evilOf(q) && q.role !== "gossip"));
    const v = b < -0.3 && evil.length && this.rng() < 0.5 ? pick(evil, this.rng) : pick(good.length ? good : can, this.rng);
    this.note(`造谣者的声明为真，说书人选 ${g.name(v.id)} 死亡`, b);
    return v;
  }

  /** 修补匠：随时可能死。善良领先时更容易死；剩的人少时绝不让他的死结束游戏。 */
  tinkerDies(p) {
    const g = this.g;
    if (g.aliveCount() <= 4) return false;
    const b = this.balance();
    const die = this.rng() < clamp(0.12 + 0.15 * b, 0.03, 0.35);
    if (die) this.note(`修补匠 ${g.name(p.id)} 突然死亡`, b);
    return die;
  }

  /** 祖母的孙子：一名善良玩家（不是她自己）。 */
  chooseGrandchild(gm) {
    const g = this.g;
    const good = g.players.filter((q) => q.id !== gm.id && !g.evilOf(q));
    const gc = pick(good, this.rng);
    if (gc) this.note(`祖母 ${g.name(gm.id)} 的孙子是 ${g.name(gc.id)}（${ROLES[gc.role].name}）`);
    return gc;
  }

  /** 失效的祖母：给一个错的角色（另一个本剧本的善良角色）。 */
  falseRoleBMR(p, target) {
    const pool = Object.keys(ROLES).filter((r) => ROLES[r].script === "bmr" && ["townsfolk", "outsider"].includes(ROLES[r].team) && r !== target.role);
    const r = pick(pool, this.rng);
    this.note(`失效的 ${ROLES[p.role].name} ${this.g.name(p.id)}：把 ${this.g.name(target.id)} 说成${ROLES[r].name}`);
    return r;
  }

  /** 失效的侍女：给一个错的数字。 */
  fakeChambermaid(p, truth) {
    const opts = [0, 1, 2].filter((n) => n !== truth);
    const n = pick(opts, this.rng);
    this.note(`失效的侍女 ${this.g.name(p.id)}：真实 ${truth}，告诉她 ${n}`);
    return n;
  }
}
