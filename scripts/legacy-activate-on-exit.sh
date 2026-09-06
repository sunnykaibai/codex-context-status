#!/bin/zsh
set -euo pipefail

chatgpt_executable="$1"
launcher_app="$2"
supervisor_agent="$3"
activation_agent="$4"
service_target="$5"
node_path="$6"
native_setting_script="$7"

is_chatgpt_running() {
  /bin/ps -axo command= | /usr/bin/awk -v executable="$chatgpt_executable" \
    '$1 == executable { found = 1 } END { exit !found }'
}

while is_chatgpt_running; do
  sleep 0.5
done

"$node_path" "$native_setting_script" disable
mv "$activation_agent" "$activation_agent.completed"
/bin/launchctl bootstrap "$service_target" "$supervisor_agent"
/usr/bin/open "$launcher_app"
