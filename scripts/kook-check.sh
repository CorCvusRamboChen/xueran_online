#!/usr/bin/env bash
# Check whether the KOOK bot is configured and logged in on the Mac mini (never prints the token).
# Usage (Git Bash): bash scripts/kook-check.sh
ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes rambochen@100.80.146.66 '
  if grep -q "^KOOK_TOKEN=." ~/apps/botc.env; then echo "KOOK_TOKEN: set"; else echo "KOOK_TOKEN: NOT set"; fi
  echo "--- last KOOK log lines ---"
  grep -h -a -i "kook" ~/apps/logs/* 2>/dev/null | grep -v -i "token=" | tail -8
'
