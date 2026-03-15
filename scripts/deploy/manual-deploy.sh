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

SSH_COMMON_OPTS="-i $HOME/.ssh/deploy_key -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3"

retry() {
  local attempts="$1"
  local sleep_seconds="$2"
  shift 2
  local n=1
  until "$@"; do
    if [ "${n}" -ge "${attempts}" ]; then
      return 1
    fi
    n=$((n + 1))
    sleep "${sleep_seconds}"
  done
}

COMPOSE_SRC="deploy/docker/docker-compose.prod.yml"
if [ ! -f "${COMPOSE_SRC}" ] && [ -f "deploy/docker-compose.prod.yml" ]; then
  COMPOSE_SRC="deploy/docker-compose.prod.yml"
fi
if [ ! -f "${COMPOSE_SRC}" ]; then
  echo "compose file not found in repository root."
  ls -la
  ls -la deploy || true
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

echo "[deploy] checking remote ssh connectivity"
retry 5 5 ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "echo connected: \$(whoami)@\$(hostname)"

echo "[deploy] ensure deploy directory"
retry 5 5 ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "mkdir -p '${DEPLOY_PATH}/deploy/docker'"

echo "[deploy] upload compose and env files"
retry 5 5 scp ${SSH_COMMON_OPTS} -P "${SSH_PORT}" \
  "${COMPOSE_SRC}" "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/deploy/docker/docker-compose.prod.yml"
retry 5 5 scp ${SSH_COMMON_OPTS} -P "${SSH_PORT}" \
  "deploy/docker/nginx.edge.conf.template" "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/deploy/docker/nginx.edge.conf.template"
retry 5 5 scp ${SSH_COMMON_OPTS} -P "${SSH_PORT}" \
  "${TMP_ENV_FILE}" "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/deploy/.env.prod"

echo "[deploy] run remote deploy"
timeout 1800 ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" \
  bash -se -- "${DEPLOY_PATH}" "${GHCR_USERNAME}" "${GHCR_TOKEN}" <<'EOF'
set -euo pipefail

DEPLOY_PATH="$1"
GHCR_USERNAME="$2"
GHCR_TOKEN="$3"
MIGRATION_RETRIES=5
SEED_RETRIES=5
RETRY_SLEEP_SECONDS=2
MIGRATION_ATTEMPT_TIMEOUT=45
SEED_ATTEMPT_TIMEOUT=45
POSTGRES_UP_TIMEOUT=300
SERVICE_UP_TIMEOUT=240

case "${DEPLOY_PATH}" in
  "~")
    DEPLOY_PATH="${HOME}"
    ;;
  "~/"*)
    DEPLOY_PATH="${HOME}/${DEPLOY_PATH#~/}"
    ;;
esac

if [ ! -d "${DEPLOY_PATH}" ]; then
  echo "DEPLOY_PATH does not exist: ${DEPLOY_PATH}"
  exit 1
fi

cd "${DEPLOY_PATH}"

if [ ! -f deploy/docker/docker-compose.prod.yml ]; then
  echo "deploy/docker/docker-compose.prod.yml not found in DEPLOY_PATH: ${DEPLOY_PATH}"
  exit 1
fi
if [ ! -f deploy/.env.prod ]; then
  echo "deploy/.env.prod not found in DEPLOY_PATH: ${DEPLOY_PATH}"
  exit 1
fi

COMPOSE_ARGS=(--env-file deploy/.env.prod -f deploy/docker/docker-compose.prod.yml)

MIGRATION_WAIT_MAX_SECONDS=$((MIGRATION_RETRIES * MIGRATION_ATTEMPT_TIMEOUT + (MIGRATION_RETRIES - 1) * RETRY_SLEEP_SECONDS))
SEED_WAIT_MAX_SECONDS=$((SEED_RETRIES * SEED_ATTEMPT_TIMEOUT + (SEED_RETRIES - 1) * RETRY_SLEEP_SECONDS))
BOOT_WAIT_MAX_SECONDS=$((POSTGRES_UP_TIMEOUT + SERVICE_UP_TIMEOUT + SERVICE_UP_TIMEOUT))
DEPLOY_WAIT_MAX_SECONDS=$((MIGRATION_WAIT_MAX_SECONDS + SEED_WAIT_MAX_SECONDS + BOOT_WAIT_MAX_SECONDS))

echo "[deploy] expected max wait:"
echo "  - migrate: ${MIGRATION_WAIT_MAX_SECONDS}s"
echo "  - seed: ${SEED_WAIT_MAX_SECONDS}s"
echo "  - boot(postgres/license-server/admin-web): ${BOOT_WAIT_MAX_SECONDS}s"
echo "  - total (excluding image pull): ${DEPLOY_WAIT_MAX_SECONDS}s"

echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
docker rm -f license-server license-admin-web license-server-admin-web >/dev/null 2>&1 || true

timeout "${POSTGRES_UP_TIMEOUT}" docker compose "${COMPOSE_ARGS[@]}" pull
timeout "${POSTGRES_UP_TIMEOUT}" docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans --wait --wait-timeout 180 postgres

schema_ready=0
for i in $(seq 1 "${MIGRATION_RETRIES}"); do
  echo "[deploy] running migrate:deploy (${i}/${MIGRATION_RETRIES})"
  if timeout "${MIGRATION_ATTEMPT_TIMEOUT}" docker compose "${COMPOSE_ARGS[@]}" run --rm --no-deps license-server pnpm prisma migrate deploy; then
    schema_ready=1
    echo "[deploy] migrate:deploy completed"
    break
  fi
  sleep "${RETRY_SLEEP_SECONDS}"
done

if [ "${schema_ready}" -ne 1 ]; then
  echo "schema migration failed after ${MIGRATION_RETRIES} retries"
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 license-server || true
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 postgres || true
  exit 1
fi

seeded=0
for i in $(seq 1 "${SEED_RETRIES}"); do
  echo "[deploy] running seed:prod (${i}/${SEED_RETRIES})"
  if timeout "${SEED_ATTEMPT_TIMEOUT}" docker compose "${COMPOSE_ARGS[@]}" run --rm --no-deps license-server pnpm run seed:prod; then
    seeded=1
    echo "[deploy] seed:prod completed"
    break
  fi
  sleep "${RETRY_SLEEP_SECONDS}"
done

if [ "${seeded}" -ne 1 ]; then
  echo "admin seed failed after ${SEED_RETRIES} retries"
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 license-server || true
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 postgres || true
  exit 1
fi

if ! timeout "${SERVICE_UP_TIMEOUT}" docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans --wait --wait-timeout 180 license-server; then
  echo "license-server startup failed"
  docker compose "${COMPOSE_ARGS[@]}" ps || true
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 license-server || true
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 postgres || true
  exit 1
fi

if ! timeout "${SERVICE_UP_TIMEOUT}" docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans --wait --wait-timeout 180 admin-web; then
  echo "admin-web startup failed"
  docker compose "${COMPOSE_ARGS[@]}" ps || true
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 admin-web || true
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 license-server || true
  exit 1
fi

if ! timeout "${SERVICE_UP_TIMEOUT}" docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans --wait --wait-timeout 180 edge-proxy; then
  echo "edge-proxy startup failed"
  docker compose "${COMPOSE_ARGS[@]}" ps || true
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 edge-proxy || true
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 license-server || true
  exit 1
fi
docker compose "${COMPOSE_ARGS[@]}" ps
EOF
