#!/usr/bin/env bash
# 把剪贴板里的 Discord 密钥写进 Mac mini 的 ~/apps/botc.env，然后重启服务。屏幕上不会显示密钥。
# 用法：先在开发者后台复制好，再运行
#   bash scripts/set-secret.sh DISCORD_CLIENT_SECRET   （OAuth2 页「重置密钥」后复制）
#   bash scripts/set-secret.sh DISCORD_TOKEN           （Bot 页 Reset Token 后复制）
set -euo pipefail
NAME=${1:?要写哪个：DISCORD_CLIENT_SECRET 或 DISCORD_TOKEN}
case "$NAME" in DISCORD_CLIENT_SECRET|DISCORD_TOKEN) ;; *) echo "只能写 DISCORD_CLIENT_SECRET 或 DISCORD_TOKEN"; exit 1 ;; esac
VALUE=$(tr -d '\r\n ' < /dev/clipboard)
[ -n "$VALUE" ] || { echo "剪贴板是空的，先去开发者后台复制"; exit 1; }
printf '%s=%s\n' "$NAME" "$VALUE" | ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 "set -e
  cd ~/apps; umask 077
  grep -v '^$NAME=' botc.env > botc.env.tmp || true
  cat >> botc.env.tmp; mv botc.env.tmp botc.env
  launchctl kickstart -k gui/\$(id -u)/com.rambochen.botc"
echo "已写入 $NAME（${#VALUE} 个字符），服务已重启"
