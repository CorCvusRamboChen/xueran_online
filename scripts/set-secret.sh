#!/usr/bin/env bash
# 把剪贴板里的 Discord 密钥写进 Mac mini 的 ~/apps/botc.env，然后重启服务。屏幕上不会显示密钥。
# 用法：先在开发者后台复制好，再运行
#   bash scripts/set-secret.sh DISCORD_CLIENT_SECRET   （OAuth2 页「重置密钥」后复制）
#   bash scripts/set-secret.sh DISCORD_TOKEN           （Bot 页 Reset Token 后复制）
#   bash scripts/set-secret.sh DEEPSEEK_API_KEY        （造谣者 AI 判定，DeepSeek 开放平台 → API keys）
#   bash scripts/set-secret.sh DEEPSEEK_FAST_API_KEY   （造谣者 AI 判定的快速备用：DeepSeek 的快速模型，主模型超时就换它）
#   bash scripts/set-secret.sh OPENROUTER_API_KEY      （造谣者 AI 判定的备用，openrouter.ai → Keys）
set -euo pipefail
NAME=${1:?要写哪个：DISCORD_CLIENT_SECRET / DISCORD_TOKEN / DEEPSEEK_API_KEY / DEEPSEEK_FAST_API_KEY / OPENROUTER_API_KEY}
case "$NAME" in DISCORD_CLIENT_SECRET|DISCORD_TOKEN|DEEPSEEK_API_KEY|DEEPSEEK_FAST_API_KEY|OPENROUTER_API_KEY) ;; *) echo "只能写 DISCORD_CLIENT_SECRET / DISCORD_TOKEN / DEEPSEEK_API_KEY / DEEPSEEK_FAST_API_KEY / OPENROUTER_API_KEY"; exit 1 ;; esac
# 只留可见的 ASCII 字符：复制时多带的空格、换行、中文标点（比如全角逗号）会让整个请求头发不出去
# 密钥可以直接写在第二个参数里（bash scripts/set-secret.sh 名字 密钥），不写就读剪贴板
if [ -n "${2:-}" ]; then RAW=$2; else RAW=$(cat /dev/clipboard); fi
VALUE=$(printf '%s' "$RAW" | tr -d '\r\n ' | LC_ALL=C tr -cd '\041-\176')
[ -n "$VALUE" ] || { echo "剪贴板是空的，先去开发者后台复制"; exit 1; }
printf '%s=%s\n' "$NAME" "$VALUE" | ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 "set -e
  cd ~/apps; umask 077
  grep -v '^$NAME=' botc.env > botc.env.tmp || true
  cat >> botc.env.tmp; mv botc.env.tmp botc.env
  launchctl kickstart -k gui/\$(id -u)/com.rambochen.botc"
echo "已写入 $NAME（${#VALUE} 个字符），服务已重启"
