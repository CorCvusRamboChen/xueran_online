// 线下预计算的体检：能不能把说书人的判定事先算好放进表里，查不到再现算？
// 量三件事：① 局面一共有多少 ② 线下算的表在没见过的对局里命中多少 ③ 查表的选择比现算差多少。
// 用法：node scripts/worlds-table.mjs [训练局数，默认 1500] [测试局数，默认 300]
import fs from 'node:fs';
import { Game, makeRng, rollRoles } from '../src/engine/game.js';
import { TOWNSFOLK, OUTSIDERS, MINIONS, DISTRIBUTION } from '../src/engine/roles.js';
import { viewOf, rankFalseInfo, decisionKey, stateKey } from '../src/engine/worlds.js';

const TRAIN = Number(process.argv[2] ?? 1500);
const TEST = Number(process.argv[3] ?? 300);
const OUT = 'src/engine/worlds-table.json';
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// ① 只算开局：挑角色 × 坐座位（转圈和镜像算同一种）
const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
const factorial = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
console.log('① 开局配置数（挑角色 × 坐座位，转圈和镜像算一种）');
for (const n of [5, 8, 10, 12, 15]) {
  const [t, o, m] = DISTRIBUTION[n];
  const plain = choose(TOWNSFOLK.length, t) * choose(OUTSIDERS.length, o) * choose(MINIONS.filter((r) => r !== 'baron').length, m);
  const baron = o + 2 <= OUTSIDERS.length && t >= 2 ? choose(TOWNSFOLK.length, t - 2) * choose(OUTSIDERS.length, o + 2) * choose(MINIONS.length - 1, m - 1) : 0;
  const setups = (plain + baron) * (factorial(n) / (2 * n));
  console.log(`  ${String(n).padStart(2)} 人：${setups.toExponential(1)}`);
}

/** 跑一局，每个"有得选的假信息"调一次 onDecision。 */
function playGame(seed, onDecision, onState) {
  const rng = makeRng(seed);
  const n = 5 + Math.floor(rng() * 11);
  const g = new Game(players(n), { roles: rollRoles(n, rng), rng: makeRng(seed + 1) });
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
    onState?.(g);
    for (const f of (g.facts ?? []).filter((x) => x.night === g.night && (x.kind === 'empath' || x.kind === 'chef'))) {
      const p = g.players.find((q) => q.id === f.by);
      if (!p || !g.broken(p)) continue;
      const max = f.kind === 'empath' ? f.around.length : 2;
      const values = Array.from({ length: max + 1 }, (_, i) => i).filter((v) => v !== f.truth);
      if (values.length < 2) continue; // 只有一个假答案：没得选
      const ranked = rankFalseInfo(g, values, (value) => ({ ...f, value }), { balance: g.st.balance(), before: (x) => x === f });
      onDecision({ g, f, p, ranked, given: f.value, key: decisionKey(g, f, p) });
    }
    if (rng() < 0.7) { const a = g.alive(); g.execute(a[Math.floor(rng() * a.length)]); }
    if (g.winner) break;
    g.endDay();
  }
}

// ② 训练：线下把判定算好，按"判定的特征"归类，记每个答案赢了几次
const started = performance.now();
const table = {};
const states = new Set();
for (let seed = 1; seed <= TRAIN; seed++) {
  playGame(seed * 104729, ({ ranked, key }) => {
    const best = ranked[0].value - key.truth; // 记相对真相差几：+1 / -1
    (table[key.text] ??= {})[best] = (table[key.text][best] ?? 0) + 1;
  }, (g) => states.add(stateKey(viewOf(g))));
}
const trainMs = performance.now() - started;
fs.writeFileSync(OUT, `${JSON.stringify(table)}\n`);

// ③ 测试：没见过的对局
const rows = [];
let stateHit = 0; let stateAll = 0;
for (let seed = 1; seed <= TEST; seed++) {
  playGame(9000000 + seed * 7877, ({ ranked, key, given }) => {
    const best = ranked[0];
    const entry = table[key.text];
    const offset = entry ? Number(Object.entries(entry).sort((a, b) => b[1] - a[1])[0][0]) : null;
    const hit = entry ? ranked.find((x) => x.value === key.truth + offset) : null;
    const now = ranked.find((x) => x.value === given) ?? ranked.at(-1);
    rows.push({ hit: !!hit, table: (hit ?? best).score - best.score, now: now.score - best.score, random: mean(ranked.map((x) => x.score)) - best.score, tie: ranked[0].score === ranked.at(-1).score });
  }, (g) => { stateAll++; if (states.has(stateKey(viewOf(g)))) stateHit++; });
}

console.log(`\n② 线下算了 ${TRAIN} 局，${(trainMs / 1000).toFixed(0)} 秒。表有 ${Object.keys(table).length} 行，${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
console.log(`   完整局面命中：${stateHit} / ${stateAll}（训练里见过 ${states.size} 种，${TEST} 局新对局里完全相同的局面）`);
const hits = rows.filter((r) => r.hit);
console.log(`   判定特征命中：${hits.length} / ${rows.length}`);
console.log('\n③ 比现算差多少（0 = 和现算一样好，越大越差）');
console.log(`   查表 ${mean(hits.map((r) => r.table)).toFixed(4)}   现有规则 ${mean(rows.map((r) => r.now)).toFixed(4)}   瞎选 ${mean(rows.map((r) => r.random)).toFixed(4)}   候选分数完全相同的判定 ${rows.filter((r) => r.tie).length} 个`);
