FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV TMPDIR=/app/tmp

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && mkdir -p /app/tmp /app/db

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm prisma generate

EXPOSE 3000

CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm start:prod"]
