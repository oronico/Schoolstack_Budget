/**
 * Task #860 — Hard-block regression guard.
 *
 * `funding_mix_inconsistent` represents a structural data inconsistency
 * (e.g. ESA + voucher per student exceeds the seat sticker price). It
 * MUST block all 6 export routes regardless of whether the founder has
 * supplied an explanation reason — narrative cannot rescue a number that
 * doesn't add up. This test locks that behavior in so a future refactor
 * cannot quietly downgrade the gate to "warning + reason clears it".
 */
import {
  checkUnresolvedFlags,
  HARD_BLOCK_FLAG_TYPES,
} from "../src/lib/check-unresolved-flags.js";
import type { AssumptionFlag } from "../src/lib/assumption-flags.js";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

function flag(over: Partial<AssumptionFlag>): AssumptionFlag {
  return {
    field: "x",
    flagType: "generic_warning",
    severity: "warning",
    currentValue: 0,
    benchmark: 0,
    defaultPrompt: "explain",
    ...over,
  } as AssumptionFlag;
}

check(
  "no flags → not blocked",
  checkUnresolvedFlags([], []).blocked === false,
);

check(
  "warning without reason → blocked",
  checkUnresolvedFlags(
    [flag({ flagType: "low_dscr", field: "dscr_y1", severity: "warning" })],
    [],
  ).blocked === true,
);

check(
  "warning with reason → not blocked",
  checkUnresolvedFlags(
    [flag({ flagType: "low_dscr", field: "dscr_y1", severity: "warning" })],
    [{ flagType: "low_dscr", field: "dscr_y1", reason: "lender approved waiver" }],
  ).blocked === false,
);

check(
  "info-level → never blocks",
  checkUnresolvedFlags(
    [flag({ flagType: "fyi", field: "n", severity: "info" })],
    [],
  ).blocked === false,
);

check(
  "funding_mix_inconsistent registered as hard-block type",
  HARD_BLOCK_FLAG_TYPES.has("funding_mix_inconsistent"),
);

check(
  "Task #860 — funding_mix_inconsistent without reason → blocked",
  checkUnresolvedFlags(
    [
      flag({
        flagType: "funding_mix_inconsistent",
        field: "school_choice:fes_eo",
        severity: "warning",
      }),
    ],
    [],
  ).blocked === true,
);

const withReason = checkUnresolvedFlags(
  [
    flag({
      flagType: "funding_mix_inconsistent",
      field: "school_choice:fes_eo",
      severity: "warning",
    }),
  ],
  [
    {
      flagType: "funding_mix_inconsistent",
      field: "school_choice:fes_eo",
      reason: "founder said it's fine",
    },
  ],
);
check(
  "Task #860 — funding_mix_inconsistent + reason STILL blocked",
  withReason.blocked === true,
  `expected blocked=true, got ${withReason.blocked}`,
);
check(
  "hard-block message names the structural inconsistency",
  /structural inconsistency/i.test(withReason.message) &&
    /explanation cannot resolve/i.test(withReason.message),
  withReason.message,
);

const mixed = checkUnresolvedFlags(
  [
    flag({ flagType: "low_dscr", field: "dscr_y1", severity: "warning" }),
    flag({
      flagType: "funding_mix_inconsistent",
      field: "school_choice:esa",
      severity: "warning",
    }),
  ],
  [
    { flagType: "low_dscr", field: "dscr_y1", reason: "ok" },
    {
      flagType: "funding_mix_inconsistent",
      field: "school_choice:esa",
      reason: "ok",
    },
  ],
);
check(
  "hard-block fires even when other warnings are resolved",
  mixed.blocked === true && /structural inconsistency/i.test(mixed.message),
);

// Task #860 EXPANDED — funding_mix_unmigrated is a hard-block flag.
// Cannot be cleared by an explanation reason; the founder must re-open
// the wizard so the v2 migration runs and `revenueModelVersion` is
// stamped.
check(
  "Task #860 EXPANDED — funding_mix_unmigrated registered as hard-block",
  HARD_BLOCK_FLAG_TYPES.has("funding_mix_unmigrated"),
);

const unmigratedWithReason = checkUnresolvedFlags(
  [
    flag({
      flagType: "funding_mix_unmigrated",
      field: "revenueModelVersion",
      severity: "critical",
    }),
  ],
  [
    {
      flagType: "funding_mix_unmigrated",
      field: "revenueModelVersion",
      reason: "founder said it's fine",
    },
  ],
);
check(
  "funding_mix_unmigrated + reason STILL blocked",
  unmigratedWithReason.blocked === true,
  `expected blocked=true, got ${unmigratedWithReason.blocked}`,
);

if (failures.length > 0) {
  console.error(`check-unresolved-flags: ${failures.length} failed:`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`check-unresolved-flags: ${passed} checks passed`);
