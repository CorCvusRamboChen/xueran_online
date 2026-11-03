// 世界加权的实验：两个问题。
// ① 加权的模型准不准：真实局面给真恶魔多少概率（不需要真人）。② 加权以后，假信息的选择差距会不会变大。
// 用法：node scripts/worlds-weighted.mjs [局数，默认 800]
import { Game, makeRng, rollRoles } from '../src/engine/game.js';
import { enumerate, viewOf, rankFalseInfo } from '../src/engine/worlds.js';
import { TOWNSFOLK, OUTSIDERS, MINIONS } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] ?? 0;
const GAMES = Number(process.argv[2] ?? 800);

const posterior = { flat: { p: [], log: [], top: [] }, weighted: { p: [], log: [], top: [] } };
const base = [];
const ms = { flat: [], weighted: [] };
const rows = [];

function look(g) {
  const view = viewOf(g);
  const id = g.demon().id;
  for (const [name, weighted] of [['flat', false], ['weighted', true]]) {
    const r = enumerate(view, { weighted });
    ms[name].push(r.ms);
    const p = r.demon[id];
    const best = Math.max(...Object.values(r.demon));
    posterior[name].p.push(p);
    posterior[name].log.push(Math.log(Math.max(p, 1e-6)));
    posterior[name].top.push(p === best ? 1 / Object.values(r.demon).filter((x) => x === best).length : 0);
  }
  base.push(1 / g.players.length);
}

function candidates(g, f, p, rng) {
  if (f.kind === 'empath') return Array.from({ length: f.around.length + 1 }, (_, value) => ({ ...f, value })).filter((x) => x.value !== f.truth);
  if (f.kind === 'chef') return [0, 1, 2].map((value) => ({ ...f, value })).filter((x) => x.value !== f.truth);
  if (f.kind === 'role') {
    const t = g.get(f.target);
    return [...TOWNSFOLK, ...OUTSIDERS, ...MINIONS, 'imp'].filter((r) => r !== t.role).map((role) => ({ ...f, role }));
  }
  if (f.kind === 'pair') {
    const pool = { townsfolk: TOWNSFOLK, outsider: OUTSIDERS, minion: MINIONS }[f.team];
    const others = g.players.filter((x) => x.id !== p.id);
    const out = [f];
    for (let i = 0; i < 18; i++) {
      const a = others[Math.floor(rng() * others.length)]; const b = others[Math.floor(rng() * others.length)];
      const role = pool[Math.floor(rng() * pool.length)];
      if (a !== b && a.role !== role && b.role !== role) out.push({ ...f, a: a.id, b: b.id, role });
    }
    return out;
  }
  return [];
}

function compare(g, rng) {
  for (const f of (g.facts ?? []).filter((x) => x.night === g.night && ['empath', 'chef', 'role', 'pair'].includes(x.kind))) {
    const p = g.players.find((x) => x.id === f.by);
    if (!p || !g.broken(p)) continue;
    const cands = candidates(g, f, p, rng);
    if (cands.length < 2) continue;
    const row = { kind: f.kind };
    for (const [name, weighted] of [['flat', false], ['weighted', true]]) {
      const ranked = rankFalseInfo(g, cands.map((_, i) => i), (i) => cands[i], { balance: g.st.balance(), before: (x) => x === f, weighted });
      const s = ranked.map((x) => x.suspect);
      row[name] = { spread: ranked.at(-1).score - ranked[0].score, swing: Math.max(...s) - Math.min(...s), best: ranked[0].value };
    }
    rows.push(row);
  }
}

for (let seed = 1; seed <= GAMES; seed++) {
  const rng = makeRng(seed * 2741);
  const n = 7 + Math.floor(rng() * 6); // 7–12 人：现算够快的范围
  const g = new Game(players(n), { roles: rollRoles(n, rng), rng: makeRng(seed + 5) });
  for (let round = 0; round < 4 && !g.winner; round++) {
    g.startNight();
    for (const pr of g.nightPrompts()) {
      const o = [...pr.options]; const t = [];
      while (t.length < pr.count && o.length) t.push(o.splice(Math.floor(rng() * o.length), 1)[0]);
      g.submitChoice(pr.playerId, t.length === pr.count ? t : []);
    }
    const res = g.resolveNight();
    if (res.ravenkeeper) g.resolveRavenkeeper(g.alive()[0].id);
    if (g.winner) break;
    g.dawn();
    if (g.demon()?.id !== g.firstDemon) break;
    look(g);
    compare(g, rng);
    if (rng() < 0.7) { const a = g.alive(); g.execute(a[Math.floor(rng() * a.length)]); }
    if (g.winner) break;
    g.endDay();
  }
}

console.log(`① 真实局面 ${base.length} 次（7–12 人，瞎猜时真恶魔 ${mean(base).toFixed(3)}）`);
console.log('模型      真恶魔的概率  排第一的比例  平均对数得分  耗时 ms p50/p95/最大');
for (const [name, label] of [['flat', '等权'], ['weighted', '加权']]) {
  const r = posterior[name];
  console.log(`${label.padEnd(6)} ${mean(r.p).toFixed(3).padStart(10)} ${mean(r.top).toFixed(3).padStart(12)} ${mean(r.log).toFixed(3).padStart(12)}      ${q(ms[name], 0.5).toFixed(1)} / ${q(ms[name], 0.95).toFixed(1)} / ${Math.max(...ms[name]).toFixed(1)}`);
}
console.log(`\n② 假信息候选 ${rows.length} 次判定`);
console.log('类型     次数  分数差 等权→加权       恶魔怀疑度变化幅度 等权→加权   两边挑的一样');
for (const kind of ['empath', 'chef', 'pair', 'role']) {
  const r = rows.filter((x) => x.kind === kind);
  if (!r.length) continue;
  const m = (a, k) => mean(r.map((x) => x[a][k])).toFixed(3);
  console.log(`${kind.padEnd(7)} ${String(r.length).padStart(4)}   ${m('flat', 'spread')} → ${m('weighted', 'spread')}            ${m('flat', 'swing')} → ${m('weighted', 'swing')}           ${(100 * mean(r.map((x) => (x.flat.best === x.weighted.best ? 1 : 0)))).toFixed(0)}%`);
}
