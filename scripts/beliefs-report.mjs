// 看存档里的两份线下数据：玩家标记（大家在想什么）和说书人决策日志（说书人怎么选的）。
// 怀疑度只算善良玩家的标记：邪恶知道答案，他们的标记不算"猜"。
// 用法：node scripts/beliefs-report.mjs [存档目录，默认 data/games] [--games 每局都列出来]
import fs from 'node:fs';
import path from 'node:path';
import { ROLES } from '../src/engine/roles.js';
import { replayMarks, readTown } from '../src/server/beliefs.js';

const args = process.argv.slice(2);
const each = args.includes('--games');
const root = args.find((a) => !a.startsWith('--')) ?? 'data/games';
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const isBot = (id) => /^bot-/.test(id);

function loadGames(dir) {
  let guilds = [];
  try { guilds = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const g of guilds) {
    let names = [];
    try { names = fs.readdirSync(path.join(dir, g)).filter((n) => n.endsWith('.json')); } catch { continue; }
    for (const n of names) { try { out.push(JSON.parse(fs.readFileSync(path.join(dir, g, n), 'utf8'))); } catch { /* 坏文件跳过 */ } }
  }
  return out.sort((a, b) => a.endedAt - b.endedAt);
}

/** 邪恶排在善良前面的概率（0.5 = 和瞎猜一样，1 = 完全分开）。平局算半个。 */
function separation(town, evil, good) {
  let win = 0; let all = 0;
  for (const e of evil) for (const x of good) { all++; const d = town[e].suspect - town[x].suspect; win += d > 0 ? 1 : d === 0 ? 0.5 : 0; }
  return all ? win / all : null;
}

const games = loadGames(root);
const withMarks = games.filter((g) => g.beliefs?.length);
const withLog = games.filter((g) => g.decisions?.length);
console.log(`存档 ${games.length} 局：有玩家标记 ${withMarks.length} 局，有决策日志 ${withLog.length} 局\n`);

// ── 玩家标记 ──
const daily = new Map(); // 第几天 → [分开程度]
const demonRank = new Map(); // 第几天 → [真恶魔的怀疑度]
const markers = [];
for (const g of withMarks) {
  const real = g.players.filter((p) => !isBot(p.id));
  const evilOf = new Map(g.players.map((p) => [p.id, !!p.evil]));
  const ids = g.players.map((p) => p.id);
  const evil = ids.filter((id) => evilOf.get(id));
  const good = ids.filter((id) => !evilOf.get(id));
  const who = new Set(g.beliefs.map((e) => e.by));
  markers.push(real.length ? real.filter((p) => who.has(p.id)).length / real.length : 0);
  if (each) console.log(`${new Date(g.endedAt).toLocaleString()}  ${g.players.length} 人，${g.winner === 'good' ? '善良' : '邪恶'}胜，${who.size}/${real.length} 个真人用了标记，改了 ${g.beliefs.length} 次`);
  for (let day = 0; day <= (g.days ?? 0); day++) {
    const now = replayMarks(g.beliefs, (e) => e.day <= day);
    const town = readTown(now, ids, (id) => !evilOf.get(id));
    const heard = Object.values(town).filter((t) => t.evil + t.good > 0).length;
    if (!heard) continue;
    const sep = separation(town, evil, good);
    if (sep != null) { if (!daily.has(day)) daily.set(day, []); daily.get(day).push(sep); }
    const demons = g.players.filter((p) => ROLES[p.role]?.team === 'demon');
    if (each) {
      const line = g.players.map((p) => `${p.seat}${p.evil ? '恶' : ''}:${town[p.id].suspect.toFixed(2)}`).join(' ');
      console.log(`  第${day}天 分开程度 ${sep?.toFixed(2) ?? '-'}  ${line}`);
    }
    for (const d of demons) { if (!demonRank.has(day)) demonRank.set(day, []); demonRank.get(day).push(town[d.id].suspect); }
  }
}
if (withMarks.length) {
  console.log(`平均每局 ${(100 * mean(markers)).toFixed(0)}% 的真人用了标记`);
  console.log('善良玩家能不能把邪恶排在前面（0.5 = 瞎猜，局数少时别当真）');
  for (const day of [...daily.keys()].sort((a, b) => a - b)) console.log(`  第 ${day} 天  ${mean(daily.get(day)).toFixed(2)}  （${daily.get(day).length} 局），真恶魔的怀疑度 ${mean(demonRank.get(day) ?? []).toFixed(2)}`);
  console.log('');
}

// ── 决策日志 ──
const kinds = new Map();
for (const g of withLog) {
  for (const d of g.decisions) {
    const k = kinds.get(d.kind) ?? { n: 0, b: [], free: 0 };
    k.n++;
    if (d.b != null) k.b.push(d.b);
    if (d.prob != null && d.prob < 1) k.free++;
    kinds.set(d.kind, k);
  }
}
if (kinds.size) {
  console.log('决策类型          次数  平均局势  其中按概率抽的');
  for (const [kind, k] of [...kinds].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`${kind.padEnd(18)}${String(k.n).padStart(4)}  ${mean(k.b).toFixed(2).padStart(7)}  ${String(k.free).padStart(6)}`);
  }
}
