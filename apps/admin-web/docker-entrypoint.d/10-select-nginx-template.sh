#!/bin/sh
set -eu

HTTP_TEMPLATE="/etc/nginx/templates/default.http.conf.template"
HTTPS_TEMPLATE="/etc/nginx/templates/default.https.conf.template"
TARGET_TEMPLATE="/etc/nginx/templates/default.conf.template"

enable_https="$(printf '%s' "${ENABLE_HTTPS:-false}" | tr '[:upper:]' '[:lower:]')"

if [ "${enable_https}" = "1" ] || [ "${enable_https}" = "true" ] || [ "${enable_https}" = "yes" ]; then
  if [ -f "${SSL_CERT_PATH:-}" ] && [ -f "${SSL_KEY_PATH:-}" ]; then
    cp "${HTTPS_TEMPLATE}" "${TARGET_TEMPLATE}"
    rm -f "${HTTP_TEMPLATE}" "${HTTPS_TEMPLATE}"
    echo "[nginx] HTTPS mode enabled"
    exit 0
  fi
  echo "[nginx] ENABLE_HTTPS=true but cert/key not found. Falling back to HTTP mode."
fi

cp "${HTTP_TEMPLATE}" "${TARGET_TEMPLATE}"
rm -f "${HTTP_TEMPLATE}" "${HTTPS_TEMPLATE}"
echo "[nginx] HTTP mode enabled"
