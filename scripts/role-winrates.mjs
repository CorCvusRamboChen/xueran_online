// 角色胜率：读对局存档（data/games/<服务器>/*.json，或命令行给的目录），算
//   1. 每个剧本、每个阵营的胜率
//   2. 每个角色（按真实身份）的胜率，和同阵营平均比；局数少的往阵营平均收（贝叶斯收缩，先验 K 局）
//   3. 强弱平均：每个阵营里每个角色算一票（不按出场次数加权），看「强角色」「弱角色」两半差多少
//   4. AI 说书人的和平主义者、修补匠判定：每次掷骰的概率、局势分、结果
// 用法：node scripts/role-winrates.mjs [目录...]   默认 data/prod/games
import fs from 'node:fs';
import path from 'node:path';
import { ROLES, SCRIPTS, inScript } from '../src/engine/roles.js';

const K = 6; // 收缩先验：相当于先加 K 局阵营平均的战绩
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['data/prod/games'];
const files = dirs.flatMap(function walk(d) {
  if (!fs.existsSync(d)) return [];
  return fs.statSync(d).isDirectory() ? fs.readdirSync(d).flatMap((f) => walk(path.join(d, f))) : d.endsWith('.json') ? [d] : [];
});
const isBot = (id) => String(id).startsWith('bot-');
const ORDER = ['ngj', 'luf', 'bs7', 'cat', 'tb', 'bmr', 'snv'];
const scriptOf = (roles) => {
  if (roles.every((r) => r === 'slayer' || r === 'imp') && roles.includes('slayer')) return 'ragnarok';
  return ORDER.find((s) => SCRIPTS[s] && roles.every((r) => inScript(r, s))) ?? 'mixed';
};
const pct = (w, n) => (n ? `${((100 * w) / n).toFixed(0)}%` : '—');
const side = (r) => (['minion', 'demon'].includes(ROLES[r]?.team) ? 'evil' : 'good');

const games = [];
for (const f of files) {
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  if (!j.winner || !j.players?.length) continue;
  const humans = j.players.filter((p) => !isBot(p.id));
  games.push({ f, j, script: scriptOf(j.players.map((p) => p.role)), humans: humans.length });
}
// 真人局：至少 5 个真人（测试局多半是一两个人 + 机器人）
const real = games.filter((x) => x.humans >= 5);
console.log(`存档 ${games.length} 局，其中真人 ≥5 的 ${real.length} 局（下面只算这些）\n`);

// 1. 剧本 × 阵营
const byScript = {};
for (const { j, script } of real) {
  const s = (byScript[script] ??= { n: 0, good: 0, days: 0 });
  s.n++; s.days += j.days ?? 0; if (j.winner === 'good') s.good++;
}
console.log('## 剧本胜率');
for (const [s, v] of Object.entries(byScript)) console.log(`${SCRIPTS[s]?.name ?? s}：${v.n} 局，善良胜 ${pct(v.good, v.n)}，平均 ${(v.days / v.n).toFixed(1)} 天`);
const all = real.length; const goodWins = real.filter((x) => x.j.winner === 'good').length;
console.log(`合计：${all} 局，善良胜 ${pct(goodWins, all)}\n`);

// 2. 角色（真实身份；酒鬼、疯子按真实身份算）——只算真人
// 基准按剧本算：暗流涌动善良本来就赢得多，暗流的镇民不该因此显得强
const scriptGood = Object.fromEntries(Object.entries(byScript).map(([s, v]) => [s, (v.good + 0.5 * K) / (v.n + K)])); // 局少的剧本也往 50% 收一收
const roleStats = {};
for (const { j, script } of real) {
  for (const p of j.players) {
    if (isBot(p.id) || !ROLES[p.role]) continue;
    const evil = p.evil ?? side(p.role) === 'evil';
    const won = (j.winner === 'evil') === !!evil;
    const r = (roleStats[p.role] ??= { n: 0, w: 0, evil: 0, exp: 0 });
    r.n++; if (won) r.w++; if (evil) r.evil++;
    r.exp += evil ? 1 - scriptGood[script] : scriptGood[script]; // 这个剧本里这个阵营平均能赢多少
  }
}
const teamRate = { good: goodWins / (all || 1), evil: 1 - goodWins / (all || 1) };
const rows = Object.entries(roleStats).map(([id, r]) => {
  const t = side(id);
  const base = r.exp / r.n;
  const shrunk = (r.w + K * base) / (r.n + K);
  return { id, name: ROLES[id].name, team: ROLES[id].team, side: t, ...r, base, raw: r.w / r.n, shrunk, delta: shrunk - base };
}).sort((a, b) => b.delta - a.delta);
console.log(`## 角色胜率（真人；基准 = 同剧本同阵营的胜率；收缩后 = 加 ${K} 局基准；差值 = 收缩后 − 基准）`);
console.log('角色 | 阵营 | 局数 | 胜 | 原始 | 基准 | 收缩后 | 差值');
for (const r of rows) console.log(`${r.name} | ${ROLES[r.id].team} | ${r.n} | ${r.w} | ${pct(r.w, r.n)} | ${(100 * r.base).toFixed(0)}% | ${(100 * r.shrunk).toFixed(0)}% | ${r.delta >= 0 ? '+' : ''}${(100 * r.delta).toFixed(0)}`);

