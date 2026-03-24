#!/usr/bin/env bash
set -euo pipefail

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

echo "[deploy] ghcr login"
echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

echo "[deploy] pull images (quiet)"
timeout "${PULL_TIMEOUT}" "${COMPOSE[@]}" pull --quiet

echo "[deploy] start postgres"
timeout "${WAIT_TIMEOUT}" "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180 postgres

echo "[deploy] migrate"
"${COMPOSE[@]}" run -T --rm --no-deps license-server pnpm prisma migrate deploy

echo "[deploy] seed"
"${COMPOSE[@]}" run -T --rm --no-deps license-server pnpm run seed:prod

echo "[deploy] start services"
timeout "${WAIT_TIMEOUT}" "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180 license-server admin-web edge-proxy

"${COMPOSE[@]}" ps
echo "[deploy] done"
EOF
