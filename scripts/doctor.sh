#!/bin/zsh
set -u

port="${CODEX_CONTEXT_STATUS_PORT:-17654}"
service_target="gui/$(id -u)/io.github.sunnykaibai.codex-context-status.injector"
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
check "loopback debugging port" /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN
check "ChatGPT CDP endpoint" /usr/bin/curl -fsS --max-time 2 "http://127.0.0.1:$port/json"

log_path="$HOME/Library/Logs/CodexContextStatus.log"
if [[ -f "$log_path" ]]; then
  if /usr/bin/grep -q '"ok":true' "$log_path"; then
    print "PASS  embedded composer node"
  else
    print "FAIL  embedded composer node"
    failures=$((failures + 1))
  fi
else
  print "FAIL  injector log"
  failures=$((failures + 1))
fi

exit "$failures"
