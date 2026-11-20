#!/usr/bin/env bash
# Read-only: evil win rate on both servers (main ~/apps/botc and trial ~/apps/botc-play), the numbers the AI storyteller's
# "how much to help evil" tilt is computed from (src/server/winrate.js: AI storyteller, >= 4 humans, BOTC games only, last 80).
# Also prints all games (any humans) per script for reference. Usage (Git Bash):  bash scripts/winrates.sh
set -euo pipefail
mkdir -p data/prod
ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 "cd ~/apps && for app in botc botc-play; do echo \"== \$app\"; (cd \$app && ~/.local/node/bin/node --input-type=module -e '
import fs from \"node:fs\"; import path from \"node:path\";
const { usable, summarize, evilTilt } = await import(path.resolve(\"src/server/winrate.js\")).catch(() => ({}));
const dir = \"data/games\"; const all = [];
for (const g of fs.existsSync(dir) ? fs.readdirSync(dir) : []) for (const n of fs.readdirSync(path.join(dir, g))) { try { all.push(JSON.parse(fs.readFileSync(path.join(dir, g, n), \"utf8\"))); } catch {} }
const bo = all.filter((d) => [\"good\", \"evil\"].includes(d.winner));
const hum = (d) => d.players.filter((p) => p.id && !/^bot-/.test(p.id)).length;
console.log(\"archives\", all.length, \"good/evil games\", bo.length, \"evil wins\", bo.filter((d) => d.winner === \"evil\").length);
for (const k of [1, 4, 6]) { const s = bo.filter((d) => hum(d) >= k); console.log(\"  humans>=\" + k + \":\", s.length, \"games, evil\", s.filter((d) => d.winner === \"evil\").length, s.length ? \"(\" + Math.round(100 * s.filter((d) => d.winner === \"evil\").length / s.length) + \"%)\" : \"\"); }
if (usable) {
  const u = all.map(usable).filter(Boolean).sort((a, b) => b.endedAt - a.endedAt);
  const s = summarize(u.slice(0, 80));
  console.log(\"  used for tilt (last 80):\", JSON.stringify(s.all));
  for (const [k, v] of Object.entries(s.scripts).sort((a, b) => b[1].n - a[1].n)) console.log(\"   \", k.padEnd(5), String(v.n).padStart(3), \"games, evil\", v.evil, \"(\" + Math.round(100 * v.evil / v.n) + \"%)\", \"tilt\", v.tilt.toFixed(2));
  for (const sc of [\"tb\", \"bmr\", \"snv\", \"mo\"]) { const t = evilTilt(sc, { games: u.slice(0, 80), env: {} }); console.log(\"   next\", sc, t.tilt.toFixed(2), t.why); }
} else console.log(\"  (winrate.js not deployed here yet)\");
'); done" | tee data/prod/winrates.txt
