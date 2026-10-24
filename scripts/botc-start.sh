#!/bin/bash
# Mac mini 上的启动脚本，由 launchd（com.rambochen.botc）调用。
# 读 ~/apps/botc.env 里的环境变量（Discord 密钥、Azure 语音、PORT=3001），然后启动服务。
cd "$HOME/apps/botc"
set -a; . "$HOME/apps/botc.env"; set +a
exec "$HOME/.local/node/bin/node" src/server/index.js
