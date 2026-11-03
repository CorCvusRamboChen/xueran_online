// 世界枚举（原型，只支持暗流涌动）：列出所有和全镇已知信息对得上的局面，用来给说书人的判定打分。
// 一个世界 = 谁是恶魔、爪牙各是什么、谁是酒鬼；红鲱鱼和投毒不展开成世界，只判断"存不存在一种解释"，这样世界数不会炸。
// 默认所有说得通的世界等权；weighted 时按"这些信息在这个世界里有多自然"加权，投毒和红鲱鱼在世界内求和。
//
// 全镇已知的东西：每个人自称的角色（claims）、好人夜里听到的信息（g.facts）、谁在第几夜活着、谁被处决。
// 判定规则的原则是宁松勿严：陌客、间谍的错误登记只要可能就算过。这里和引擎是两份逻辑，靠 test/worlds.test.js 绑定：
// 随机跑真实对局，真实世界必须一直留在枚举结果里。
//
// 原型的限制：
// · 恶魔换人（传位、红唇女郎接任）之后不保证对。
// · 邪恶玩家只报了伪装角色，没有编假信息。
// · 没有用投票、提名、猎手开枪、贞洁者这些公开线索。
import { TOWNSFOLK, OUTSIDERS, MINIONS, DISTRIBUTION } from './roles.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const MISREGISTER = 0.3; // 陌客、间谍错误登记的大概概率，和说书人平时的判定差不多
const isTownsfolk = new Set(TOWNSFOLK);
const isOutsider = new Set(OUTSIDERS);

/** 从 k 个爪牙角色里取排列：[['baron','spy'], ...] */
function arrangements(k, pool = MINIONS, head = [], out = []) {
  if (head.length === k) { out.push(head); return out; }
  for (const r of pool) if (!head.includes(r)) arrangements(k, pool, [...head, r], out);
  return out;
}

/** 全镇知道的东西。claims：id → 自称角色；不给就用"好人报看到的角色，邪恶依次报伪装"。 */
export function viewOf(g, { claims = null, extra = [], before = null } = {}) {
  const ids = g.players.map((p) => p.id);
  const seat = new Map(ids.map((id, i) => [id, i]));
  let bluff = 0;
  const said = g.players.map((p) => {
    if (claims?.[p.id]) return claims[p.id];
    if (p.role === 'imp' || MINIONS.includes(p.role)) return g.bluffs?.[bluff++ % (g.bluffs.length || 1)] ?? 'soldier';
    return p.shownRole;
  });
  const facts = [...(g.facts ?? []).filter((f) => !before || !before(f)), ...extra];
  const aliveAt = {}; const info = []; const executed = [];
  for (const f of facts) {
    if (f.kind === 'night') aliveAt[f.night] = new Set(f.alive.map((id) => seat.get(id)));
    else if (f.kind === 'executed') executed.push(seat.get(f.target));
    else info.push({ ...f, by: seat.get(f.by), a: seat.get(f.a), b: seat.get(f.b), target: seat.get(f.target), around: f.around?.map((id) => seat.get(id)) });
  }
  return { n: ids.length, ids, said, info, aliveAt, executed, ended: !!g.winner };
}

/** 一个世界里，某一个人是不是邪恶：1 一定是，0 一定不是，0.5 可能（间谍、陌客的错误登记）。 */
function evilness(w, i) {
  if (i === w.spy) return 0.5;
  if (w.evil[i]) return 1;
  return w.said[i] === 'recluse' ? 0.5 : 0;
}

/** 这个人在这个世界里的真实角色。 */
function trueRole(w, i) {
  if (i === w.demon) return 'imp';
  if (w.evil[i]) return w.minion[i];
  return i === w.drunk ? 'drunk' : w.said[i];
}

const mayMisregister = (w, i) => i === w.spy || (!w.evil[i] && w.said[i] === 'recluse');

