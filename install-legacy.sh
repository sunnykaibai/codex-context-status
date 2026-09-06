#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h}"
support_dir="$HOME/Library/Application Support/CodexContextStatus"
launcher_app="$HOME/Applications/ChatGPT Context Status.app"
launcher_contents="$launcher_app/Contents"
launch_agent="$HOME/Library/LaunchAgents/io.github.sunnykaibai.codex-context-status.injector.plist"
log_path="$HOME/Library/Logs/CodexContextStatus.log"
service_target="gui/$(id -u)"
chatgpt_app="${CHATGPT_APP_PATH:-/Applications/ChatGPT.app}"

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
install -m 755 "$project_dir/scripts/restart-once.sh" "$support_dir/restart-once.sh"
install -m 755 "$project_dir/scripts/launcher.sh" "$launcher_contents/MacOS/launcher.sh"
install -m 644 "$project_dir/app/Info.plist" "$launcher_contents/Info.plist"
/usr/bin/codesign --force --sign - "$launcher_app"

install -m 644 "$project_dir/launchd/io.github.sunnykaibai.codex-context-status.injector.plist" "$launch_agent"
/usr/bin/plutil -replace ProgramArguments -json "[\"$node_path\",\"$support_dir/injector.mjs\"]" "$launch_agent"
/usr/bin/plutil -replace StandardOutPath -string "$log_path" "$launch_agent"
/usr/bin/plutil -replace StandardErrorPath -string "$log_path" "$launch_agent"
/usr/bin/plutil -lint "$launcher_contents/Info.plist" "$launch_agent"

/bin/launchctl bootout "$service_target/io.github.sunnykaibai.codex-context-status.injector" 2>/dev/null || true
/bin/launchctl enable "$service_target/io.github.sunnykaibai.codex-context-status.injector"
/bin/launchctl bootstrap "$service_target" "$launch_agent"
/bin/launchctl kickstart -k "$service_target/io.github.sunnykaibai.codex-context-status.injector"

print "Installed the legacy combined context and quota bar."
print "Quit ChatGPT completely, then open: $launcher_app"
print "This mode still depends on the special launcher after every full quit or app update."
