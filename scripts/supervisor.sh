#!/bin/zsh
set -euo pipefail

chatgpt_executable="$1"
launcher_app="$2"
cdp_url="${CODEX_CONTEXT_STATUS_CDP_URL:-http://127.0.0.1:17654/json/version}"
handled_pid=""

find_chatgpt_pid() {
  /bin/ps -axo pid=,command= | /usr/bin/awk -v executable="$chatgpt_executable" \
    '$2 == executable { print $1; exit }'
}

cdp_is_ready() {
  /usr/bin/curl --silent --show-error --fail --max-time 0.5 "$cdp_url" >/dev/null 2>&1
}

while true; do
  current_pid="$(find_chatgpt_pid)"
  if [[ -z "$current_pid" ]]; then
    handled_pid=""
    sleep 1
    continue
  fi
  if [[ "$current_pid" == "$handled_pid" ]]; then
    sleep 1
    continue
  fi

  handled_pid="$current_pid"
  for _ in {1..20}; do
    cdp_is_ready && break
    /bin/kill -0 "$current_pid" >/dev/null 2>&1 || break
    sleep 0.5
  done
  cdp_is_ready && continue
  /bin/kill -0 "$current_pid" >/dev/null 2>&1 || continue

  # The official icon or updater started ChatGPT without CDP. Restart only this
  # newly observed main process, before the user can begin a task in it.
  /bin/kill -TERM "$current_pid"
  for _ in {1..40}; do
    /bin/kill -0 "$current_pid" >/dev/null 2>&1 || break
    sleep 0.25
  done
  if /bin/kill -0 "$current_pid" >/dev/null 2>&1; then
    print -u2 "ChatGPT did not exit after TERM; refusing to force-kill it."
    continue
  fi

  /usr/bin/open "$launcher_app"
done
