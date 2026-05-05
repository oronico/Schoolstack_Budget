// Task #581 — CLI wrapper around ensureRestoreValidationAccount.
//
// Usage (from project root):
//
//   # 1. Create the password in 1Password under
//   #    "DB restore validation account" (operator step, not scripted).
//   # 2. Export it locally:
//   export RESTORE_VALIDATION_PASSWORD='<paste-from-1password>'
//   # 3. Point at the target DB. For production, use the prod
//   #    DATABASE_URL (read it from Railway). For a restored throwaway,
//   #    point at $RESTORE_DB_URL — the restore runbook step 4d.
//   export DATABASE_URL="$PROD_DB_URL"
//   # 4. Run:
//   pnpm --filter @workspace/api-server exec tsx \
//     src/scripts/ensure-restore-validation-account.ts
//
// The script is idempotent: re-running is a no-op when the account
// already exists with the right password and at least one model. If
// the env-var password differs from the stored hash, the password is
// rotated in place — that lets an operator re-run after rotating the
// 1Password entry without touching the row by hand.

import { ensureRestoreValidationAccount } from "../lib/restore-validation-account.js";

async function main(): Promise<void> {
  const result = await ensureRestoreValidationAccount();
  if (result.status === "skipped") {
    console.error(`[restore-validation] Skipped: ${result.reason}`);
    process.exit(1);
  }
  console.log(
    `[restore-validation] Done. user_id=${result.userId} created=${result.created} password_rotated=${result.passwordRotated} model_created=${result.modelCreated}`,
  );
}

main().catch((err) => {
  console.error("[restore-validation] Failed:", err);
  process.exit(1);
});
