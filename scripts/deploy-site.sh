#!/usr/bin/env bash
# 把官网（site/）发布到 https://rambooo.com/botc/ ：
# 打包 → ssh 管道到家里的 Mac mini → 解到 ~/Sites/My_Web/.botc_new → 整个换掉 ~/Sites/My_Web/botc。
# My_Web 是 rambooo.com 的仓库，每分钟 git reset 一次；botc/ 不在那个仓库里，所以不会被冲掉。
# Cloudflare 会把静态文件缓存约 4 小时：改了 style.css / main.js 记得把 index.html 里的 ?v= 加一。
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${HOST:-rambochen@100.80.146.66}
SSH="ssh -i $HOME/.ssh/id_ed25519 -o BatchMode=yes $HOST"

[ -f site/media/trailer/trailer-1920.mp4 ] || { echo "缺宣传片，先跑 bash scripts/site-trailer.sh"; exit 1; }
tar --force-local -czf "${TMPDIR:-/tmp}/botc-site.tgz" -C site .
cat "${TMPDIR:-/tmp}/botc-site.tgz" | $SSH 'set -e
  cd ~/Sites/My_Web
  rm -rf .botc_new && mkdir .botc_new
  tar -xzf - -C .botc_new
  rm -rf botc && mv .botc_new botc'
echo "已发布：https://rambooo.com/botc/"
