import type { FullModelData } from "@/pages/model-wizard/schema";

/**
 * Task #657 — Operating-path Y1 seeder.
 *
 * When a founder picks the "actuals" pathway and fills in last year's
 * numbers on the Actuals Intake screen, we use those numbers to seed the
 * *empty* Year-1 cells of the projection so the rest of the wizard starts
 * with a credible baseline (instead of zeros). Without this, founders who
 * answered the actuals questions still saw empty Y1 inputs and had to
 * retype the same numbers — i.e. their actuals were collected and ignored.
 *
 * Rules (mirror seed-five-year.ts so the two seeders compose cleanly):
 *   • Pure — never mutates the caller's form state.
 *   • Idempotent — only fills *empty* (0 / undefined / null) Y1 cells; any
 *     non-zero value the founder previously typed is preserved.
 *   • Y2-Y5 are never touched here. Use seedFiveYearFromYearOne for ramps.
 *   • Only runs when wizardPathway === "actuals" AND priorYearSnapshot has
 *     at least one numeric field set.
 */

type Snapshot = NonNullable<FullModelData["priorYearSnapshot"]>;

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function isEmptyCell(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "number") return v <= 0;
  if (typeof v === "string") return v.trim() === "" || Number(v) <= 0;
  return false;
}

function seedAmountsY1(amounts: number[] | undefined, value: number): number[] {
  const out = [...(amounts ?? [])];
  while (out.length < 5) out.push(0);
  if (isEmptyCell(out[0]) && value > 0) out[0] = value;
  return out;
}

export function hasActualsSeedData(
  snapshot: Snapshot | undefined,
): boolean {
  if (!snapshot) return false;
  return (
    num(snapshot.totalRevenue) > 0 ||
    num(snapshot.totalExpenses) > 0 ||
    num(snapshot.endingCash) > 0 ||
    num(snapshot.endingEnrollment) > 0 ||
    num(snapshot.tuitionRevenue) > 0 ||
    num(snapshot.publicFundingRevenue) > 0 ||
    num(snapshot.philanthropyRevenue) > 0 ||
    num(snapshot.otherRevenue) > 0 ||
    num(snapshot.personnelExpenses) > 0 ||
    num(snapshot.facilityExpenses) > 0 ||
    num(snapshot.instructionalExpenses) > 0 ||
    num(snapshot.adminExpenses) > 0
  );
}

