#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-.env}"
if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

: "${BACKEND_IMAGE_TAG:?BACKEND_IMAGE_TAG is required}"
: "${ADMIN_WEB_IMAGE_TAG:?ADMIN_WEB_IMAGE_TAG is required}"
: "${SSH_HOST:?SSH_HOST is required}"
: "${SSH_PORT:?SSH_PORT is required}"
: "${SSH_USER:?SSH_USER is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${GHCR_USERNAME:?GHCR_USERNAME is required}"
: "${GHCR_TOKEN:?GHCR_TOKEN is required}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${ADMIN_JWT_SECRET:?ADMIN_JWT_SECRET is required}"

SERVER_NAME="${SERVER_NAME:-_}"
ENABLE_HTTPS="${ENABLE_HTTPS:-true}"
SSL_CERT_PATH="${SSL_CERT_PATH:-/etc/letsencrypt/live/lc.skkim.dev/fullchain.pem}"
SSL_KEY_PATH="${SSL_KEY_PATH:-/etc/letsencrypt/live/lc.skkim.dev/privkey.pem}"

PULL_TIMEOUT="${PULL_TIMEOUT:-600}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-240}"
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-180}"
SEED_TIMEOUT="${SEED_TIMEOUT:-180}"

SSH_COMMON_OPTS="-i $HOME/.ssh/deploy_key -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3"
COMPOSE_SRC="deploy/docker/docker-compose.prod.yml"
EDGE_TEMPLATE_SRC="deploy/docker/nginx.edge.conf.template"

if [ ! -f "${COMPOSE_SRC}" ]; then
  echo "[deploy] compose file not found: ${COMPOSE_SRC}"
  exit 1
fi
if [ ! -f "${EDGE_TEMPLATE_SRC}" ]; then
  echo "[deploy] nginx edge template not found: ${EDGE_TEMPLATE_SRC}"
  exit 1
fi

TMP_ENV_FILE="$(mktemp)"
trap 'rm -f "${TMP_ENV_FILE}"' EXIT
cat > "${TMP_ENV_FILE}" <<EOF
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
GHCR_NAMESPACE=${GHCR_USERNAME}
SERVER_NAME=${SERVER_NAME}
ENABLE_HTTPS=${ENABLE_HTTPS}
SSL_CERT_PATH=${SSL_CERT_PATH}
SSL_KEY_PATH=${SSL_KEY_PATH}
BACKEND_IMAGE_TAG=${BACKEND_IMAGE_TAG}
ADMIN_WEB_IMAGE_TAG=${ADMIN_WEB_IMAGE_TAG}
EOF

echo "[deploy] verify ssh"
ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "echo connected: \$(whoami)@\$(hostname)"

echo "[deploy] ensure deploy directory"
ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "mkdir -p '${DEPLOY_PATH}/deploy/docker'"

echo "[deploy] upload files"
scp ${SSH_COMMON_OPTS} -P "${SSH_PORT}" "${COMPOSE_SRC}" "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/deploy/docker/docker-compose.prod.yml"
scp ${SSH_COMMON_OPTS} -P "${SSH_PORT}" "${EDGE_TEMPLATE_SRC}" "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/deploy/docker/nginx.edge.conf.template"
scp ${SSH_COMMON_OPTS} -P "${SSH_PORT}" "${TMP_ENV_FILE}" "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/deploy/.env.prod"

echo "[deploy] run remote deploy"
ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" \
  PULL_TIMEOUT="${PULL_TIMEOUT}" \
  WAIT_TIMEOUT="${WAIT_TIMEOUT}" \
  MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT}" \
  SEED_TIMEOUT="${SEED_TIMEOUT}" \
  SERVER_NAME="${SERVER_NAME}" \
  GHCR_USERNAME="${GHCR_USERNAME}" \
  GHCR_TOKEN="${GHCR_TOKEN}" \
  DEPLOY_PATH="${DEPLOY_PATH}" \
  'bash -se' <<'EOF'
set -euo pipefail

case "${DEPLOY_PATH}" in
  "~")
    DEPLOY_PATH="${HOME}"
    ;;
  "~/"*)
    DEPLOY_PATH="${HOME}/${DEPLOY_PATH#~/}"
    ;;
esac

cd "${DEPLOY_PATH}"
COMPOSE=(docker compose --env-file deploy/.env.prod -f deploy/docker/docker-compose.prod.yml)

dump_logs() {
  local service="$1"
  echo "[deploy] ===== ${service} logs ====="
  "${COMPOSE[@]}" logs --tail=120 "${service}" || true
}

run_step() {
  local label="$1"
  local timeout_seconds="$2"
  shift 2

  local started_at="${SECONDS}"
  local status=0
  local cmd_pid
  local heartbeat_pid

  echo "[deploy] ${label}"

  timeout --foreground "${timeout_seconds}" "$@" &
  cmd_pid=$!

  (
    while kill -0 "${cmd_pid}" 2>/dev/null; do
      sleep 20
      kill -0 "${cmd_pid}" 2>/dev/null || exit 0
      echo "[deploy] ${label} still running... ($((SECONDS - started_at))s elapsed)"
    done
  ) &
  heartbeat_pid=$!

  set +e
  wait "${cmd_pid}"
  status=$?
  set -e

  kill "${heartbeat_pid}" 2>/dev/null || true
  wait "${heartbeat_pid}" 2>/dev/null || true

  if [ "${status}" -eq 0 ]; then
    echo "[deploy] ${label} done ($((SECONDS - started_at))s total)"
    return 0
  fi

  if [ "${status}" -eq 124 ]; then
    echo "[deploy] ${label} timed out after ${timeout_seconds}s"
  else
    echo "[deploy] ${label} failed with exit code ${status}"
  fi

  return "${status}"
}

echo "[deploy] ghcr login"
echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

if ! run_step "pull images" "${PULL_TIMEOUT}" "${COMPOSE[@]}" pull; then
  "${COMPOSE[@]}" config >/dev/null || true
  exit 1
fi

if ! run_step "start postgres" "${WAIT_TIMEOUT}" "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180 postgres; then
  dump_logs postgres
  exit 1
fi

if ! run_step "migrate" "${MIGRATE_TIMEOUT}" "${COMPOSE[@]}" run -T --rm --no-deps license-server pnpm prisma migrate deploy; then
  dump_logs postgres
  dump_logs license-server
  exit 1
fi

if ! run_step "seed" "${SEED_TIMEOUT}" "${COMPOSE[@]}" run -T --rm --no-deps license-server pnpm run seed:prod; then
  dump_logs postgres
  dump_logs license-server
  exit 1
fi

if ! run_step "start services" "${WAIT_TIMEOUT}" "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180 license-server admin-web edge-proxy; then
  "${COMPOSE[@]}" ps || true
  dump_logs edge-proxy
  dump_logs admin-web
  dump_logs license-server
  exit 1
fi

"${COMPOSE[@]}" ps
echo "[deploy] ready: https://${SERVER_NAME}/license-console-k9/"
EOF
