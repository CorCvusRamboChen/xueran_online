#!/usr/bin/env bash
# Read-only look at recent games on the Mac mini, on BOTH servers (main ~/apps/botc and trial ~/apps/botc-play).
# Lists finished game archives (data/games) and room snapshots that still hold a game (data/rooms, includes unfinished games),
# newest first, numbered. Usage (Git Bash):
#   bash scripts/list-last-games.sh          list them (also saved to data/prod/list.txt)
#   bash scripts/list-last-games.sh 3        copy entry 3 to data/prod/pick.json
set -euo pipefail
mkdir -p data/prod
PICK="${1:-}"
OUT=data/prod/list.txt
[ -n "$PICK" ] && OUT=data/prod/pick.json
ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 "cd ~/apps && PICK='$PICK' ~/.local/node/bin/node --input-type=module -e '
import fs from \"node:fs\"; import path from \"node:path\";
const items = [];
const walk = (d, f) => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p, f); else if (n.endsWith(\".json\")) f(p); } };
for (const app of [\"botc\", \"botc-play\"]) {
  walk(path.join(app, \"data/games\"), (p) => { try { const j = JSON.parse(fs.readFileSync(p, \"utf8\")); items.push({ at: j.endedAt, src: app + \" done\", p, players: j.players, winner: j.winner, day: j.days }); } catch {} });
  walk(path.join(app, \"data/rooms\"), (p) => { try { const j = JSON.parse(fs.readFileSync(p, \"utf8\")); const g = j.game; if (!g || !g.players) return; items.push({ at: j.savedAt ?? fs.statSync(p).mtimeMs, src: app + (j.ended ? \" room-ended\" : \" room-live\"), p, players: g.players, winner: g.winner, day: g.day, script: g.script }); } catch {} });
}
items.sort((a, b) => b.at - a.at);
const top = items.slice(0, 15);
const pick = Number(process.env.PICK);
if (pick) { process.stdout.write(fs.readFileSync(top[pick - 1].p, \"utf8\")); process.exit(0); }
top.forEach((x, i) => console.log(String(i + 1).padStart(2), new Date(x.at).toISOString().slice(0, 16), x.src.padEnd(20), (x.script ?? \"\").padEnd(5), x.players.length + \"p\", \"day\" + x.day, x.winner ?? \"-\", \"|\", x.players.map((p) => p.seat + \":\" + p.role).join(\" \")));
'" > "$OUT"
if [ -n "$PICK" ]; then echo "saved data/prod/pick.json"; else cat "$OUT"; fi