/** 除了占卜师以外的信息：这条信息在这个世界里说得通吗。 */
function holds(f, w) {
  switch (f.kind) {
    case 'chef': {
      let lo = 0; let hi = 0;
      for (let i = 0; i < w.n; i++) {
        const a = evilness(w, i); const b = evilness(w, (i + 1) % w.n);
        if (a && b) hi++;
        if (a === 1 && b === 1) lo++;
      }
      return f.value >= lo && f.value <= hi;
    }
    case 'empath': {
      let lo = 0; let hi = 0;
      for (const q of f.around) { const e = evilness(w, q); if (e) hi++; if (e === 1) lo++; }
      return f.value >= lo && f.value <= hi;
    }
    case 'pair':
      return [f.a, f.b].some((q) => mayMisregister(w, q) || trueRole(w, q) === f.role);
    case 'none':
      if (f.team === 'outsider') return w.drunk == null && !w.said.some((r, i) => !w.evil[i] && isOutsider.has(r));
      return w.minions.every((q) => q === w.spy); // 只有间谍可能藏起来
    case 'role':
      return mayMisregister(w, f.target) || trueRole(w, f.target) === f.role;
    default: return true;
  }
}

/** 不靠错误登记也说得通吗。 */
function exact(f, w) {
  const realEvil = (i) => (w.evil[i] ? 1 : 0);
  switch (f.kind) {
    case 'chef': {
      let k = 0;
      for (let i = 0; i < w.n; i++) if (w.evil[i] && w.evil[(i + 1) % w.n]) k++;
      return f.value === k;
    }
    case 'empath': return f.value === f.around.reduce((k, q) => k + realEvil(q), 0);
    case 'pair': return [f.a, f.b].some((q) => trueRole(w, q) === f.role);
    case 'none': return f.team === 'outsider' ? holds(f, w) && w.spy == null : w.minions.length === 0;
    case 'role': return trueRole(w, f.target) === f.role;
    default: return true;
  }
}

/** 信息是编出来的话，碰巧编成这个值的机会。 */
function madeUp(f, n) {
  switch (f.kind) {
    case 'chef': return 1 / 3;
    case 'empath': return 1 / (f.around.length + 1);
    case 'ft': return 1 / 2;
    case 'pair': return 1 / (((n - 1) * (n - 2)) / 2 * (f.team === 'townsfolk' ? 13 : 4));
    case 'role': return 1 / 22;
    default: return 1 / 4;
  }
}

/** 这条信息在这个世界里有多自然：1 就是这样，MISREGISTER 要靠错误登记，0 说不通。 */
const fit = (f, w) => (!holds(f, w) ? 0 : exact(f, w) ? 1 : MISREGISTER);

/** 占卜师：要不要靠红鲱鱼或陌客。 */
function fortuneFit(f, w, herring) {
  if (!fortuneHolds(f, w, herring)) return 0;
  const pair = [f.a, f.b];
  return f.yes && !pair.includes(w.demon) && !pair.includes(herring) ? MISREGISTER : 1;
}

/**
 * 这个世界里，大家听到的这些信息有多大可能：
 * 邪恶和酒鬼说的是编的；其余人每晚有一个可能被投毒（投毒者活着才有），被投毒的那条也是编的。
 * 占卜师的信息跨夜，红鲱鱼在外层求和。
 */
function likelihood(view, w) {
  let fixed = 1;
  const nights = new Map(); // 第几夜 → [{ fit, fake }]
  const fortune = [];
  for (const f of view.info) {
    if (w.evil[f.by] || f.by === w.drunk) { fixed *= madeUp(f, w.n); continue; }
    if (f.kind === 'ft') fortune.push(f);
    else (nights.get(f.night) ?? nights.set(f.night, []).get(f.night)).push({ fit: fit(f, w), fake: madeUp(f, w.n) });
  }
  const night = (list, k) => {
    const alive = view.aliveAt[k];
    const can = w.poisoner != null && (!alive || alive.has(w.poisoner));
    const plain = list.reduce((x, s) => x * s.fit, 1);
    if (!can) return plain;
    const m = Math.max(1, (alive?.size ?? w.n) - 1); // 投毒者能选的人数
    let sum = Math.max(0, m - list.length) * plain;
    for (let i = 0; i < list.length; i++) sum += list.reduce((x, s, j) => x * (j === i ? s.fake : s.fit), 1);
    return sum / m;
  };
  const total = (extra) => {
    let v = 1;
    const all = new Set([...nights.keys(), ...extra.keys()]);
    for (const k of all) v *= night([...(nights.get(k) ?? []), ...(extra.get(k) ?? [])], k);
    return v;
  };
  if (!fortune.length) return fixed * total(new Map());
  let sum = 0; let good = 0;
  for (let h = 0; h < w.n; h++) {
    if (w.evil[h]) continue;
    good++;
    const extra = new Map();
    for (const f of fortune) (extra.get(f.night) ?? extra.set(f.night, []).get(f.night)).push({ fit: fortuneFit(f, w, h), fake: madeUp(f, w.n) });
    sum += total(extra);
  }
  return fixed * (good ? sum / good : 0);
}

