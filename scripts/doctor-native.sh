#!/bin/zsh
set -u

project_dir="${0:A:h:h}"
chatgpt_app="${CHATGPT_APP_PATH:-/Applications/ChatGPT.app}"
state_path="${CODEX_HOME:-$HOME/.codex}/.codex-global-state.json"
service_target="gui/$(id -u)"
activation_label="io.github.sunnykaibai.codex-context-status.native-on-exit"
failures=0

check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    print "PASS  $label"
  else
    print "FAIL  $label"
    failures=$((failures + 1))
  fi
}

check "macOS" test "$(uname -s)" = "Darwin"
check "ChatGPT.app" test -d "$chatgpt_app"
check "Codex global state" test -f "$state_path"
check "native setting available in this app build" sh -c \
  "strings '$chatgpt_app/Contents/Resources/app.asar' | grep -q 'show-context-window-usage'"

node_path="$chatgpt_app/Contents/Resources/cua_node/bin/node"
if [[ ! -x "$node_path" ]]; then
  node_path="${commands[node]:-}"
fi
if "$node_path" "$project_dir/src/native-setting.mjs" status >/dev/null 2>&1; then
  print "PASS  native context indicator enabled"
elif /bin/launchctl print "$service_target/$activation_label" >/dev/null 2>&1; then
  print "WAIT  native setting will be enabled after ChatGPT fully exits"
else
  print "FAIL  native context indicator enabled"
  failures=$((failures + 1))
fi

if /bin/launchctl print "$service_target/io.github.sunnykaibai.codex-context-status.injector" >/dev/null 2>&1; then
  print "WARN  legacy CDP injector is still loaded"
else
  print "PASS  legacy CDP injector is not loaded"
fi

exit "$failures"
