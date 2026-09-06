#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h}"
service_target="gui/$(id -u)"
legacy_label="io.github.sunnykaibai.codex-context-status.injector"
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
  if "$candidate" -e 'process.exit(typeof structuredClone === "function" ? 0 : 1)' >/dev/null 2>&1; then
    node_path="$candidate"
    break
  fi
done
if [[ -z "$node_path" ]]; then
  print -u2 "A modern Node.js runtime is required."
  exit 1
fi

"$node_path" "$project_dir/src/native-setting.mjs" enable

# v0.1.x used a CDP injector that only worked when ChatGPT was opened through
# a special launcher. Disable that service during migration. Its files remain
# available, so installing the optional legacy mode is reversible.
/bin/launchctl bootout "$service_target/$legacy_label" 2>/dev/null || true
/bin/launchctl disable "$service_target/$legacy_label" >/dev/null 2>&1 || true

print ""
print "Installed Codex Context Status in native mode."
print "The setting survives normal app restarts and ChatGPT app updates."
print "If the indicator is not visible yet, quit ChatGPT once and reopen the official app."
print "Run ./scripts/doctor-native.sh to verify the installation."
print ""
print "Native mode shows context usage only. The old combined quota bar remains"
print "available through ./install-legacy.sh, with its original launcher limitation."