/** 占卜师这条信息在这个世界、这个红鲱鱼下说得通吗。 */
function fortuneHolds(f, w, herring) {
  const pair = [f.a, f.b];
  const demon = pair.includes(w.demon);
  const maybe = pair.some((q) => !w.evil[q] && w.said[q] === 'recluse');
  const yes = demon || pair.includes(herring);
  return f.yes ? yes || maybe : !yes;
}

/** 有没有一种解释：每晚最多一条信息说不通（那个人被投毒了），而且那晚投毒者要活着。 */
function explains(view, w) {
  const bad = new Map();
  const fortune = [];
  for (const f of view.info) {
    if (w.evil[f.by] || f.by === w.drunk) continue; // 邪恶和酒鬼说的不算数
    if (f.kind === 'ft') { fortune.push(f); continue; }
    if (!holds(f, w)) bad.set(f.night, (bad.get(f.night) ?? 0) + 1);
  }
  const ok = (counts) => {
    for (const [night, k] of counts) {
      if (k > 1 || w.poisoner == null) return false;
      if (view.aliveAt[night] && !view.aliveAt[night].has(w.poisoner)) return false;
    }
    return true;
  };
  if (!ok(bad)) return false;
  if (!fortune.length) return true;
  for (let h = 0; h < w.n; h++) {
    if (w.evil[h]) continue;
    const counts = new Map(bad);
    for (const f of fortune) if (!fortuneHolds(f, w, h)) counts.set(f.night, (counts.get(f.night) ?? 0) + 1);
    if (ok(counts)) return true;
  }
  return false;
}

/**
 * 枚举。返回世界总数、每人是恶魔 / 邪恶的概率（默认所有世界等权，weighted 时按 likelihood 加权）。
 * isReal(世界)：测试用，告诉我们真实世界有没有留下来。
 */
export function enumerate(view, { isReal = null, weighted = false } = {}) {
  const { n, said } = view;
  const [baseT, baseO, nMinions] = DISTRIBUTION[n];
  const order = arrangements(nMinions);
  const demon = new Array(n).fill(0); const evil = new Array(n).fill(0);
  let count = 0; let total = 0; let foundReal = false; let realWeight = 0;
  const start = performance.now();

  const claimedOutsiders = (e) => said.reduce((k, r, i) => k + (!e[i] && isOutsider.has(r) ? 1 : 0), 0);
  const unique = (e) => {
    const seen = new Set();
    for (let i = 0; i < n; i++) { if (e[i]) continue; if (seen.has(said[i])) return false; seen.add(said[i]); }
    return true;
  };

  for (let mask = 0; mask < 1 << n; mask++) {
    let bits = 0;
    for (let m = mask; m; m &= m - 1) bits++;
    if (bits !== nMinions + 1) continue;
    const e = new Array(n).fill(false); const seats = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { e[i] = true; seats.push(i); }
    if (!unique(e)) continue;
    const outsiders = claimedOutsiders(e);

    for (const d of seats) {
      if (view.executed.includes(d) && !view.ended && !order.some((o) => o.includes('scarletwoman'))) continue;
      const rest = seats.filter((i) => i !== d);
      for (const roles of order) {
        if (view.executed.includes(d) && !view.ended && !roles.includes('scarletwoman')) continue;
        const need = baseO + (roles.includes('baron') ? 2 : 0) - outsiders;
        if (need < 0 || need > 1) continue;
        const w = { n, said, evil: e, demon: d, drunk: null, spy: null, poisoner: null, minions: rest, minion: {} };
        rest.forEach((q, i) => {
          w.minion[q] = roles[i];
          if (roles[i] === 'spy') w.spy = q;
          if (roles[i] === 'poisoner') w.poisoner = q;
        });
        const drunks = need ? said.map((r, i) => (!e[i] && isTownsfolk.has(r) ? i : -1)).filter((i) => i >= 0) : [null];
        for (const dr of drunks) {
          w.drunk = dr;
          if (!explains(view, w)) continue;
          const v = weighted ? likelihood(view, w) : 1;
          count++;
          total += v;
          demon[d] += v;
          for (const q of seats) evil[q] += v;
          if (isReal?.(w)) { foundReal = true; realWeight += v; }
        }
      }
    }
  }
  const share = (arr) => Object.fromEntries(view.ids.map((id, i) => [id, total ? arr[i] / total : 0]));
  return { count, demon: share(demon), evil: share(evil), foundReal, realWeight, ms: performance.now() - start, townsfolkBase: baseT };
}

