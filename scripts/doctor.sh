#!/bin/zsh
set -u

port="${CODEX_CONTEXT_STATUS_PORT:-17654}"
service_target="gui/$(id -u)/io.github.sunnykaibai.codex-context-status.injector"
supervisor_target="gui/$(id -u)/io.github.sunnykaibai.codex-context-status.supervisor"
activation_target="gui/$(id -u)/io.github.sunnykaibai.codex-context-status.legacy-activate-on-exit"
launch_agent="$HOME/Library/LaunchAgents/io.github.sunnykaibai.codex-context-status.injector.plist"
support_dir="$HOME/Library/Application Support/CodexContextStatus"
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
check "ChatGPT.app" test -d /Applications/ChatGPT.app
check "Codex sessions" test -d "$HOME/.codex/sessions"
check "launcher app" test -d "$HOME/Applications/ChatGPT Context Status.app"
check "injector service" /bin/launchctl print "$service_target"
if /bin/launchctl print "$supervisor_target" >/dev/null 2>&1; then
  print "PASS  startup supervisor"
elif /bin/launchctl print "$activation_target" >/dev/null 2>&1; then
  print "WAIT  startup supervisor activates after ChatGPT exits"
else
  print "FAIL  startup supervisor"
  failures=$((failures + 1))
fi
check "loopback debugging port" /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN
check "ChatGPT CDP endpoint" /usr/bin/curl -fsS --max-time 2 "http://127.0.0.1:$port/json"

node_path="$(/usr/bin/plutil -extract ProgramArguments.0 raw -o - "$launch_agent" 2>/dev/null || true)"
injector_path="$(/usr/bin/plutil -extract ProgramArguments.1 raw -o - "$launch_agent" 2>/dev/null || true)"
if [[ -x "$node_path" && -f "$injector_path" ]]; then
  active_output="$("$node_path" "$injector_path" --print-active-thread 2>/dev/null || true)"
  live_output="$("$node_path" "$injector_path" --print-live-usage 2>/dev/null || true)"
  embedded_output="$("$node_path" "$injector_path" --print-embedded-status 2>/dev/null || true)"

  if print -r -- "$embedded_output" | /usr/bin/jq -e '.embedded == true' >/dev/null 2>&1; then
    print "PASS  embedded composer node"
  else
    print "FAIL  embedded composer node"
    failures=$((failures + 1))
  fi
  if print -r -- "$live_output" | /usr/bin/jq -e '.ok == true' >/dev/null 2>&1; then
    print "PASS  live usage endpoint"
  else
    print "FAIL  live usage endpoint"
    failures=$((failures + 1))
  fi
  if print -r -- "$active_output" | /usr/bin/jq -e '.threadId != null' >/dev/null 2>&1; then
    print "PASS  focused thread identity"
  else
    print "FAIL  focused thread identity"
    failures=$((failures + 1))
  fi
else
  print "FAIL  installed injector command"
  failures=$((failures + 1))
fi

exit "$failures"
