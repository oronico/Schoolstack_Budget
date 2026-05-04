FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

FROM node:22-alpine

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /build/artifacts/api-server/dist ./dist

USER app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/healthz || exit 1

# Run migrations as a distinct step before booting the API. A failed migration
# exits non-zero, which fails the deploy loudly instead of starting an API
# against an out-of-date schema. `exec` ensures Node replaces the shell so
# SIGTERM still reaches the server for graceful shutdown.
CMD ["sh", "-c", "node dist/migrate.cjs && exec node dist/index.cjs"]
