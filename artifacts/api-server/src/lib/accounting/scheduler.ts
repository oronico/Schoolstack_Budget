// Daily background sync for QuickBooks/Xero accounting connections.
//
// Why a scheduler? Founders only see fresh actuals when they manually click
// "Sync now" on the scenarios page. If they spend a week working on the
// wizard without visiting scenarios, the cached snapshot in the actuals
// editor goes stale and the live-data badge stops being useful. A nightly
// background sweep keeps every connected model fresh without any manual
// action and surfaces token-revoked / provider-down failures via
// `last_sync_error` so the UI can prompt a reconnect.
//
// Scheduling strategy:
//   - One short initial-delay timer fires shortly after boot (so we don't
//     stampede the providers during a deploy roll), then a recurring
//     interval kicks in.
//   - Each tick iterates every accounting connection that has tokens and
//     attempts a sync. Per-connection failures are isolated — they never
//     stop the rest of the sweep.
//   - Tokens self-rotate inside `syncAccountingConnection` (Xero rolls the
//     refresh token on every refresh), so the daily cadence keeps the OAuth
//     grant alive on its own.
import {
  syncAccountingConnection,
  getDefaultDbAdapter,
  type SyncDeps,
} from "./sync";
import {
  getProviderClient as defaultGetProviderClient,
  isAccountingProvider,
} from "./providers";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_INITIAL_DELAY_MS = 60_000; // 1 min after boot
const PER_CONNECTION_DELAY_MS = 250; // small spacing between provider calls

let initialTimer: ReturnType<typeof setTimeout> | null = null;
let recurringTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

export interface SchedulerOptions {
  intervalMs?: number;
  initialDelayMs?: number;
  // When true, the scheduler runs even outside production. Defaults to the
  // value of `NODE_ENV === "production"` so local `pnpm dev` doesn't quietly
  // hammer real provider APIs.
  enabled?: boolean;
  // Dependency seams used by tests. Production callers omit these.
  deps?: SyncDeps;
}

function isEnabled(opts: SchedulerOptions): boolean {
  if (typeof opts.enabled === "boolean") return opts.enabled;
  const flag = process.env.ACCOUNTING_SCHEDULER_ENABLED;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function startAccountingSyncScheduler(opts: SchedulerOptions = {}): void {
  if (initialTimer || recurringTimer) {
    // Already started — caller is being defensive; we treat it as a no-op
    // rather than throwing because some tests may call start() twice.
    return;
  }
  const dbAdapter = opts.deps?.dbAdapter ?? getDefaultDbAdapter();
  if (!dbAdapter) {
    console.log("[accounting:scheduler] DB not configured, scheduler disabled.");
    return;
  }
  if (!isEnabled(opts)) {
    console.log(
      "[accounting:scheduler] Disabled (set ACCOUNTING_SCHEDULER_ENABLED=true to enable in non-production).",
    );
    return;
  }

  const intervalMs =
    opts.intervalMs ??
    (Number(process.env.ACCOUNTING_SCHEDULER_INTERVAL_MS) || DEFAULT_INTERVAL_MS);
  const initialDelayMs =
    opts.initialDelayMs ??
    (Number(process.env.ACCOUNTING_SCHEDULER_INITIAL_DELAY_MS) || DEFAULT_INITIAL_DELAY_MS);

  console.log(
    `[accounting:scheduler] Starting daily sync — initial delay ${Math.round(initialDelayMs / 1000)}s, interval ${Math.round(intervalMs / 3_600_000)}h.`,
  );

  initialTimer = setTimeout(() => {
    initialTimer = null;
    void runSyncSweep(opts.deps);
    recurringTimer = setInterval(() => {
      void runSyncSweep(opts.deps);
    }, intervalMs);
    // Don't keep the event loop alive solely for this timer — graceful
    // shutdown still clears it explicitly via stopAccountingSyncScheduler().
    recurringTimer.unref();
  }, initialDelayMs);
  initialTimer.unref();
}

export function stopAccountingSyncScheduler(): void {
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
  }
}

export interface SweepSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export async function runSyncSweep(deps: SyncDeps = {}): Promise<SweepSummary> {
  const dbAdapter = deps.dbAdapter ?? getDefaultDbAdapter();
  const getProviderClient = deps.getProviderClient ?? defaultGetProviderClient;
  const summary: SweepSummary = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
  if (!dbAdapter) return summary;
  // Two parallel sweeps would race on token-refresh updates; if a previous
  // sweep is still running we just skip this tick.
  if (inFlight) {
    console.warn("[accounting:scheduler] Previous sweep still in flight; skipping this tick.");
    return summary;
  }
  inFlight = true;
  try {
    const rows = await dbAdapter.listConnections();
    for (const conn of rows) {
      if (
        !isAccountingProvider(conn.provider) ||
        !conn.accessTokenEncrypted ||
        !conn.refreshTokenEncrypted ||
        !conn.realmId
      ) {
        summary.skipped++;
        continue;
      }
      if (!getProviderClient(conn.provider).isConfigured()) {
        // Server is missing OAuth credentials for this provider — the
        // connection rows survive across credential rotations but we can't
        // do anything useful here, so skip silently.
        summary.skipped++;
        continue;
      }
      summary.attempted++;
      const result = await syncAccountingConnection(conn, {
        dbAdapter,
        getProviderClient,
      });
      if (result.ok) {
        summary.succeeded++;
      } else {
        summary.failed++;
        console.warn(
          `[accounting:scheduler] Sync failed for connection ${conn.id} (${conn.provider}): ${result.error}`,
        );
      }
      if (PER_CONNECTION_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, PER_CONNECTION_DELAY_MS));
      }
    }
    if (summary.attempted > 0 || summary.failed > 0) {
      console.log(
        `[accounting:scheduler] Sweep complete — attempted=${summary.attempted} ok=${summary.succeeded} failed=${summary.failed} skipped=${summary.skipped}.`,
      );
    }
  } catch (err) {
    console.error("[accounting:scheduler] Unexpected sweep error:", err);
  } finally {
    inFlight = false;
  }
  return summary;
}
