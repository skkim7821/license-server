#!/usr/bin/env bash
set -euxo pipefail

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
: "${SERVER_NAME:?SERVER_NAME is required}"
: "${ENABLE_HTTPS:?ENABLE_HTTPS is required}"
: "${SSL_CERT_PATH:?SSL_CERT_PATH is required}"
: "${SSL_KEY_PATH:?SSL_KEY_PATH is required}"

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

b64() {
  printf '%s' "$1" | base64 | tr -d '\n'
}

DEPLOY_PATH_B64="$(b64 "${DEPLOY_PATH}")"
GHCR_USERNAME_B64="$(b64 "${GHCR_USERNAME}")"
GHCR_TOKEN_B64="$(b64 "${GHCR_TOKEN}")"
ADMIN_EMAIL_B64="$(b64 "${ADMIN_EMAIL}")"
ADMIN_PASSWORD_B64="$(b64 "${ADMIN_PASSWORD}")"
ADMIN_JWT_SECRET_B64="$(b64 "${ADMIN_JWT_SECRET}")"
SERVER_NAME_B64="$(b64 "${SERVER_NAME}")"
ENABLE_HTTPS_B64="$(b64 "${ENABLE_HTTPS}")"
SSL_CERT_PATH_B64="$(b64 "${SSL_CERT_PATH}")"
SSL_KEY_PATH_B64="$(b64 "${SSL_KEY_PATH}")"
BACKEND_IMAGE_TAG_B64="$(b64 "${BACKEND_IMAGE_TAG}")"
ADMIN_WEB_IMAGE_TAG_B64="$(b64 "${ADMIN_WEB_IMAGE_TAG}")"

COMPOSE_SRC="deploy/docker-compose.prod.yml"
if [ ! -f "${COMPOSE_SRC}" ] && [ -f "docker-compose.prod.yml" ]; then
  COMPOSE_SRC="docker-compose.prod.yml"
fi
if [ ! -f "${COMPOSE_SRC}" ]; then
  echo "compose file not found in repository root."
  ls -la
  ls -la deploy || true
  exit 1
fi

echo "[deploy] checking remote ssh connectivity"
retry 5 5 ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "echo connected: \$(whoami)@\$(hostname)"

echo "[deploy] ensure deploy directory"
retry 5 5 ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "mkdir -p '${DEPLOY_PATH}/deploy'"

echo "[deploy] upload compose file"
retry 5 5 scp ${SSH_COMMON_OPTS} -P "${SSH_PORT}" \
  "${COMPOSE_SRC}" "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/deploy/docker-compose.prod.yml"

echo "[deploy] run remote deploy script"
timeout 900 ssh ${SSH_COMMON_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" \
  "export DEPLOY_PATH_B64='${DEPLOY_PATH_B64}' GHCR_USERNAME_B64='${GHCR_USERNAME_B64}' GHCR_TOKEN_B64='${GHCR_TOKEN_B64}' ADMIN_EMAIL_B64='${ADMIN_EMAIL_B64}' ADMIN_PASSWORD_B64='${ADMIN_PASSWORD_B64}' ADMIN_JWT_SECRET_B64='${ADMIN_JWT_SECRET_B64}' SERVER_NAME_B64='${SERVER_NAME_B64}' ENABLE_HTTPS_B64='${ENABLE_HTTPS_B64}' SSL_CERT_PATH_B64='${SSL_CERT_PATH_B64}' SSL_KEY_PATH_B64='${SSL_KEY_PATH_B64}' BACKEND_IMAGE_TAG_B64='${BACKEND_IMAGE_TAG_B64}' ADMIN_WEB_IMAGE_TAG_B64='${ADMIN_WEB_IMAGE_TAG_B64}'; bash -se" \
  < scripts/deploy/remote-deploy.sh
