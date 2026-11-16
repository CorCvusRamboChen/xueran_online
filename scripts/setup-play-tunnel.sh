#!/usr/bin/env bash
# 一次性：让 play.rambooo.com 走 rambooo.com 那条 Cloudflare 隧道（rambooo-my-web，~/.cloudflared/config.yml）指到本机 3002。
# 先备份 config.yml，在兜底的 http_status:404 规则前面插一条；再登记 DNS；最后重启隧道（rambooo.com、botc.rambooo.com 会断几秒）。
# DNS 那步要 ~/.cloudflared/cert.pem；没有的话脚本会提示去 Cloudflare 后台手动加一条 CNAME。
set -euo pipefail
ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 'set -e
  C=~/.cloudflared/config.yml
  if grep -q "play.rambooo.com" "$C"; then echo "config.yml 里已经有 play.rambooo.com"; else
    cp "$C" ~/apps/cloudflared-config.yml.bak-play
    awk "/service: *http_status/ && !done { print \"  - hostname: play.rambooo.com\"; print \"    service: http://127.0.0.1:3002\"; done=1 } { print }" ~/apps/cloudflared-config.yml.bak-play > "$C"
    grep -q "play.rambooo.com" "$C" || { cp ~/apps/cloudflared-config.yml.bak-play "$C"; echo "没找到兜底规则，config.yml 没改，请手动加"; exit 1; }
    echo "config.yml 已加 play.rambooo.com（备份在 ~/apps/cloudflared-config.yml.bak-play）"
  fi
  CF=~/apps/bin/cloudflared
  $CF tunnel ingress validate --config "$C" || { [ -f ~/apps/cloudflared-config.yml.bak-play ] && cp ~/apps/cloudflared-config.yml.bak-play "$C"; echo "新规则没通过检查，已还原 config.yml，隧道没动"; exit 1; }
  if $CF tunnel route dns rambooo-my-web play.rambooo.com; then echo "DNS 已登记"; else
    echo "DNS 没登记上：去 Cloudflare 后台 rambooo.com → DNS 加一条 CNAME play → <隧道 id>.cfargotunnel.com（代理开着）"; fi
  P=~/Library/LaunchAgents/com.rambochen.myweb.cloudflared.plist
  launchctl bootout gui/$(id -u)/com.rambochen.myweb.cloudflared || true
  sleep 1
  launchctl bootstrap gui/$(id -u) "$P"
  sleep 5
  launchctl list | grep myweb.cloudflared'
echo "隧道已重启；过一两分钟打开 https://play.rambooo.com 看看"
