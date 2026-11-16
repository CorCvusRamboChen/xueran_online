#!/bin/bash
# Mac mini 上「单独的试玩服务器」的启动脚本，由 launchd（com.rambochen.botc-play）调用。
# 只开网页单机试玩（PLAY_ONLY=1），端口 3002，数据在 ~/apps/botc-play/data（和正式服务器 ~/apps/botc 分开）。
# 不配任何 Discord / KOOK / Azure 的密钥：没有机器人，旁白用各人设备自带的语音。排行榜从正式服务器读。
cd "$HOME/apps/botc-play"
export PORT=3002 PLAY_ONLY=1 PUBLIC_URL=https://play.rambooo.com LEADERBOARD_URL=http://127.0.0.1:3001/api/leaderboard
[ -f "$HOME/apps/botc-play.env" ] && { set -a; . "$HOME/apps/botc-play.env"; set +a; } # 想覆盖上面的值时再建
exec "$HOME/.local/node/bin/node" src/server/index.js
