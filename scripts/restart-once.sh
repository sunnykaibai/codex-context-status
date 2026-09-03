#!/bin/zsh
set -euo pipefail

while /usr/bin/pgrep -x ChatGPT >/dev/null 2>&1; do
  sleep 0.5
done

/usr/bin/open "$HOME/Applications/ChatGPT Context Status.app"
