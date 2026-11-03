// 选择多的假信息（洗衣妇等的目标、送葬者等的角色）：枚举推荐比现有规则好多少。用法：node scripts/worlds-pairs.mjs [局数]

import { Game, makeRng, rollRoles } from '../src/engine/game.js';
import { rankFalseInfo } from '../src/engine/worlds.js';
import { TOWNSFOLK, OUTSIDERS, MINIONS } from '../src/engine/roles.js';
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const rows = []; let ms = [];
const GAMES = Number(process.argv[2] ?? 1500);
for (let seed = 1; seed <= GAMES; seed++) {
  const rng = makeRng(seed * 6151); const n = 7 + Math.floor(rng() * 6); // 7-12 人：现算够快的范围
  const g = new Game(players(n), { roles: rollRoles(n, rng), rng: makeRng(seed + 2) });
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
    for (const f of (g.facts ?? []).filter((x) => x.night === g.night && (x.kind === 'pair' || x.kind === 'role'))) {
      const p = g.players.find((q) => q.id === f.by);
      if (!p || !g.broken(p)) continue;
      const before = (x) => x === f;
      let cands;
      if (f.kind === 'role') {
        const t = g.get(f.target);
        cands = [...TOWNSFOLK, ...OUTSIDERS, ...MINIONS, 'imp'].filter((r) => r !== t.role).map((role) => ({ ...f, role }));
      } else {
        const pool = { townsfolk: TOWNSFOLK, outsider: OUTSIDERS, minion: MINIONS }[f.team];
        const others = g.players.filter((q) => q.id !== p.id);
        cands = [];
        for (let i = 0; i < 18; i++) {
          const a = others[Math.floor(rng() * others.length)]; const b = others[Math.floor(rng() * others.length)];
          if (a === b) continue;
          const role = pool[Math.floor(rng() * pool.length)];
          if (a.role === role || b.role === role) continue; // 假信息：两个人里没有这个角色
          cands.push({ ...f, a: a.id, b: b.id, role });
        }
        if (!cands.length) continue;
      }
      cands.unshift(f);
      const t0 = performance.now();
      const ranked = rankFalseInfo(g, cands.map((_, i) => i), (i) => cands[i], { balance: g.st.balance(), before });
      ms.push(performance.now() - t0);
      const now = ranked.find((x) => x.value === 0);
      rows.push({ kind: f.kind, now: now.score - ranked[0].score, random: mean(ranked.map((x) => x.score)) - ranked[0].score, spread: ranked.at(-1).score - ranked[0].score, worldsNow: now.worlds, worldsBest: ranked[0].worlds, options: cands.length });
    }
    if (rng() < 0.7) { const a = g.alive(); g.execute(a[Math.floor(rng() * a.length)]); }
    if (g.winner) break;
    g.endDay();
  }
}
ms.sort((a, b) => a - b);
for (const kind of ['pair', 'role']) {
  const r = rows.filter((x) => x.kind === kind);
  console.log(kind, r.length, '次 候选', mean(r.map((x) => x.options)).toFixed(1), ' 现有规则差', mean(r.map((x) => x.now)).toFixed(4), ' 瞎选差', mean(r.map((x) => x.random)).toFixed(4), ' 最好和最差相差', mean(r.map((x) => x.spread)).toFixed(4));
}
console.log('一次判定耗时 ms p50/p95/最大', ms[ms.length >> 1]?.toFixed(1), ms[Math.floor(ms.length * 0.95)]?.toFixed(1), ms.at(-1)?.toFixed(1));
