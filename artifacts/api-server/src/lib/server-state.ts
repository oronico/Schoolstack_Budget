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