/** 判断一个世界是不是这局真实的世界。 */
export function isRealWorld(g) {
  const seat = new Map(g.players.map((p, i) => [p.id, i]));
  const demonSeat = g.players.findIndex((p) => p.role === 'imp');
  const drunkSeat = g.players.findIndex((p) => p.role === 'drunk');
  const minions = g.players.filter((p) => MINIONS.includes(p.role));
  return (w) => w.demon === demonSeat && (w.drunk ?? -1) === drunkSeat && minions.length === w.minions.length
    && minions.every((p) => w.minion[seat.get(p.id)] === p.role);
}

/**
 * 完整局面的指纹：人数、每个座位自称什么、听到了什么。转圈坐算同一种。
 * 用来量"线下算过的局面能不能再碰到"。
 */
export function stateKey(view) {
  const { n, said, info } = view;
  const at = (i, shift) => (i == null ? '' : (i - shift + n) % n);
  let best = null;
  for (let shift = 0; shift < n; shift++) {
    const seats = said.map((_, i) => said[(i + shift) % n]).join();
    const facts = info.map((f) => [f.night, f.kind, at(f.by, shift), at(f.a, shift), at(f.b, shift), at(f.target, shift), f.value ?? f.yes ?? f.role ?? f.team, f.around?.map((q) => at(q, shift)).join('+')].join(':')).sort().join();
    const text = `${n}|${seats}|${facts}`;
    if (best == null || text < best) best = text;
  }
  return best;
}

/** 假信息判定的特征：不用枚举就能算出来，线下的表按它查。 */
export function decisionKey(g, f, p) {
  const n = g.players.length;
  const b = g.st.balance();
  const size = n <= 6 ? 'S' : n <= 9 ? 'M' : n <= 12 ? 'L' : 'X';
  const mood = b > 0.15 ? 'good' : b < -0.15 ? 'evil' : 'even';
  const why = p.role === 'drunk' ? 'drunk' : 'poison';
  return { truth: f.truth, text: [f.kind, f.truth, size, Math.min(g.night, 3), mood, why].join('/') };
}

/**
 * 三层：先查线下的表；查不到且人数不多，现算；再不行返回 null，说书人走原来的规则。
 * values：可选的假答案；live()：现算，返回 rankFalseInfo 的结果。
 */
export function recommend(key, values, table, live, { n = 15, liveUpTo = 12 } = {}) {
  const entry = table?.[key.text];
  if (entry) {
    for (const [offset] of Object.entries(entry).sort((a, b) => b[1] - a[1])) {
      const value = key.truth + Number(offset);
      if (values.includes(value)) return { value, from: 'table' };
    }
  }
  if (n <= liveUpTo) return { value: live()[0].value, from: 'live' };
  return null;
}

/** 局势领先时恶魔藏深一点，落后时露出来一点。balance：-1（邪恶大优）到 1（善良大优）。 */
export const suspectTarget = (balance, n) => clamp(1.6 / n - 0.15 * balance, 0.05, 0.6);

/**
 * 给一条假信息的几个候选打分（越小越好）：真恶魔被怀疑的程度最接近目标，同时给全镇留下足够多的世界。
 * make(候选值) 返回一条假设的信息。这里只出建议，不改判定。
 */
export function rankFalseInfo(g, candidates, make, { balance = 0, before = null, minWorlds = 4, weighted = false } = {}) {
  const demon = g.players.find((p) => p.role === 'imp');
  const target = suspectTarget(balance, g.players.length);
  return candidates.map((value) => {
    const r = enumerate(viewOf(g, { before, extra: [make(value)] }), { weighted });
    const suspect = r.demon[demon.id];
    const score = Math.abs(suspect - target) + (r.count < minWorlds ? 0.5 : 0);
    return { value, worlds: r.count, suspect, target, score };
  }).sort((a, b) => a.score - b.score);
}
