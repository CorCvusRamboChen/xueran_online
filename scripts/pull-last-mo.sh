#!/usr/bin/env bash
# Copy the most recent finished Midnight Oasis game archive from the Mac mini to data/prod/last-mo.json.
# Read-only on the server. A game counts as Midnight Oasis when every non-traveller character is on that script
# (Lil' Monsta / Leviathan included for the demon switch; traveller characters ignored). Usage (Git Bash): bash scripts/pull-last-mo.sh
set -euo pipefail
mkdir -p data/prod
ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 'cd ~/apps/botc && ~/.local/node/bin/node --input-type=module -e "
import fs from \"node:fs\"; import path from \"node:path\";
const TRAV = new Set([\"bureaucrat\",\"thief\",\"gunslinger\",\"scapegoat\",\"beggar\",\"judge\",\"matron\",\"voudon\",\"apprentice\",\"bishop\",\"gnome\",\"deviant\",\"bonecollector\",\"barista\",\"harlot\",\"butcher\"]);
const MO = new Set([\"noble\",\"snakecharmer\",\"balloonist\",\"huntsman\",\"engineer\",\"fisherman\",\"professor\",\"savant\",\"amnesiac\",\"farmer\",\"cannibal\",\"poppygrower\",\"atheist\",\"drunk\",\"barber\",\"golem\",\"damsel\",\"poisoner\",\"psychopath\",\"mezepheles\",\"pithag\",\"alhadikhia\",\"vigormortis\",\"lilmonsta\",\"leviathan\"]);
const files = [];
for (const g of fs.readdirSync(\"data/games\")) { const d = path.join(\"data/games\", g); if (fs.statSync(d).isDirectory()) for (const n of fs.readdirSync(d)) if (n.endsWith(\".json\")) files.push(path.join(d, n)); }
files.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
for (const f of files.slice(0, 60)) {
  const j = JSON.parse(fs.readFileSync(f, \"utf8\"));
  const roles = j.players.filter((p) => !p.traveller && !TRAV.has(p.role)).map((p) => p.role); // archives do not mark travellers: skip traveller characters
  if (roles.length && roles.every((r) => MO.has(r)) && roles.some((r) => [\"mezepheles\",\"golem\",\"alhadikhia\",\"engineer\",\"atheist\",\"poppygrower\"].includes(r))) { console.error(f); process.stdout.write(JSON.stringify(j)); process.exit(0); }
}
console.error(\"no Midnight Oasis game in the last 60 archives\"); process.exit(1);
"' > data/prod/last-mo.json
echo "saved data/prod/last-mo.json ($(wc -c < data/prod/last-mo.json) bytes)"
