#!/bin/zsh
set -euo pipefail

debug_port="${CODEX_CONTEXT_STATUS_PORT:-17654}"
chatgpt_app="${CHATGPT_APP_PATH:-/Applications/ChatGPT.app}"

if [[ ! -d "$chatgpt_app" ]]; then
  print -u2 "ChatGPT.app was not found at: $chatgpt_app"
  exit 1
fi

if /usr/sbin/lsof -nP -iTCP:"$debug_port" -sTCP:LISTEN >/dev/null 2>&1; then
  /usr/bin/open -a "$chatgpt_app"
  exit 0
fi

if /usr/bin/pgrep -x ChatGPT >/dev/null 2>&1; then
  print -u2 "ChatGPT is already running without the local debugging port. Quit it, then run this launcher again."
  exit 2
fi

/usr/bin/open -na "$chatgpt_app" --args \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$debug_port"
