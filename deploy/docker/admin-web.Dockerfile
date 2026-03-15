FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-web/package.json ./apps/admin-web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/admin-web ./apps/admin-web

RUN pnpm --filter admin-web build

FROM nginx:1.27-alpine AS runtime

COPY apps/admin-web/nginx.http.conf.template /etc/nginx/templates/default.http.conf.template
COPY apps/admin-web/nginx.https.conf.template /etc/nginx/templates/default.https.conf.template
COPY apps/admin-web/docker-entrypoint.d/10-select-nginx-template.sh /docker-entrypoint.d/10-select-nginx-template.sh
RUN chmod +x /docker-entrypoint.d/10-select-nginx-template.sh
COPY --from=builder /app/apps/admin-web/dist /usr/share/nginx/html

EXPOSE 80
