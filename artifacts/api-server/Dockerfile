# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /build

# Copy lockfile + every workspace package.json the api-server transitively
# depends on (workspace:* refs are resolved at install time, so each one
# must be present before `pnpm install` runs).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/finance/package.json lib/finance/
COPY lib/tenant/package.json lib/tenant/
COPY artifacts/api-server/package.json artifacts/api-server/

# BuildKit cache mount for the pnpm store dramatically speeds up
# repeat deploys. We omit an explicit `id=` so the Replit Metal builder
# (which requires its own cacheKey prefix on custom ids) can derive one
# from the target path automatically.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

# Now bring in the workspace sources and build.
COPY lib/db/ lib/db/
COPY lib/api-zod/ lib/api-zod/
COPY lib/finance/ lib/finance/
COPY lib/tenant/ lib/tenant/
COPY artifacts/api-server/ artifacts/api-server/

RUN pnpm --filter @workspace/api-server run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /build/artifacts/api-server/dist/index.cjs ./index.cjs
COPY --from=base /build/artifacts/api-server/dist/migrate.cjs ./migrate.cjs
# Drizzle SQL migrations live next to the bundles so the runtime migrator
# (and the explicit migrate step below) can find them via DRIZZLE_MIGRATIONS_DIR.
COPY --from=base /build/artifacts/api-server/dist/drizzle ./drizzle

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
USER appuser

EXPOSE 3000
# Run migrations as a distinct step before booting the API. A failed migration
# exits non-zero, which fails the Railway deploy loudly instead of starting an
# API against an out-of-date schema. `exec` ensures Node replaces the shell so
# SIGTERM still reaches the server for graceful shutdown.
CMD ["sh", "-c", "node migrate.cjs && exec node index.cjs"]
