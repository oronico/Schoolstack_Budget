FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /build

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY artifacts/api-server/package.json artifacts/api-server/

RUN pnpm install --frozen-lockfile --prod=false

COPY lib/db/ lib/db/
COPY lib/api-zod/ lib/api-zod/
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

RUN npm install --no-save adm-zip@0.5.16

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
USER appuser

EXPOSE 3000
# Run migrations as a distinct step before booting the API. A failed migration
# exits non-zero, which fails the Railway deploy loudly instead of starting an
# API against an out-of-date schema. `exec` ensures Node replaces the shell so
# SIGTERM still reaches the server for graceful shutdown.
CMD ["sh", "-c", "node migrate.cjs && exec node index.cjs"]
