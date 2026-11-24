#!/usr/bin/env bash
# 部署到家里的 Mac mini（https://botc.rambooo.com）：
# 本地构建 → 打包 → scp → 换目录（保留 data/ 和 node_modules/）→ npm ci → launchd 重启。
# 环境变量放在 Mac 上的 ~/apps/botc.env（不随代码上传），第一次部署前要先建好。
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${HOST:-rambochen@100.80.146.66}
SSH="ssh -i $HOME/.ssh/id_ed25519 -o BatchMode=yes $HOST"

npm run build
tar --force-local -czf "${TMPDIR:-/tmp}/botc.tgz" package.json package-lock.json src assets client/dist scripts/botc-start.sh
cat "${TMPDIR:-/tmp}/botc.tgz" | $SSH 'set -e
  mkdir -p ~/apps/logs ~/apps/botc
  rm -rf ~/apps/.botc_new && mkdir ~/apps/.botc_new
  tar -xzf - -C ~/apps/.botc_new
  for keep in data node_modules; do [ -e ~/apps/botc/$keep ] && mv ~/apps/botc/$keep ~/apps/.botc_new/; done
  # 2026-11-24：有局在打时旧进程还在往 data/ 里写（录音、存档），rm -rf 删不干净、部署中断，正式服停了。
  # 现在旧目录整个改名挪开（改名不会失败），换上新目录、装好依赖；重启前后各把旧进程这段时间写的文件并过来（.jsonl 接在后面，其他覆盖；重启后只补新文件）
  rm -rf ~/apps/.botc_old; mv ~/apps/botc ~/apps/.botc_old && mv ~/apps/.botc_new ~/apps/botc
  merge() { [ -d ~/apps/.botc_old/data ] || return 0; (cd ~/apps/.botc_old/data && find . -type f | while read -r f; do d=~/apps/botc/data/$f; mkdir -p "$(dirname "$d")"; if [ "$1" = new ] && [ -e "$d" ]; then continue; fi; case "$f" in *.jsonl) if [ -e "$d" ]; then cat "$f" >> "$d"; else cp -p "$f" "$d"; fi;; *) cp -p "$f" "$d";; esac; rm -f "$f"; done); }
  cd ~/apps/botc && PATH=~/.local/node/bin:$PATH npm ci --omit=dev --no-audit --no-fund
  chmod +x scripts/botc-start.sh
  merge all
  launchctl kickstart -k gui/$(id -u)/com.rambochen.botc 2>/dev/null || launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rambochen.botc.plist
  sleep 2; merge new; rm -rf ~/apps/.botc_old'
echo "已部署：https://botc.rambooo.com"