export function seedY1FromActuals(input: FullModelData): FullModelData {
  // Pathway guard — only run on models the founder has explicitly tagged
  // "actuals". Without this, a future caller that loops over models for
  // bulk-seeding (e.g. an admin backfill) could silently seed an
  // assumptions-pathway model that happens to carry a stray
  // priorYearSnapshot — exactly the contract the docstring promises to
  // prevent. The wizard call site (`handleNext` on Actuals Intake) is
  // already guarded by step visibility, so this is belt-and-suspenders.
  const pathway = input.schoolProfile?.wizardPathway;
  if (pathway !== undefined && pathway !== "actuals") return input;
  const snapshot = input.priorYearSnapshot as Snapshot | undefined;
  if (!hasActualsSeedData(snapshot)) return input;
  const snap = snapshot as Snapshot;

  const next: FullModelData = { ...input };

  // 1) Enrollment — Y1 student count.
  const endingEnrollment = num(snap.endingEnrollment);
  if (endingEnrollment > 0) {
    const enrollment = { ...((next.enrollment ?? {}) as Record<string, unknown>) };
    if (isEmptyCell(enrollment.year1)) {
      enrollment.year1 = endingEnrollment;
    }
    next.enrollment = enrollment as FullModelData["enrollment"];
  }

  // 2) Opening cash — Y1 starting cash position.
  const endingCash = num(snap.endingCash);
  if (endingCash > 0) {
    const ob = { ...((next.openingBalances ?? {}) as Record<string, unknown>) };
    if (isEmptyCell(ob.cash)) {
      ob.cash = endingCash;
    }
    next.openingBalances = ob as FullModelData["openingBalances"];
  }

  // 3) Revenue rows — seed Y1 by category. We only touch the *first* enabled
  // row per category so we never silently double-count when the founder has
  // already split tuition across multiple lines (full-pay + scholarship +
  // discounts, etc.). Falls back to a synthesized row if the category has
  // none yet — common when the founder skipped the Revenue step entirely
  // and is relying purely on the actuals seed.
  const revenueByCategory: Array<[string, number]> = [
    ["tuition_and_fees", num(snap.tuitionRevenue)],
    ["public_funding", num(snap.publicFundingRevenue)],
    ["philanthropy", num(snap.philanthropyRevenue)],
    ["other_revenue", num(snap.otherRevenue)],
  ];
  const totalRevenueBreakdown = revenueByCategory.reduce((s, [, v]) => s + v, 0);
  // If founder gave only the top-line totalRevenue (no breakdown), put the
  // whole bucket under tuition_and_fees so DSCR/runway have something to
  // chew on. Founders can re-categorize on the Revenue step.
  if (totalRevenueBreakdown === 0 && num(snap.totalRevenue) > 0) {
    revenueByCategory[0] = ["tuition_and_fees", num(snap.totalRevenue)];
  }

  const revenueRows = [...((next.revenueRows ?? []) as Array<Record<string, unknown>>)];
  for (const [category, amount] of revenueByCategory) {
    if (amount <= 0) continue;
    const idx = revenueRows.findIndex(
      (r) => r.category === category && r.enabled !== false,
    );
    if (idx >= 0) {
      const row = { ...revenueRows[idx] };
      row.amounts = seedAmountsY1(row.amounts as number[] | undefined, amount);
      revenueRows[idx] = row;
    } else {
      revenueRows.push({
        id: `actuals_seed_${category}`,
        category,
        lineItem:
          category === "tuition_and_fees"
            ? "Tuition & Fees (from actuals)"
            : category === "public_funding"
              ? "Public Funding (from actuals)"
              : category === "philanthropy"
                ? "Philanthropy (from actuals)"
                : "Other Revenue (from actuals)",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [amount, 0, 0, 0, 0],
      });
    }
  }
  next.revenueRows = revenueRows as FullModelData["revenueRows"];

  // 4) Expense rows — same approach, by canonical category. The Expense step
  // groups by personnel/facility/instructional/admin so those four match
  // 1:1 with the actuals questions.
  const expenseByCategory: Array<[string, string, number]> = [
    ["personnel", "Personnel (from actuals)", num(snap.personnelExpenses)],
    ["facility", "Facility (from actuals)", num(snap.facilityExpenses)],
    ["instructional", "Instructional (from actuals)", num(snap.instructionalExpenses)],
    ["admin", "Admin (from actuals)", num(snap.adminExpenses)],
  ];
  const totalExpenseBreakdown = expenseByCategory.reduce((s, [, , v]) => s + v, 0);
  if (totalExpenseBreakdown === 0 && num(snap.totalExpenses) > 0) {
    expenseByCategory[0] = ["admin", "Operating Expenses (from actuals)", num(snap.totalExpenses)];
  }

  const expenseRows = [...((next.expenseRows ?? []) as Array<Record<string, unknown>>)];
  for (const [category, label, amount] of expenseByCategory) {
    if (amount <= 0) continue;
    const idx = expenseRows.findIndex(
      (r) => r.category === category && r.enabled !== false,
    );
    if (idx >= 0) {
      const row = { ...expenseRows[idx] };
      row.amounts = seedAmountsY1(row.amounts as number[] | undefined, amount);
      expenseRows[idx] = row;
    } else {
      expenseRows.push({
        id: `actuals_seed_${category}`,
        category,
        lineItem: label,
        enabled: true,
        driverType: "annual_fixed",
        amounts: [amount, 0, 0, 0, 0],
      });
    }
  }
  next.expenseRows = expenseRows as FullModelData["expenseRows"];

  return next;
}
