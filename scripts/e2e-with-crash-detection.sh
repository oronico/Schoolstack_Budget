#!/usr/bin/env bash
# Task #587 — Surface api-server crashes during e2e runs.
#
# Task #586 made the api-server keep running after an uncaughtException /
# unhandledRejection in non-production so a single bad spec no longer
# cascades into 17 ECONNREFUSED failures. The downside: a real server-side
# bug now only writes a `[FATAL]` line to stdout and a row to error_logs,
# so a flaky e2e run could mask it. This wrapper is the post-step grep
# the task description calls for: it tees the e2e output to a log file,
# then after Playwright exits it
#   1. greps that log for `[FATAL]` lines, and
#   2. queries the error_logs table for `process_crash` rows inserted
#      since the run started.
# Either signal fails the workflow with a clear message, so a green run
# really does mean the api-server stayed healthy end-to-end.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${REPO_ROOT}/.local/e2e-logs"
mkdir -p "${LOG_DIR}"
RUN_LOG="${LOG_DIR}/e2e-$(date -u +%Y%m%dT%H%M%SZ).log"

# Capture the run start as a Postgres-friendly UTC timestamp so the
# error_logs query below only sees crashes from *this* run, not stale
# rows from a previous failure.
START_TS="$(date -u +"%Y-%m-%d %H:%M:%S")"

echo "[e2e-wrapper] Run starting at ${START_TS} UTC"
echo "[e2e-wrapper] Tee'ing combined output to ${RUN_LOG}"

set +e
E2E_PORT="${E2E_PORT:-23192}" \
E2E_START_SERVERS=1 \
  pnpm --filter @workspace/school-financial-model run test:e2e:smoke 2>&1 \
  | tee "${RUN_LOG}"
PLAYWRIGHT_EXIT=${PIPESTATUS[0]}
set -e

echo "[e2e-wrapper] Playwright exited with status ${PLAYWRIGHT_EXIT}"

# 1) Stdout/stderr grep. The api-server prints `[FATAL]` from the
#    uncaughtException / unhandledRejection handlers in
#    artifacts/api-server/src/index.ts. Playwright's webServer config
#    pipes those lines into our tee'd log.
FATAL_HITS=0
if grep -nF '[FATAL]' "${RUN_LOG}" >/tmp/e2e-fatal-hits 2>/dev/null; then
  FATAL_HITS=$(wc -l </tmp/e2e-fatal-hits | tr -d ' ')
fi

if [ "${FATAL_HITS}" -gt 0 ]; then
  echo ""
  echo "[e2e-wrapper] ❌ Found ${FATAL_HITS} [FATAL] line(s) in api-server output:"
  sed 's/^/    /' /tmp/e2e-fatal-hits
fi

# 2) Database check. The api-server's crash handler also writes a row
#    to error_logs with route='process_crash'. We query for any rows
#    inserted since START_TS as a backstop in case the [FATAL] stdout
#    line was somehow lost (buffered, dropped, etc).
CRASH_ROWS=""
CRASH_COUNT=0
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  CRASH_ROWS="$(psql "${DATABASE_URL}" -At -F '|' -v ON_ERROR_STOP=1 -c \
    "SELECT id, created_at, left(error_message, 200) FROM error_logs \
     WHERE route = 'process_crash' AND created_at >= '${START_TS}'::timestamp \
     ORDER BY created_at" 2>/dev/null || true)"
  if [ -n "${CRASH_ROWS}" ]; then
    CRASH_COUNT=$(printf '%s\n' "${CRASH_ROWS}" | wc -l | tr -d ' ')
  fi
else
  echo "[e2e-wrapper] (skipped error_logs query — DATABASE_URL or psql unavailable)"
fi

if [ "${CRASH_COUNT}" -gt 0 ]; then
  echo ""
  echo "[e2e-wrapper] ❌ Found ${CRASH_COUNT} process_crash row(s) in error_logs since ${START_TS}:"
  printf '%s\n' "${CRASH_ROWS}" | sed 's/^/    /'
fi

if [ "${FATAL_HITS}" -gt 0 ] || [ "${CRASH_COUNT}" -gt 0 ]; then
  echo ""
  echo "[e2e-wrapper] ❌ api-server crashed during the e2e run."
  echo "[e2e-wrapper]    Task #586 keeps the process alive so subsequent"
  echo "[e2e-wrapper]    specs don't cascade-fail, but a crash is still a"
  echo "[e2e-wrapper]    real bug. Failing the workflow so a reviewer can't"
  echo "[e2e-wrapper]    miss it. Full output: ${RUN_LOG}"
  if [ "${PLAYWRIGHT_EXIT}" -eq 0 ]; then
    exit 2
  fi
  exit "${PLAYWRIGHT_EXIT}"
fi

if [ "${PLAYWRIGHT_EXIT}" -ne 0 ]; then
  echo "[e2e-wrapper] Playwright failed but no api-server crash was detected."
  exit "${PLAYWRIGHT_EXIT}"
fi

echo "[e2e-wrapper] ✅ Playwright passed and no api-server crashes detected."
