#!/bin/zsh
set -euo pipefail

node_path="$1"
setting_script="$2"
chatgpt_executable="$3"
chatgpt_app="$4"
launch_agent="$5"

is_chatgpt_running() {
  /bin/ps -axo command= | /usr/bin/awk -v executable="$chatgpt_executable" \
    '$1 == executable { found = 1 } END { exit !found }'
}

while is_chatgpt_running; do
  sleep 0.5
done

"$node_path" "$setting_script" enable
mv "$launch_agent" "$launch_agent.completed"
/usr/bin/open "$chatgpt_app"
