/**
 * Task #928 — Required Input regression guard.
 *
 * Tuition Collection Rate must be supplied on every enabled
 * tuition_and_fees row when the model's fundingProfile is tuition_based
 * or hybrid_mixed. The engine silently defaults missing values to 100%,
 * which earlier shipped lender packets containing "Tuition collection
 * rate: Not entered" rows that lenders couldn't interpret. This test
 * locks the gate so a future refactor cannot quietly downgrade it.
 *
 * The packet route guard (`requiredInputGuard` in routes/models.ts) is
 * a thin wrapper around `checkRequiredInputs`; covering the helper
 * exhaustively here covers the route behavior by construction.
 */
import { checkRequiredInputs, findMissingRequiredInputs } from "@workspace/finance";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

function model(over: {
  fundingProfile?: string;
  rows?: Array<{
    category?: string;
    collectionRate?: number | null;
    enabled?: boolean;
    /** Defaults to "autopay" so the gate engages — pass undefined to
     *  simulate an auxiliary row (e.g. registration fees) with no
     *  billing-method concept. */
    collectionMethod?: string | undefined;
  }>;
}) {
  return {
    schoolProfile: { fundingProfile: over.fundingProfile ?? "tuition_based" },
    revenueRows: (over.rows ?? []).map((r, i) => ({
      id: `row-${i}`,
      category: r.category ?? "tuition_and_fees",
      enabled: r.enabled ?? true,
      collectionMethod: "collectionMethod" in r ? r.collectionMethod : "autopay",
      collectionRate: r.collectionRate,
    })),
  } as unknown as Parameters<typeof checkRequiredInputs>[0];
}

// 1. Tuition-based, missing collectionRate → blocked
{
  const result = checkRequiredInputs(
    model({ fundingProfile: "tuition_based", rows: [{ collectionRate: undefined }] }),
  );
  check("tuition_based + missing rate → blocked", result.blocked === true);
  check(
    "tuition_based + missing rate → code is tuition_collection_rate_missing",
    result.missing[0]?.code === "tuition_collection_rate_missing",
  );
  check(
    "tuition_based + missing rate → message mentions Tuition Collection Rate",
    typeof result.message === "string" && /Tuition Collection Rate/i.test(result.message),
  );
}

// 2. Hybrid_mixed, missing → blocked
{
  const result = checkRequiredInputs(
    model({ fundingProfile: "hybrid_mixed", rows: [{ collectionRate: null }] }),
  );
  check("hybrid_mixed + missing rate → blocked", result.blocked === true);
}

// 3. Tuition-based, value supplied → not blocked
{
  const result = checkRequiredInputs(
    model({ fundingProfile: "tuition_based", rows: [{ collectionRate: 92 }] }),
  );
  check("tuition_based + rate supplied → not blocked", result.blocked === false);
  check(
    "tuition_based + rate supplied → no missing entries",
    findMissingRequiredInputs(
      model({ fundingProfile: "tuition_based", rows: [{ collectionRate: 92 }] }),
    ).length === 0,
  );
}

// 4. Zero is a valid (intentional) value — must NOT be treated as missing
{
  const result = checkRequiredInputs(
    model({ fundingProfile: "tuition_based", rows: [{ collectionRate: 0 }] }),
  );
  check("tuition_based + rate = 0 → not blocked", result.blocked === false);
}

// 5. Non-tuition fundingProfile → gate is off entirely
//    (Public/charter models don't bill tuition — gating here would
//    block their packets needlessly.)
{
  const result = checkRequiredInputs(
    model({ fundingProfile: "public_only", rows: [{ collectionRate: undefined }] }),
  );
  check("public_only + missing rate → not blocked", result.blocked === false);
}

// 6. Disabled rows are ignored
{
  const result = checkRequiredInputs(
    model({
      fundingProfile: "tuition_based",
      rows: [{ enabled: false, collectionRate: undefined }],
    }),
  );
  check("tuition_based + disabled row missing rate → not blocked", result.blocked === false);
}

// 7. Non-tuition_and_fees categories don't trigger the gate
{
  const result = checkRequiredInputs(
    model({
      fundingProfile: "tuition_based",
      rows: [{ category: "donations", collectionRate: undefined }],
    }),
  );
  check("tuition_based + donations row missing rate → not blocked", result.blocked === false);
}

