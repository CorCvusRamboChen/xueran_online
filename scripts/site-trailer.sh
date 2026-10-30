#!/usr/bin/env bash
# 官网首屏的宣传片：从 design/trailer/demo-v11.mp4（2560×1440 · 60fps）转出三档，去掉声音（配乐是商业歌曲，没有授权）。
# 手机用 1280，普通屏 1920，宽屏和高分屏 2560（选哪档见 site/index.html 里 <source media>）。
# 这几个 mp4 不进仓库（.gitignore），换了宣传片就重跑一次，再 bash scripts/deploy-site.sh。
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=${1:-design/trailer/demo-v11.mp4}
OUT=site/media/trailer
mkdir -p "$OUT"
enc() { # 宽 高 crf 文件名
  ffmpeg -v error -y -i "$SRC" -an -vf "fps=30,scale=$1:$2:flags=lanczos" \
    -c:v libx264 -preset slow -crf "$3" -tune film -profile:v high -pix_fmt yuv420p -movflags +faststart "$OUT/$4"
}
enc 2560 1440 23 trailer-2560.mp4
enc 1920 1080 22 trailer-1920.mp4
enc 1280 720 22 trailer-1280.mp4
# 封面：第 1 秒的片名画面（第 0 帧是黑的）
ffmpeg -v error -y -ss 1 -i "$SRC" -frames:v 1 -q:v 3 "$OUT/poster.jpg"
ls -la "$OUT"
