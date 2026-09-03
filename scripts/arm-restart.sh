#!/bin/zsh
set -euo pipefail

support_script="$HOME/Library/Application Support/CodexContextStatus/restart-once.sh"
label="io.github.sunnykaibai.codex-context-status.restart-once"
launch_agent="$HOME/Library/LaunchAgents/$label.plist"
service_target="gui/$(id -u)"
project_dir="${0:A:h:h}"

if [[ ! -x "$support_script" ]]; then
  print -u2 "Run ./install.sh first."
  exit 1
fi

/bin/launchctl bootout "$service_target/$label" 2>/dev/null || true
install -m 644 "$project_dir/launchd/$label.plist" "$launch_agent"
/usr/bin/plutil -replace ProgramArguments -json "[\"$support_script\"]" "$launch_agent"
/usr/bin/plutil -lint "$launch_agent" >/dev/null
/bin/launchctl bootstrap "$service_target" "$launch_agent"
print "Restart is armed. Quit ChatGPT completely; the context-enabled launcher will reopen it."
