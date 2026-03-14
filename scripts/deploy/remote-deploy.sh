#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="$(printf '%s' "${DEPLOY_PATH_B64}" | base64 -d)"
GHCR_USERNAME="$(printf '%s' "${GHCR_USERNAME_B64}" | base64 -d)"
GHCR_TOKEN="$(printf '%s' "${GHCR_TOKEN_B64}" | base64 -d)"
ADMIN_EMAIL="$(printf '%s' "${ADMIN_EMAIL_B64}" | base64 -d)"
ADMIN_PASSWORD="$(printf '%s' "${ADMIN_PASSWORD_B64}" | base64 -d)"
ADMIN_JWT_SECRET="$(printf '%s' "${ADMIN_JWT_SECRET_B64}" | base64 -d)"
SERVER_NAME="$(printf '%s' "${SERVER_NAME_B64}" | base64 -d)"
ENABLE_HTTPS="$(printf '%s' "${ENABLE_HTTPS_B64}" | base64 -d)"
SSL_CERT_PATH="$(printf '%s' "${SSL_CERT_PATH_B64}" | base64 -d)"
SSL_KEY_PATH="$(printf '%s' "${SSL_KEY_PATH_B64}" | base64 -d)"
BACKEND_IMAGE_TAG="$(printf '%s' "${BACKEND_IMAGE_TAG_B64}" | base64 -d)"
ADMIN_WEB_IMAGE_TAG="$(printf '%s' "${ADMIN_WEB_IMAGE_TAG_B64}" | base64 -d)"
GHCR_NAMESPACE="${GHCR_USERNAME}"

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

if [ ! -f deploy/docker-compose.prod.yml ]; then
  echo "deploy/docker-compose.prod.yml not found in DEPLOY_PATH: ${DEPLOY_PATH}"
  exit 1
fi

cat > deploy/.env.prod <<EOF
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
GHCR_NAMESPACE=${GHCR_NAMESPACE}
SERVER_NAME=${SERVER_NAME}
ENABLE_HTTPS=${ENABLE_HTTPS}
SSL_CERT_PATH=${SSL_CERT_PATH}
SSL_KEY_PATH=${SSL_KEY_PATH}
BACKEND_IMAGE_TAG=${BACKEND_IMAGE_TAG}
ADMIN_WEB_IMAGE_TAG=${ADMIN_WEB_IMAGE_TAG}
EOF

COMPOSE_ARGS=(--env-file deploy/.env.prod -f deploy/docker-compose.prod.yml)

echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

# Remove legacy standalone app containers to avoid name conflicts.
docker rm -f license-server license-admin-web license-server-admin-web >/dev/null 2>&1 || true

timeout 300 docker compose "${COMPOSE_ARGS[@]}" pull

# 1) Bring up DB + API first. Admin-web depends on healthy API and can fail early otherwise.
timeout 300 docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans postgres license-server

api_started=0
for i in $(seq 1 30); do
  if timeout 10 docker compose "${COMPOSE_ARGS[@]}" ps --status running --services | grep -qx "license-server"; then
    api_started=1
    break
  fi
  sleep 2
done
if [ "${api_started}" -ne 1 ]; then
  echo "license-server container did not reach running state"
  docker compose "${COMPOSE_ARGS[@]}" ps
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 license-server
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 postgres
  exit 1
fi

seeded=0
for i in $(seq 1 15); do
  if timeout 45 docker compose "${COMPOSE_ARGS[@]}" exec -T license-server pnpm run seed:prod; then
    seeded=1
    break
  fi
  sleep 2
done
if [ "${seeded}" -ne 1 ]; then
  echo "admin seed failed after retries"
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 license-server
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 postgres
  exit 1
fi

docker compose "${COMPOSE_ARGS[@]}" ps
ok=0
for i in $(seq 1 30); do
  echo "[deploy] waiting for license-server health (${i}/30)"
  if timeout 20 docker compose "${COMPOSE_ARGS[@]}" exec -T license-server \
    node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r=>{if(!r.ok) process.exit(1)}).catch(()=>process.exit(1))"; then
    ok=1
    echo "[deploy] license-server health check passed"
    break
  fi
  timeout 10 docker compose "${COMPOSE_ARGS[@]}" ps || true
  sleep 2
done
if [ "${ok}" -ne 1 ]; then
  echo "[deploy] license-server health check did not pass in time"
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 license-server
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 postgres
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=100 admin-web
  exit 1
fi

# 2) Start admin-web only after API is healthy.
echo "[deploy] starting admin-web"
timeout 180 docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans admin-web
echo "[deploy] admin-web started"

web_ok=0
for i in $(seq 1 30); do
  echo "[deploy] waiting for admin-web running (${i}/30)"
  if timeout 10 docker compose "${COMPOSE_ARGS[@]}" ps --status running --services | grep -qx "admin-web"; then
    web_ok=1
    break
  fi
  timeout 10 docker compose "${COMPOSE_ARGS[@]}" ps || true
  sleep 2
done
if [ "${web_ok}" -ne 1 ]; then
  echo "[deploy] admin-web did not reach running state"
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 admin-web || true
  docker compose "${COMPOSE_ARGS[@]}" ps || true
  exit 1
fi

web_health_ok=0
for i in $(seq 1 30); do
  echo "[deploy] waiting for admin-web http check (${i}/30)"
  if timeout 20 docker compose "${COMPOSE_ARGS[@]}" exec -T admin-web \
    wget -qO- http://127.0.0.1/ >/dev/null 2>&1; then
    web_health_ok=1
    echo "[deploy] admin-web http check passed"
    break
  fi
  sleep 2
done
if [ "${web_health_ok}" -ne 1 ]; then
  echo "[deploy] admin-web http check failed"
  docker compose "${COMPOSE_ARGS[@]}" logs --tail=200 admin-web || true
  docker compose "${COMPOSE_ARGS[@]}" ps || true
  exit 1
fi
