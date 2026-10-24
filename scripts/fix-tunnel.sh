#!/usr/bin/env bash
# 让 Mac mini 上 rambooo.com 的隧道改用 ~/apps/bin/cloudflared（原来那份程序的文件夹已被删），
# 并重启隧道，使新加的 botc.rambooo.com 生效。rambooo.com 和 squad-pool.com 会断几秒。
set -euo pipefail
ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 'set -e
  P=~/Library/LaunchAgents/com.rambochen.myweb.cloudflared.plist
  mkdir -p ~/apps/bin
  [ -x ~/apps/bin/cloudflared ] || cp ~/Sites/squadup/bin/cloudflared ~/apps/bin/cloudflared
  cp "$P" ~/apps/myweb.cloudflared.plist.bak
  /usr/libexec/PlistBuddy -c "Set :ProgramArguments:0 /Users/rambochen/apps/bin/cloudflared" "$P"
  launchctl bootout gui/$(id -u)/com.rambochen.myweb.cloudflared || true
  sleep 1
  launchctl bootstrap gui/$(id -u) "$P"
  sleep 5
  launchctl list | grep myweb.cloudflared'
echo "隧道已重启"
