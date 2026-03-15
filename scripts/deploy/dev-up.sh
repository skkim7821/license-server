#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE_FILE="deploy/docker/docker-compose.dev.yml"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"
SEED_COMMAND="${SEED_COMMAND:-pnpm run seed:prod}"
DEV_BUILD="${DEV_BUILD:-0}" # 1이면 이미지 빌드

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

if [ ! -f "${ENV_FILE}" ]; then
  echo "[dev-up] env file not found: ${ENV_FILE}"
  exit 1
fi

if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "[dev-up] compose file not found: ${COMPOSE_FILE}"
  exit 1
fi

if [ "${DEV_BUILD}" = "1" ]; then
  echo "[dev-up] build images"
  "${COMPOSE[@]}" build license-server admin-web
else
  echo "[dev-up] skip build (DEV_BUILD=0)"
fi

echo "[dev-up] start postgres"
"${COMPOSE[@]}" up -d --wait --wait-timeout "${WAIT_TIMEOUT}" postgres

echo "[dev-up] migrate"
"${COMPOSE[@]}" run -T --rm --no-deps license-server pnpm prisma migrate deploy

echo "[dev-up] seed"
"${COMPOSE[@]}" run -T --rm --no-deps license-server sh -lc "${SEED_COMMAND}"

echo "[dev-up] start services"
"${COMPOSE[@]}" up -d --wait --wait-timeout "${WAIT_TIMEOUT}" license-server admin-web edge-proxy

"${COMPOSE[@]}" ps
echo "[dev-up] ready: http://localhost:${EDGE_HTTP_PORT:-80}/license-console-k9/"