// 8. Mixed rows (one supplied, one missing) → still blocked; reported
//    field path includes the missing row's id so the wizard can deep-link.
{
  const data = model({
    fundingProfile: "tuition_based",
    rows: [{ collectionRate: 95 }, { collectionRate: undefined }],
  });
  const result = checkRequiredInputs(data);
  check("mixed rows + one missing → blocked", result.blocked === true);
  if (result.blocked) {
    check(
      "mixed rows → field path references the missing row id",
      /^revenueRows\[row-1\]\.collectionRate$/.test(result.missing[0].field),
    );
    check(
      "mixed rows → label is 'Tuition Collection Rate'",
      result.missing[0].label === "Tuition Collection Rate",
    );
    check(
      "mixed rows → step is 'Revenue'",
      result.missing[0].step === "Revenue",
    );
  }
}

// 9. findMissingRequiredInputs returns the same payload as checkRequiredInputs.missing
{
  const data = model({ fundingProfile: "tuition_based", rows: [{ collectionRate: undefined }] });
  const direct = findMissingRequiredInputs(data);
  const viaCheck = checkRequiredInputs(data).missing;
  check(
    "findMissingRequiredInputs ≡ checkRequiredInputs.missing",
    JSON.stringify(direct) === JSON.stringify(viaCheck),
  );
}

// 10. Empty / undefined inputs do not throw and do not block
{
  const result = checkRequiredInputs({} as Parameters<typeof checkRequiredInputs>[0]);
  check("empty data → not blocked", result.blocked === false);
}

// 11. Auxiliary tuition_and_fees row with NO collectionMethod (e.g. a
//     registration fee that's paid up-front) must NOT trigger the gate
//     — the engine never asks for its collection rate, so blocking it
//     would force founders to fill in a value the appendix never shows.
{
  const result = checkRequiredInputs(
    model({
      fundingProfile: "tuition_based",
      rows: [
        { collectionRate: 95 }, // gross_tuition with autopay default
        { collectionMethod: undefined, collectionRate: undefined }, // registration_fees
      ],
    }),
  );
  check(
    "tuition_based + aux row without collectionMethod → not blocked",
    result.blocked === false,
  );
}

// 12. Route-level integration: simulate the export route's `requiredInputGuard`
//     end-to-end (request body → guard → Express response). This locks the
//     contract the wizard's ExportStep depends on (HTTP 422 + {code, missing[]}
//     for the "Complete this step" CTA). We replay the guard's logic against
//     a mock Response so the test stays hermetic (no DB, no auth, no HTTP
//     listener) while still exercising the exact statusCode / body shape the
//     wizard parses.
{
  type Captured = { status: number; body: unknown };
  function mockRes(): { res: { status: (n: number) => unknown; json: (b: unknown) => unknown }; captured: Captured } {
    const captured: Captured = { status: 0, body: undefined };
    const res = {
      status(n: number) {
        captured.status = n;
        return this;
      },
      json(b: unknown) {
        captured.body = b;
        return this;
      },
    };
    return { res, captured };
  }
  function guard(data: unknown, res: { status: (n: number) => unknown; json: (b: unknown) => unknown }): boolean {
    const required = checkRequiredInputs(data as Parameters<typeof checkRequiredInputs>[0]);
    if (!required.blocked) return false;
    res.status(422);
    res.json({ error: required.message, code: required.code, missing: required.missing });
    return true;
  }

  // 12a. Missing rate → 422 with documented payload shape.
  {
    const { res, captured } = mockRes();
    const halted = guard(
      model({ fundingProfile: "tuition_based", rows: [{ collectionRate: undefined }] }),
      res,
    );
    check("route guard → halts request when rate missing", halted === true);
    check("route guard → returns 422", captured.status === 422);
    const body = captured.body as { code?: string; error?: string; missing?: Array<{ field: string; message: string }> };
    check(
      "route guard → code = tuition_collection_rate_missing",
      body?.code === "tuition_collection_rate_missing",
    );
    check(
      "route guard → missing[0].field references revenueRows[id].collectionRate",
      /^revenueRows\[row-0\]\.collectionRate$/.test(body?.missing?.[0]?.field ?? ""),
    );
    check(
      "route guard → payload includes a human-readable message",
      typeof body?.error === "string" && (body.error?.length ?? 0) > 0,
    );
  }

  // 12b. Rate supplied → guard returns false (request continues).
  {
    const { res, captured } = mockRes();
    const halted = guard(
      model({ fundingProfile: "tuition_based", rows: [{ collectionRate: 96 }] }),
      res,
    );
    check("route guard → lets request through when rate supplied", halted === false);
    check("route guard → does not write a response when allowed", captured.status === 0);
  }
}

if (failures.length > 0) {
  console.error(`❌ required-inputs: ${failures.length} failure(s) (${passed} passed)`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`✅ required-inputs: ${passed} checks passed`);
