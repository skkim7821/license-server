#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

BACKEND_PORT="${PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5174}"
FRONTEND_BASE_PATH="/"
PORT_SCAN_MAX="${PORT_SCAN_MAX:-20}"
BACKEND_PID=""
FRONTEND_PID=""

is_port_available() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      return 1
    fi
  fi

  node -e '
    const net = require("node:net");
    const port = Number(process.argv[1]);
    const server = net.createServer();
    server.on("error", () => process.exit(1));
    server.listen(port, "0.0.0.0", () => {
      server.close(() => process.exit(0));
    });
  ' "${port}" >/dev/null 2>&1
}

find_available_port() {
  local preferred="$1"
  local label="$2"
  local port="${preferred}"
  local tries=0

  while [ "${tries}" -lt "${PORT_SCAN_MAX}" ]; do
    if is_port_available "${port}"; then
      if [ "${port}" != "${preferred}" ]; then
        echo "[local-dev] ${label} port ${preferred} in use, fallback to ${port}" >&2
      fi
      echo "${port}"
      return 0
    fi
    port=$((port + 1))
    tries=$((tries + 1))
  done

  echo "[local-dev] no available ${label} port near ${preferred} (scan=${PORT_SCAN_MAX})" >&2
  return 1
}

cleanup() {
  if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID}" ] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

BACKEND_PORT="$(find_available_port "${BACKEND_PORT}" "backend")"
FRONTEND_PORT="$(find_available_port "${FRONTEND_PORT}" "frontend")"

echo "[local-dev] bootstrap database (admin seed only)"
if [ "${LOCAL_DEV_SKIP_BOOTSTRAP:-0}" = "1" ]; then
  echo "[local-dev] skip bootstrap (LOCAL_DEV_SKIP_BOOTSTRAP=1)"
else
  if ! pnpm run db:bootstrap:prod; then
    echo "[local-dev] bootstrap failed. Check PostgreSQL and DATABASE_URL (ex: localhost:5432)." >&2
    exit 1
  fi
fi

start_backend() {
  local start_port="$1"
  local port="${start_port}"
  local tries=0

  while [ "${tries}" -lt "${PORT_SCAN_MAX}" ]; do
    echo "[local-dev] start backend on :${port}"
    PORT="${port}" pnpm run dev &
    BACKEND_PID=$!

    sleep 2
    if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
      echo "[local-dev] backend failed on :${port}, retry with :$((port + 1))"
      port=$((port + 1))
      tries=$((tries + 1))
      continue
    fi

    for _ in $(seq 1 40); do
      if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
        BACKEND_PORT="${port}"
        return 0
      fi
      if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
        break
      fi
      sleep 1
    done

    if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
      echo "[local-dev] backend exited during health check on :${port}, retry with :$((port + 1))"
      port=$((port + 1))
      tries=$((tries + 1))
      continue
    fi

    echo "[local-dev] backend health check failed on :${port}" >&2
    return 1
  done

  echo "[local-dev] could not start backend after ${PORT_SCAN_MAX} attempts" >&2
  return 1
}

start_frontend() {
  local start_port="$1"
  local port="${start_port}"
  local tries=0

  while [ "${tries}" -lt "${PORT_SCAN_MAX}" ]; do
    echo "[local-dev] start frontend on :${port}"
    VITE_BACKEND_URL="http://localhost:${BACKEND_PORT}" \
    pnpm --filter admin-web run dev --host 0.0.0.0 --port "${port}" --strictPort &
    FRONTEND_PID=$!

    sleep 2
    if kill -0 "${FRONTEND_PID}" 2>/dev/null; then
      FRONTEND_PORT="${port}"
      return 0
    fi

    echo "[local-dev] frontend failed on :${port}, retry with :$((port + 1))"
    port=$((port + 1))
    tries=$((tries + 1))
  done

  echo "[local-dev] could not start frontend after ${PORT_SCAN_MAX} attempts" >&2
  return 1
}

start_backend "${BACKEND_PORT}"
start_frontend "${FRONTEND_PORT}"

echo "[local-dev] ready"
echo "  - backend : http://127.0.0.1:${BACKEND_PORT}"
echo "  - frontend: http://127.0.0.1:${FRONTEND_PORT}${FRONTEND_BASE_PATH}"
echo "[local-dev] press Ctrl+C to stop"

while kill -0 "${BACKEND_PID}" 2>/dev/null && kill -0 "${FRONTEND_PID}" 2>/dev/null; do
  sleep 1
done

echo "[local-dev] one of processes exited"
exit 1
