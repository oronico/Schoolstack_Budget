# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /build

# Copy lockfile + every workspace package.json the api-server transitively
# depends on (workspace:* refs are resolved at install time).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/finance/package.json lib/finance/
COPY lib/tenant/package.json lib/tenant/
COPY artifacts/api-server/package.json artifacts/api-server/

# BuildKit cache mount for the pnpm store speeds up repeat deploys.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

# Copy only the workspace sources we actually need.
COPY lib/db/ lib/db/
COPY lib/api-zod/ lib/api-zod/
COPY lib/finance/ lib/finance/
COPY lib/tenant/ lib/tenant/
COPY artifacts/api-server/ artifacts/api-server/

RUN pnpm --filter @workspace/api-server run build

FROM node:22-alpine

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /build/artifacts/api-server/dist ./dist

USER app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check uses the canonical liveness endpoint exposed by the API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run migrations as a distinct step before booting the API. A failed migration
# exits non-zero, which fails the deploy loudly instead of starting an API
# against an out-of-date schema. `exec` ensures Node replaces the shell so
# SIGTERM still reaches the server for graceful shutdown.
CMD ["sh", "-c", "node dist/migrate.cjs && exec node dist/index.cjs"]