// 3. 强弱平均：每个角色一票
console.log('\n## 强弱平均（每个角色算一票）');
for (const t of ['good', 'evil']) {
  const list = rows.filter((r) => r.side === t && r.n >= 3).sort((a, b) => b.delta - a.delta);
  if (!list.length) continue;
  const avg = (l, k) => l.reduce((s, r) => s + r[k], 0) / l.length;
  const f = (l) => `胜率 ${(100 * avg(l, 'raw')).toFixed(0)}%，比基准 ${avg(l, 'delta') >= 0 ? '+' : ''}${(100 * avg(l, 'delta')).toFixed(0)}`;
  const half = Math.ceil(list.length / 2);
  console.log(`${t === 'good' ? '善良' : '邪恶'}：${list.length} 个角色（≥3 局），每个角色一票的平均${f(list)}（按局算 ${(100 * teamRate[t]).toFixed(0)}%）`);
  console.log(`  强的一半（${f(list.slice(0, half))}）：${list.slice(0, half).map((r) => r.name).join('、')}`);
  console.log(`  弱的一半（${f(list.slice(half))}）：${list.slice(half).map((r) => r.name).join('、')}`);
}

// 4. AI 判定：和平主义者、修补匠
console.log('\n## AI 说书人的和平主义者 / 修补匠判定');
for (const kind of ['pacifist', 'tinker']) {
  const ds = games.flatMap(({ j, humans }) => (j.decisions ?? []).filter((d) => d.kind === kind).map((d) => ({ ...d, humans, winner: j.winner })));
  const realDs = ds.filter((d) => d.humans >= 5);
  // 日志里的 prob 是「掷出来的那个结果」的概率：结果是「否」时，「是」的概率 = 1 − prob
  const pYes = (d) => (d.chosen ? d.prob : 1 - d.prob);
  const yes = realDs.filter((d) => d.chosen === true);
  const avgP = realDs.length ? realDs.reduce((s, d) => s + pYes(d), 0) / realDs.length : 0;
  console.log(`${kind === 'pacifist' ? '和平主义者（处决善良时救不救）' : '修补匠（每晚死不死）'}：真人局掷了 ${realDs.length} 次，成立 ${yes.length} 次，平均概率 ${(100 * avgP).toFixed(0)}%（全部存档 ${ds.length} 次）`);
  // 决策日志是后来才加的：更早的局从说书人手记里找（只记了结果，没记概率）
  const notes = games.filter((x) => !(x.j.decisions ?? []).length).flatMap(({ f, j }) => (j.timeline ?? [])
    .filter((e) => e.kind === 'st' && (kind === 'pacifist' ? /^和平主义者：被处决的善良玩家 .*(活了下来|照常死亡)/ : /^修补匠 .* 突然死亡/).test(e.text))
    .map((e) => `  ${path.basename(f).slice(0, 13)} ${e.when} ${e.text}`));
  if (notes.length) console.log([`  手记里（没有决策日志的旧局）${notes.length} 条：`, ...notes].join('\n'));
  for (const d of realDs.slice(0, 30)) console.log(`  第${d.day}天/第${d.night}夜 局势分 ${d.b?.toFixed?.(2) ?? d.b} 成立概率 ${(100 * pYes(d)).toFixed(0)}% → ${d.chosen ? '成立' : '没成立'}（这局 ${d.winner === 'good' ? '善良' : '邪恶'}赢）`);
}
