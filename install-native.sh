#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h}"
service_target="gui/$(id -u)"
legacy_label="io.github.sunnykaibai.codex-context-status.injector"
supervisor_label="io.github.sunnykaibai.codex-context-status.supervisor"
activation_label="io.github.sunnykaibai.codex-context-status.native-on-exit"
support_dir="$HOME/Library/Application Support/CodexContextStatus"
activation_agent="$HOME/Library/LaunchAgents/$activation_label.plist"
chatgpt_app="${CHATGPT_APP_PATH:-/Applications/ChatGPT.app}"
chatgpt_executable="$chatgpt_app/Contents/MacOS/ChatGPT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This project currently supports macOS only."
  exit 1
fi
if [[ ! -d "$chatgpt_app" ]]; then
  print -u2 "ChatGPT.app was not found at: $chatgpt_app"
  exit 1
fi

node_candidates=(
  "$chatgpt_app/Contents/Resources/cua_node/bin/node"
  "${commands[node]:-}"
)
node_path=""
for candidate in "${node_candidates[@]}"; do
  [[ -n "$candidate" && -x "$candidate" ]] || continue
  if "$candidate" -e 'process.exit(typeof structuredClone === "function" ? 0 : 1)' >/dev/null 2>&1; then
    node_path="$candidate"
    break
  fi
done
if [[ -z "$node_path" ]]; then
  print -u2 "A modern Node.js runtime is required."
  exit 1
fi

/bin/launchctl bootout "$service_target/$legacy_label" 2>/dev/null || true
/bin/launchctl disable "$service_target/$legacy_label" >/dev/null 2>&1 || true
/bin/launchctl bootout "$service_target/$supervisor_label" 2>/dev/null || true

if /bin/ps -axo command= | /usr/bin/awk -v executable="$chatgpt_executable" \
  '$1 == executable { found = 1 } END { exit !found }'; then
  mkdir -p "$support_dir" "$HOME/Library/LaunchAgents"
  install -m 755 "$project_dir/scripts/native-on-exit.sh" "$support_dir/native-on-exit.sh"
  install -m 755 "$project_dir/src/native-setting.mjs" "$support_dir/native-setting.mjs"
  install -m 644 "$project_dir/launchd/$activation_label.plist" "$activation_agent"
  /usr/bin/plutil -replace ProgramArguments -json \
    "[\"$support_dir/native-on-exit.sh\",\"$node_path\",\"$support_dir/native-setting.mjs\",\"$chatgpt_executable\",\"$chatgpt_app\",\"$activation_agent\"]" \
    "$activation_agent"
  /usr/bin/plutil -lint "$activation_agent" >/dev/null
  /bin/launchctl bootout "$service_target/$activation_label" 2>/dev/null || true
  /bin/launchctl bootstrap "$service_target" "$activation_agent"
  activation_state="armed"
else
  "$node_path" "$project_dir/src/native-setting.mjs" enable
  activation_state="enabled"
fi

print "Installed the compact native context indicator ($activation_state)."
if [[ "$activation_state" == "armed" ]]; then
  print "Quit ChatGPT completely once; the installer will apply the setting and reopen it."
fi
