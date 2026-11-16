#!/usr/bin/env bash
# 部署单独的试玩服务器到家里的 Mac mini（https://play.rambooo.com，官网「在线试玩」按钮指向这里）：
# 和正式服务器（deploy-mac.sh，~/apps/botc，端口 3001）用同一份代码，但目录、端口、数据、launchd 都分开，
# 试玩的人再多也不影响 Discord 里的正式局。第一次部署会建 launchd（com.rambochen.botc-play）；
# 域名要先跑一次 scripts/setup-play-tunnel.sh。
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${HOST:-rambochen@100.80.146.66}
SSH="ssh -i $HOME/.ssh/id_ed25519 -o BatchMode=yes $HOST"

npm run build
tar --force-local -czf "${TMPDIR:-/tmp}/botc-play.tgz" package.json package-lock.json src assets client/dist scripts/botc-play-start.sh
cat "${TMPDIR:-/tmp}/botc-play.tgz" | $SSH 'set -e
  mkdir -p ~/apps/logs ~/apps/botc-play
  rm -rf ~/apps/.botc-play_new && mkdir ~/apps/.botc-play_new
  tar -xzf - -C ~/apps/.botc-play_new
  for keep in data node_modules; do [ -e ~/apps/botc-play/$keep ] && mv ~/apps/botc-play/$keep ~/apps/.botc-play_new/; done
  rm -rf ~/apps/botc-play && mv ~/apps/.botc-play_new ~/apps/botc-play
  cd ~/apps/botc-play && PATH=~/.local/node/bin:$PATH npm ci --omit=dev --no-audit --no-fund
  chmod +x scripts/botc-play-start.sh
  P=~/Library/LaunchAgents/com.rambochen.botc-play.plist
  if [ ! -f "$P" ]; then
    cat > "$P" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.rambochen.botc-play</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$HOME/apps/botc-play/scripts/botc-play-start.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/apps/logs/botc-play.out.log</string>
  <key>StandardErrorPath</key><string>$HOME/apps/logs/botc-play.err.log</string>
</dict></plist>
PLIST
  fi
  launchctl kickstart -k gui/$(id -u)/com.rambochen.botc-play 2>/dev/null || launchctl bootstrap gui/$(id -u) "$P"
  sleep 3
  curl -s -o /dev/null -w "本机 3002：%{http_code}\n" http://127.0.0.1:3002/api/config'
echo "已部署试玩服务器：https://play.rambooo.com （本机端口 3002）"
