#!/usr/bin/env bash
# Read-only: "说书人想了想……" but no answer. For both servers (main ~/apps/botc, trial ~/apps/botc-play):
#   1. rooms with a game: every question to the storyteller (amnesiac / all-amnesiac / fisherman / artist) and the answer recorded after it;
#   2. the last AI-related warnings in the server logs (provider failures, HTTP 402 = out of balance, errors in the ask flows).
# Usage (Git Bash):  bash scripts/ask-log.sh      output also saved to data/prod/ask-log.txt
set -euo pipefail
mkdir -p data/prod
ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 "cd ~/apps && for app in botc botc-play; do echo \"===== \$app\"; (cd \$app && ~/.local/node/bin/node --input-type=module -e '
import fs from \"node:fs\"; import path from \"node:path\";
const files = [];
const walk = (d) => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith(\".json\")) files.push(p); } };
walk(\"data/rooms\");
const ask = /问自己是谁|失忆者|渔夫|艺术家|得到建议|猜\"|问\"/;
for (const p of files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(0, 3)) {
  let j; try { j = JSON.parse(fs.readFileSync(p, \"utf8\")); } catch { continue; }
  const g = j.game; if (!g?.timeline) continue;
  console.log(\"-- room\", p, \"script\", g.script, \"day\", g.day, \"saved\", new Date(j.savedAt ?? fs.statSync(p).mtimeMs).toISOString());
  for (const e of g.timeline.filter((e) => ask.test(e.text)).slice(-20)) console.log(\"  \", e.when, e.kind, e.text.slice(0, 160).replace(/\\n/g, \" \"));
}
'); for f in ../logs/\$app.out.log ../logs/\$app.err.log; do [ -f \$f ] || continue; echo \"-- \$f (AI lines, last 25)\"; tail -n 4000 \$f | grep -E '回答失败|出错|HTTP 4|HTTP 5|402|insufficient|balance' | tail -n 25 || true; done; done" | tee data/prod/ask-log.txt
