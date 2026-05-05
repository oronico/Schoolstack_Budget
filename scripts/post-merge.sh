#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply the same throwaway-Postgres migration check the PR workflow runs, so a
# bad migration that snuck in without a PR check (hotfix, force-push, branch
# drift) fails loudly here instead of half-applying to the live dev DB on the
# next `pnpm --filter db push`.
pnpm check:migrations
pnpm --filter db push
