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

echo "[deploy] ghcr login"
echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

echo "[deploy] pull images (quiet)"
timeout "${PULL_TIMEOUT}" "${COMPOSE[@]}" pull --quiet
echo "[deploy] pull done"

echo "[deploy] start postgres"
timeout "${WAIT_TIMEOUT}" "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180 postgres
echo "[deploy] postgres ready"

echo "[deploy] migrate"
if ! timeout "${MIGRATE_TIMEOUT}" "${COMPOSE[@]}" run -T --rm --no-deps license-server pnpm prisma migrate deploy; then
  echo "[deploy] migrate failed or timed out (${MIGRATE_TIMEOUT}s)"
  dump_logs postgres
  dump_logs license-server
  exit 1
fi
echo "[deploy] migrate done"

echo "[deploy] seed"
if ! timeout "${SEED_TIMEOUT}" "${COMPOSE[@]}" run -T --rm --no-deps license-server pnpm run seed:prod; then
  echo "[deploy] seed failed or timed out (${SEED_TIMEOUT}s)"
  dump_logs postgres
  dump_logs license-server
  exit 1
fi
echo "[deploy] seed done"

echo "[deploy] start services"
if ! timeout "${WAIT_TIMEOUT}" "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180 license-server admin-web edge-proxy; then
  echo "[deploy] service startup failed or timed out (${WAIT_TIMEOUT}s)"
  "${COMPOSE[@]}" ps || true
  dump_logs edge-proxy
  dump_logs admin-web
  dump_logs license-server
  exit 1
fi

"${COMPOSE[@]}" ps
echo "[deploy] ready: https://${SERVER_NAME}/license-console-k9/"
EOF
