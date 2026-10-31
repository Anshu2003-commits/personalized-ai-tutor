#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/web-app"
LLM_DIR="$ROOT_DIR/llm-app"
STATE_DIR="$ROOT_DIR/.local/dev"
LOG_DIR="$STATE_DIR/logs"

WEB_PORT="${WEB_PORT:-3000}"
LLM_PORT="${LLM_PORT:-8000}"

mkdir -p "$LOG_DIR"

usage() {
  cat <<EOF
Usage: ./scripts/local-app.sh <command>

Commands:
  up       Start web-app and llm-app locally, without Docker
  down     Stop services started by this script
  restart  Stop, then start again
  status   Show local service status
  logs     Follow both logs

Optional env:
  WEB_PORT=$WEB_PORT
  LLM_PORT=$LLM_PORT
EOF
}

pid_file() {
  echo "$STATE_DIR/$1.pid"
}

log_file() {
  echo "$LOG_DIR/$1.log"
}

is_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file
  file="$(pid_file "$1")"
  [[ -f "$file" ]] && cat "$file" || true
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn | awk '{print $4}' | grep -Eq "(^|:)$port$"
    return
  fi

  return 1
}

start_process() {
  local name="$1"
  local port="$2"
  shift 2

  local existing_pid
  existing_pid="$(read_pid "$name")"
  if is_running "$existing_pid"; then
    echo "$name already running (pid $existing_pid)"
    return
  fi

  if port_in_use "$port"; then
    echo "Port $port is already in use. Stop that process or set a different port."
    echo "Examples:"
    echo "  WEB_PORT=$((WEB_PORT + 1)) ./scripts/local-app.sh up"
    echo "  LLM_PORT=$((LLM_PORT + 1)) ./scripts/local-app.sh up"
    return 1
  fi

  local logfile
  logfile="$(log_file "$name")"
  : > "$logfile"

  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" >>"$logfile" 2>&1 &
  else
    "$@" >>"$logfile" 2>&1 &
  fi

  local pid="$!"
  echo "$pid" >"$(pid_file "$name")"

  sleep 0.5
  if ! is_running "$pid"; then
    echo "$name failed to start. Last log lines:"
    tail -40 "$logfile" || true
    rm -f "$(pid_file "$name")"
    return 1
  fi

  echo "started $name on port $port (pid $pid, log $logfile)"
}

stop_process() {
  local name="$1"
  local pid
  pid="$(read_pid "$name")"

  if ! is_running "$pid"; then
    echo "$name not running"
    rm -f "$(pid_file "$name")"
    return
  fi

  echo "stopping $name (pid $pid)"
  kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true

  for _ in {1..30}; do
    if ! is_running "$pid"; then
      rm -f "$(pid_file "$name")"
      echo "stopped $name"
      return
    fi
    sleep 0.2
  done

  echo "$name did not stop cleanly; forcing it"
  kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  rm -f "$(pid_file "$name")"
}

python_bin() {
  if [[ -x "$LLM_DIR/.venv/bin/python" ]]; then
    echo "$LLM_DIR/.venv/bin/python"
  else
    echo "python"
  fi
}

start_llm() {
  local py
  py="$(python_bin)"

  start_process "llm-app" "$LLM_PORT" bash -lc "
    cd '$LLM_DIR'
    if [[ -f .env ]]; then
      set -a
      source .env
      set +a
    fi
    exec '$py' -m uvicorn api.main:app --reload --port '$LLM_PORT'
  "
}

start_web() {
  start_process "web-app" "$WEB_PORT" bash -lc "
    cd '$WEB_DIR'
    exec env LLM_APP_URL='http://localhost:$LLM_PORT' PORT='$WEB_PORT' npm run dev -- --hostname 0.0.0.0 --port '$WEB_PORT'
  "
}

up() {
  start_llm
  start_web
  echo
  echo "Open http://localhost:$WEB_PORT"
  echo "Use './scripts/local-app.sh logs' if something does not load."
}

down() {
  stop_process "web-app"
  stop_process "llm-app"
}

status_one() {
  local name="$1"
  local port="$2"
  local pid
  pid="$(read_pid "$name")"

  if is_running "$pid"; then
    echo "$name: running (pid $pid, port $port)"
  else
    echo "$name: stopped"
    rm -f "$(pid_file "$name")"
  fi
}

status() {
  status_one "web-app" "$WEB_PORT"
  status_one "llm-app" "$LLM_PORT"
}

logs() {
  touch "$(log_file web-app)" "$(log_file llm-app)"
  tail -f "$(log_file llm-app)" "$(log_file web-app)"
}

case "${1:-}" in
  up)
    up
    ;;
  down)
    down
    ;;
  restart)
    down
    up
    ;;
  status)
    status
    ;;
  logs)
    logs
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    echo "Unknown command: $1"
    usage
    exit 1
    ;;
esac
