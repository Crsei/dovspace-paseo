#!/usr/bin/env bash
# Dedicated PM stack for the Paseo integration.
#
# Keeps our PM gateway on 3225 and API on 4195 so the pre-existing 3224/4194
# stack can stay with whatever else owns it. Both processes share the PM
# checkout's database and core root; run only one API per data root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PM_REPO="${PM_REPO:-$(cd "$ROOT_DIR/.." && pwd)/project-management-agent-v4}"
STATE_DIR="${PM_STATE_DIR:-$ROOT_DIR/.dev/pm-integration}"
API_PORT="${PM_API_PORT:-4195}"
GATEWAY_PORT="${PM_GATEWAY_PORT:-3225}"
PUBLIC_ORIGIN="${PM_PUBLIC_ORIGIN:-http://127.0.0.1:$GATEWAY_PORT}"
API_PID_FILE="$STATE_DIR/api.pid"
GATEWAY_PID_FILE="$STATE_DIR/gateway.pid"
API_LOG="$STATE_DIR/api.log"
GATEWAY_LOG="$STATE_DIR/gateway.log"

mkdir -p "$STATE_DIR"

launch() {
  local pid_file="$1" log="$2"
  shift 2
  setsid sh -c 'echo $$ > "$1"; shift; exec "$@"' sh "$pid_file" "$@" >"$log" 2>&1 < /dev/null &
}

wait_for() {
  local url="$1" attempts="${2:-60}"
  for ((i = 0; i < attempts; i += 1)); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  return 1
}

running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

start() {
  if [[ ! -f "$PM_REPO/dist/apps/server/pm/src/main.js" ]]; then
    echo "PM API build is missing. Run: (cd $PM_REPO && npm run build)" >&2
    exit 1
  fi
  if running "$API_PID_FILE"; then
    echo "PM API already running (pid $(cat "$API_PID_FILE"))."
  else
    (cd "$PM_REPO" && launch "$API_PID_FILE" "$API_LOG" env PORT="$API_PORT" PUBLIC_ORIGIN="$PUBLIC_ORIGIN" \
      node --env-file=.env dist/apps/server/pm/src/main.js)
    echo "PM API starting on $API_PORT (log: $API_LOG)."
  fi
  if ! wait_for "http://127.0.0.1:$API_PORT/health/live"; then
    echo "PM API did not become live. See $API_LOG" >&2
    exit 1
  fi

  if running "$GATEWAY_PID_FILE"; then
    echo "PM gateway already running (pid $(cat "$GATEWAY_PID_FILE"))."
  else
    (cd "$PM_REPO" && launch "$GATEWAY_PID_FILE" "$GATEWAY_LOG" env PUBLIC_HOST=127.0.0.1 PUBLIC_PORT="$GATEWAY_PORT" \
      PM_URL="http://127.0.0.1:$API_PORT" WEB_DIST=apps/web/dist \
      node apps/server/gateway/src/index.ts)
    echo "PM gateway starting on $GATEWAY_PORT (log: $GATEWAY_LOG)."
  fi
  if ! wait_for "http://127.0.0.1:$GATEWAY_PORT/health/live"; then
    echo "PM gateway did not become live. See $GATEWAY_LOG" >&2
    exit 1
  fi
  echo "PM integration: http://127.0.0.1:$GATEWAY_PORT/pm (API :$API_PORT, origin $PUBLIC_ORIGIN)"
  curl -s "http://127.0.0.1:$GATEWAY_PORT/health/ready" || true
  echo
}

stop() {
  for pid_file in "$GATEWAY_PID_FILE" "$API_PID_FILE"; do
    if running "$pid_file"; then
      kill "$(cat "$pid_file")" 2>/dev/null || true
      echo "stopped $(basename "$pid_file" .pid) (pid $(cat "$pid_file"))"
    fi
    rm -f "$pid_file"
  done
}

status() {
  for port in "$GATEWAY_PORT" "$API_PORT"; do
    if curl -fsS -o /dev/null "http://127.0.0.1:$port/health/live"; then
      echo ":$port live"
    else
      echo ":$port unavailable"
    fi
  done
  curl -s "http://127.0.0.1:$GATEWAY_PORT/health/ready" || true
  echo
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "Usage: $0 [start|stop|restart|status]" >&2; exit 2 ;;
esac
