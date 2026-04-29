import { setMigrationOk, setMigrationFailed } from "./server-state";

export interface ApplyMigrationsDeps {
  // True when a real DB pool is configured. When false we record the
  // migration state as "ok" (nothing to migrate against) and return immediately.
  hasPool: boolean;
  // Runs the actual schema migrations. Wrapped so tests can supply a fake
  // implementation without dragging in the real DB.
  runMigrations: () => Promise<void>;
  // True in `NODE_ENV=production`. In production a failed migration leaves
  // the schema in an unknown state, so we exit non-zero rather than serve
  // traffic. In dev we keep the server up so /health can surface the error.
  isProduction: boolean;
  // How to terminate the process when production migrations fail. Injected so
  // tests can capture the exit code without actually killing the test runner.
  exit: (code: number) => void;
  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
}

export async function applyMigrations(deps: ApplyMigrationsDeps): Promise<void> {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;

  if (!deps.hasPool) {
    setMigrationOk();
    return;
  }
  try {
    await deps.runMigrations();
    setMigrationOk();
    log("[migrations] Schema up to date.");
  } catch (err) {
    logError("[migrations] Failed to run migrations:", err);
    setMigrationFailed(err);
    if (deps.isProduction) {
      // In production a failed migration leaves the schema in an unknown state,
      // so refuse to start serving traffic against it. The early return guards
      // tests where `exit` is a stub that doesn't actually terminate.
      deps.exit(1);
      return;
    }
    // In dev we keep the server up so the failure is visible from the preview
    // pane via /health (which reports a degraded state with the error
    // message), instead of disappearing into the console and surfacing later
    // as cryptic 500s.
    logError(
      "[migrations] Continuing to start in dev mode with DEGRADED state — /health will report the failure.",
    );
  }
}
