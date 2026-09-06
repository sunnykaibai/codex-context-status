#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h}"
support_dir="$HOME/Library/Application Support/CodexContextStatus"
launcher_app="$HOME/Applications/ChatGPT Context Status.app"
launcher_contents="$launcher_app/Contents"
launch_agent="$HOME/Library/LaunchAgents/io.github.sunnykaibai.codex-context-status.injector.plist"
supervisor_label="io.github.sunnykaibai.codex-context-status.supervisor"
supervisor_agent="$HOME/Library/LaunchAgents/$supervisor_label.plist"
activation_label="io.github.sunnykaibai.codex-context-status.legacy-activate-on-exit"
activation_agent="$HOME/Library/LaunchAgents/$activation_label.plist"
native_activation_label="io.github.sunnykaibai.codex-context-status.native-on-exit"
native_activation_agent="$HOME/Library/LaunchAgents/$native_activation_label.plist"
log_path="$HOME/Library/Logs/CodexContextStatus.log"
service_target="gui/$(id -u)"
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
  if "$candidate" -e 'process.exit(typeof fetch === "function" && typeof WebSocket === "function" ? 0 : 1)' >/dev/null 2>&1; then
    node_path="$candidate"
    break
  fi
done
if [[ -z "$node_path" ]]; then
  print -u2 "A Node.js runtime with fetch and WebSocket support is required."
  exit 1
fi

mkdir -p "$support_dir" "$launcher_contents/MacOS" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
install -m 644 "$project_dir/src/injector.mjs" "$support_dir/injector.mjs"
install -m 755 "$project_dir/src/native-setting.mjs" "$support_dir/native-setting.mjs"
install -m 755 "$project_dir/scripts/restart-once.sh" "$support_dir/restart-once.sh"
install -m 755 "$project_dir/scripts/supervisor.sh" "$support_dir/supervisor.sh"
install -m 755 "$project_dir/scripts/legacy-activate-on-exit.sh" "$support_dir/legacy-activate-on-exit.sh"
install -m 755 "$project_dir/scripts/launcher.sh" "$launcher_contents/MacOS/launcher.sh"
install -m 644 "$project_dir/app/Info.plist" "$launcher_contents/Info.plist"
/usr/bin/codesign --force --sign - "$launcher_app"

install -m 644 "$project_dir/launchd/io.github.sunnykaibai.codex-context-status.injector.plist" "$launch_agent"
/usr/bin/plutil -replace ProgramArguments -json "[\"$node_path\",\"$support_dir/injector.mjs\"]" "$launch_agent"
/usr/bin/plutil -replace StandardOutPath -string "$log_path" "$launch_agent"
/usr/bin/plutil -replace StandardErrorPath -string "$log_path" "$launch_agent"
/usr/bin/plutil -lint "$launcher_contents/Info.plist" "$launch_agent"

install -m 644 "$project_dir/launchd/$supervisor_label.plist" "$supervisor_agent"
/usr/bin/plutil -replace ProgramArguments -json \
  "[\"$support_dir/supervisor.sh\",\"$chatgpt_executable\",\"$launcher_app\"]" \
  "$supervisor_agent"
/usr/bin/plutil -replace StandardOutPath -string "$log_path" "$supervisor_agent"
/usr/bin/plutil -replace StandardErrorPath -string "$log_path" "$supervisor_agent"
/usr/bin/plutil -lint "$supervisor_agent"

/bin/launchctl bootout "$service_target/io.github.sunnykaibai.codex-context-status.injector" 2>/dev/null || true
/bin/launchctl enable "$service_target/io.github.sunnykaibai.codex-context-status.injector"
/bin/launchctl bootstrap "$service_target" "$launch_agent"
/bin/launchctl kickstart -k "$service_target/io.github.sunnykaibai.codex-context-status.injector"

# Cancel a pending native-mode activation so it cannot race this installer and
# reopen the app without CDP after the current process exits.
/bin/launchctl bootout "$service_target/$native_activation_label" 2>/dev/null || true
if [[ -e "$native_activation_agent" ]]; then
  mv "$native_activation_agent" "$native_activation_agent.canceled"
fi

/bin/launchctl bootout "$service_target/$supervisor_label" 2>/dev/null || true
/bin/launchctl bootout "$service_target/$activation_label" 2>/dev/null || true
if /bin/ps -axo command= | /usr/bin/awk -v executable="$chatgpt_executable" \
  '$1 == executable { found = 1 } END { exit !found }'; then
  install -m 644 "$project_dir/launchd/$activation_label.plist" "$activation_agent"
  /usr/bin/plutil -replace ProgramArguments -json \
    "[\"$support_dir/legacy-activate-on-exit.sh\",\"$chatgpt_executable\",\"$launcher_app\",\"$supervisor_agent\",\"$activation_agent\",\"$service_target\",\"$node_path\",\"$support_dir/native-setting.mjs\"]" \
    "$activation_agent"
  /usr/bin/plutil -lint "$activation_agent"
  /bin/launchctl bootstrap "$service_target" "$activation_agent"
  activation_state="armed"
else
  "$node_path" "$support_dir/native-setting.mjs" disable
  /bin/launchctl bootstrap "$service_target" "$supervisor_agent"
  /usr/bin/open "$launcher_app"
  activation_state="enabled"
fi

print "Installed the combined context and quota bar ($activation_state)."
if [[ "$activation_state" == "armed" ]]; then
  print "Quit ChatGPT completely once. The installer will reopen it with the full bar."
fi
print "Future starts from the official icon and updater relaunches are checked automatically."
