#!/bin/zsh
set -euo pipefail

support_dir="$HOME/Library/Application Support/CodexContextStatus"
launcher_app="$HOME/Applications/ChatGPT Context Status.app"
launch_agent="$HOME/Library/LaunchAgents/io.github.sunnykaibai.codex-context-status.injector.plist"
restart_launch_agent="$HOME/Library/LaunchAgents/io.github.sunnykaibai.codex-context-status.restart-once.plist"
service_target="gui/$(id -u)"
timestamp="$(date '+%Y%m%d-%H%M%S')"
node_path="$(/usr/bin/plutil -extract ProgramArguments.0 raw -o - "$launch_agent" 2>/dev/null || true)"

if [[ -x "$node_path" && -f "$support_dir/injector.mjs" ]]; then
  "$node_path" "$support_dir/injector.mjs" --remove >/dev/null 2>&1 || true
fi
/bin/launchctl bootout "$service_target/io.github.sunnykaibai.codex-context-status.injector" 2>/dev/null || true
/bin/launchctl bootout "$service_target/io.github.sunnykaibai.codex-context-status.restart-once" 2>/dev/null || true

if [[ -e "$launcher_app" ]]; then
  mv "$launcher_app" "$HOME/.Trash/ChatGPT Context Status-$timestamp.app"
fi
if [[ -e "$support_dir" ]]; then
  mv "$support_dir" "$HOME/.Trash/CodexContextStatus-$timestamp"
fi
if [[ -e "$launch_agent" ]]; then
  mv "$launch_agent" "$HOME/.Trash/io.github.sunnykaibai.codex-context-status.injector-$timestamp.plist"
fi
if [[ -e "$restart_launch_agent" ]]; then
  mv "$restart_launch_agent" "$HOME/.Trash/io.github.sunnykaibai.codex-context-status.restart-once-$timestamp.plist"
fi

print "Uninstalled Codex Context Status. Removed files were moved to Trash."
print "Quit ChatGPT and reopen the official app normally to close the debugging port."
