type MigrationStatus = "pending" | "ok" | "failed";

let migrationStatus: MigrationStatus = "pending";
let migrationError: string | null = null;

export function setMigrationOk(): void {
  migrationStatus = "ok";
  migrationError = null;
}

export function setMigrationFailed(err: unknown): void {
  migrationStatus = "failed";
  migrationError = err instanceof Error ? err.message : String(err);
}

export function getMigrationStatus(): MigrationStatus {
  return migrationStatus;
}

export function getMigrationError(): string | null {
  return migrationError;
}

// Reset the migration tracker back to its initial "pending" state. Intended for
// tests that need a clean slate between cases, or for any future code path that
// re-runs migrations and needs to reflect that state from /health endpoints.
export function resetMigrationStatus(): void {
  migrationStatus = "pending";
  migrationError = null;
}
