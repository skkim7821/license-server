#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${1:-.env}"
COMPOSE_FILE="deploy/docker/docker-compose.prod.yml"
NGINX_TEMPLATE="deploy/docker/nginx.edge.conf.template"
DEPLOY_SCRIPT="scripts/deploy/manual-deploy.sh"

required_cmds=(docker bash)
for cmd in "${required_cmds[@]}"; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[preflight] missing required command: ${cmd}"
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "[preflight] docker compose is not available"
  exit 1
fi

required_files=("${COMPOSE_FILE}" "${NGINX_TEMPLATE}" "${DEPLOY_SCRIPT}")
for f in "${required_files[@]}"; do
  if [ ! -f "${f}" ]; then
    echo "[preflight] missing required file: ${f}"
    exit 1
  fi
done

if [ ! -f "${ENV_FILE}" ]; then
  echo "[preflight] env file not found: ${ENV_FILE}"
  echo "[preflight] usage: bash scripts/deploy/preflight.sh [.env-file-path]"
  exit 1
fi

echo "[preflight] bash syntax check"
bash -n "${DEPLOY_SCRIPT}"

echo "[preflight] validating env keys in ${ENV_FILE}"
required_env_keys=(
  ADMIN_EMAIL
  ADMIN_PASSWORD
  ADMIN_JWT_SECRET
)

for key in "${required_env_keys[@]}"; do
  if ! grep -Eq "^${key}=" "${ENV_FILE}"; then
    echo "[preflight] missing env key in ${ENV_FILE}: ${key}"
    exit 1
  fi
done

optional_env_keys=(
  BACKEND_IMAGE_TAG
  ADMIN_WEB_IMAGE_TAG
  SERVER_NAME
  SSL_CERT_PATH
  SSL_KEY_PATH
  GHCR_NAMESPACE
)

for key in "${optional_env_keys[@]}"; do
  if ! grep -Eq "^${key}=" "${ENV_FILE}"; then
    echo "[preflight] warning: ${key} not set in ${ENV_FILE} (compose default will be used)"
  fi
done

echo "[preflight] rendering compose config"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config >/dev/null

echo "[preflight] checking nginx edge template routes"
grep -q 'location /admin/' "${NGINX_TEMPLATE}"
grep -q 'location /license/' "${NGINX_TEMPLATE}"
grep -q 'location \^~ /license-console-k9/' "${NGINX_TEMPLATE}"

echo "[preflight] ok"
