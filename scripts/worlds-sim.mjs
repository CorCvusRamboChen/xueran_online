// 世界枚举原型的体检：跑随机对局，量每次枚举多久、世界有多少，再对比现在的假信息和枚举推荐的差别。
// 用法：node scripts/worlds-sim.mjs [局数，默认 200]
import { Game, makeRng, rollRoles } from '../src/engine/game.js';
import { enumerate, viewOf, rankFalseInfo } from '../src/engine/worlds.js';

const GAMES = Number(process.argv[2] ?? 200);
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const quantile = (arr, q) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor((arr.length - 1) * q)] : 0);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const byPlayers = new Map();
const picks = [];

/** 这一晚拿假信息的人（共情者、厨师、占卜师）：现在给的值 vs 枚举推荐的值。 */
function compare(g, night) {
  for (const f of (g.facts ?? []).filter((x) => x.night === night)) {
    const p = g.players.find((q) => q.id === f.by);
    if (!p || !g.broken(p)) continue;
    const before = (x) => x === f;
    let values; let make;
    if (f.kind === 'empath') { values = [0, 1, 2].slice(0, f.around.length + 1); make = (value) => ({ ...f, value }); }
    else if (f.kind === 'chef') { values = [0, 1, 2]; make = (value) => ({ ...f, value }); }
    else if (f.kind === 'ft') { values = [true, false]; make = (yes) => ({ ...f, yes }); }
    else continue;
    const ranked = rankFalseInfo(g, values, make, { balance: g.st.balance(), before });
    const given = f.kind === 'ft' ? f.yes : f.value;
    const now = ranked.find((x) => x.value === given);
    if (now) picks.push({ kind: f.kind, same: ranked[0].value === given, now: now.score, best: ranked[0].score, nowWorlds: now.worlds, bestWorlds: ranked[0].worlds });
  }
}

for (let seed = 1; seed <= GAMES; seed++) {
  const rng = makeRng(seed * 104729);
  const n = 5 + Math.floor(rng() * 11);
  const g = new Game(players(n), { roles: rollRoles(n, rng), rng: makeRng(seed + 1) });
  const stat = byPlayers.get(n) ?? { ms: [], worlds: [], suspect: [] };
  byPlayers.set(n, stat);
  for (let round = 0; round < 6 && !g.winner; round++) {
    g.startNight();
    for (const pr of g.nightPrompts()) {
      const opts = [...pr.options]; const targets = [];
      while (targets.length < pr.count && opts.length) targets.push(opts.splice(Math.floor(rng() * opts.length), 1)[0]);
      g.submitChoice(pr.playerId, targets.length === pr.count ? targets : []);
    }
    const res = g.resolveNight();
    if (res.ravenkeeper) g.resolveRavenkeeper(g.alive()[0].id);
    if (g.winner) break;
    g.dawn();
    if (g.demon()?.id !== g.firstDemon) break;
    const r = enumerate(viewOf(g));
    stat.ms.push(r.ms); stat.worlds.push(r.count); stat.suspect.push(r.demon[g.demon().id]);
    compare(g, g.night);
    if (rng() < 0.7) { const a = g.alive(); g.execute(a[Math.floor(rng() * a.length)]); }
    if (g.winner) break;
    g.endDay();
  }
}

console.log('人数  次数  世界数(中位)  真恶魔被怀疑(中位)  耗时 ms p50 / p95 / 最大');
for (const n of [...byPlayers.keys()].sort((a, b) => a - b)) {
  const s = byPlayers.get(n);
  console.log(`${String(n).padStart(3)} ${String(s.ms.length).padStart(5)} ${String(quantile(s.worlds, 0.5)).padStart(12)} ${quantile(s.suspect, 0.5).toFixed(2).padStart(16)}     ${quantile(s.ms, 0.5).toFixed(1)} / ${quantile(s.ms, 0.95).toFixed(1)} / ${Math.max(...s.ms).toFixed(1)}`);
}
console.log(`\n假信息对比：共 ${picks.length} 次`);
for (const kind of ['empath', 'chef', 'ft']) {
  const list = picks.filter((p) => p.kind === kind);
  if (!list.length) continue;
  console.log(`${kind.padEnd(7)} ${String(list.length).padStart(4)} 次  和推荐一样 ${(100 * mean(list.map((p) => (p.same ? 1 : 0)))).toFixed(0)}%  偏差：现在 ${mean(list.map((p) => p.now)).toFixed(3)} / 推荐 ${mean(list.map((p) => p.best)).toFixed(3)}`);
}
