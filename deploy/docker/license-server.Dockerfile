FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV TMPDIR=/app/apps/license-server/tmp

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && mkdir -p /app/apps/license-server/tmp

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/license-server/package.json ./apps/license-server/package.json
RUN pnpm install --frozen-lockfile --filter license-server... --prod=false

COPY apps/license-server ./apps/license-server
WORKDIR /app/apps/license-server
RUN pnpm build
RUN pnpm prisma generate

EXPOSE 3000

CMD ["pnpm", "start"]
