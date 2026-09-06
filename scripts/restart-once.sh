#!/bin/zsh
set -euo pipefail

while /bin/ps -axo command= | /usr/bin/awk \
  '$1 == "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT" { found = 1 } END { exit !found }'; do
  sleep 0.5
done

/usr/bin/open "$HOME/Applications/ChatGPT Context Status.app"
