// Read-only: print madness-related records from the most recent finished games.
// Run on the Mac mini from the app folder (pipe it in, nothing is written):
//   ssh rambochen@100.80.146.66 "cd ~/apps/botc && node --input-type=module - 3" < scripts/last-madness.mjs
// Argument: how many recent games to show (default 3).
import fs from 'node:fs';
import path from 'node:path';

const N = Number(process.argv[2] ?? process.argv[1]) || 3;
const ROOT = path.resolve('data/games');
const files = [];
for (const g of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) {
  const dir = path.join(ROOT, g);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const n of fs.readdirSync(dir)) if (n.endsWith('.json')) files.push(path.join(dir, n));
}
files.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
// madness | cerenovus | mezepheles | pixie | keyword
const HIT = /\u75af\u72c2|\u6d17\u8111|\u7075\u8a00|\u5c0f\u7cbe\u7075|\u5173\u952e\u8bcd/;
for (const f of files.slice(0, N)) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('='.repeat(60));
  console.log(path.basename(f), '| winner:', d.winner, '|', d.reason);
  console.log('players:', d.players.map((p) => `${p.seat}:${p.name}=${p.role}${p.shownRole && p.shownRole !== p.role ? `(thinks ${p.shownRole})` : ''}${p.evil ? '[evil]' : ''}`).join('  '));
  for (const e of d.timeline ?? []) if (HIT.test(e.text ?? '')) console.log(`  [${e.when}] (${e.kind}) ${e.text}`);
  for (const h of d.heard ?? []) console.log(`  heard: id=${h.id} kind=${h.kind} claim=${h.claim} verdict=${h.verdict} reason=${h.reason ?? ''} lines=${JSON.stringify(h.lines ?? []).slice(0, 300)}`);
  const dec = (d.decisions ?? []).filter((x) => /cerenovus|madness|mutant|pixie|mez/i.test(x.kind ?? ''));
  for (const x of dec) console.log(`  decision: ${x.kind} who=${x.who ?? ''} chosen=${JSON.stringify(x.chosen)}`);
}
