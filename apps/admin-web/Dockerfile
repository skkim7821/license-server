FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-web/package.json ./apps/admin-web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/admin-web ./apps/admin-web

RUN pnpm --filter admin-web build

FROM nginx:1.27-alpine AS runtime

COPY apps/admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/admin-web/dist /usr/share/nginx/html

EXPOSE 80
