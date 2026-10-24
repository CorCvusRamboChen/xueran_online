#!/usr/bin/env bash
# 部署到家里的 Mac mini（https://botc.rambooo.com）：
# 本地构建 → 打包 → scp → 换目录（保留 data/ 和 node_modules/）→ npm ci → launchd 重启。
# 环境变量放在 Mac 上的 ~/apps/botc.env（不随代码上传），第一次部署前要先建好。
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${HOST:-rambochen@100.80.146.66}
SSH="ssh -i $HOME/.ssh/id_ed25519 -o BatchMode=yes $HOST"

npm run build
tar --force-local -czf "${TMPDIR:-/tmp}/botc.tgz" package.json package-lock.json src client/dist scripts/botc-start.sh
cat "${TMPDIR:-/tmp}/botc.tgz" | $SSH 'set -e
  mkdir -p ~/apps/logs ~/apps/botc
  rm -rf ~/apps/.botc_new && mkdir ~/apps/.botc_new
  tar -xzf - -C ~/apps/.botc_new
  for keep in data node_modules; do [ -e ~/apps/botc/$keep ] && mv ~/apps/botc/$keep ~/apps/.botc_new/; done
  rm -rf ~/apps/botc && mv ~/apps/.botc_new ~/apps/botc
  cd ~/apps/botc && PATH=~/.local/node/bin:$PATH npm ci --omit=dev --no-audit --no-fund
  chmod +x scripts/botc-start.sh
  launchctl kickstart -k gui/$(id -u)/com.rambochen.botc 2>/dev/null || launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rambochen.botc.plist'
echo "已部署：https://botc.rambooo.com"
