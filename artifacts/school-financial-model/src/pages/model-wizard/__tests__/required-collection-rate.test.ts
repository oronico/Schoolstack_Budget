/**
 * Task #928 — Wizard schema-level guard for Tuition Collection Rate.
 *
 * The Export step calls `fullModelSchema.safeParse(...)` before kicking off
 * a packet export. If `superRefine` (schema.ts:1122) doesn't emit an issue
 * at `revenueRows[i].collectionRate` for tuition_based / hybrid_mixed
 * models, RevenueStep won't render the inline error and the founder will
 * keep hitting the backend 422 with no on-screen explanation. Locking the
 * issue path here mirrors the server gate in lib/finance/required-inputs.
 */
import { describe, expect, it } from "vitest";
import { fullModelSchema } from "../schema";

function baseModel(over: Record<string, unknown> = {}) {
  return {
    schoolProfile: {
      // Fields below cover every non-optional, non-defaulted field on
      // schoolProfileSchema so the outer parse succeeds and our
      // superRefine actually runs against the populated value.
      schoolName: "Test Academy",
      state: "TX",
      schoolType: "private_school",
      entityType: "nonprofit_501c3",
      schoolStage: "operating_school",
      fundingProfile: "tuition_based",
      modelDuration: "five_year",
      maxCapacity: 200,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      ...((over.schoolProfile as Record<string, unknown>) ?? {}),
    },
    enrollment: { year1: 100, year2: 110, year3: 120, year4: 130, year5: 140 },
    revenueRows: over.revenueRows ?? [
      {
        id: "gross_tuition",
        category: "tuition_and_fees",
        lineItem: "Private Pay / Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [10000, 10300, 10609, 10927, 11255],
        billingMonths: 10,
        collectionMethod: "autopay",
        // collectionRate intentionally omitted
      },
    ],
  } as unknown;
}

function collectionRateIssues(parsed: ReturnType<typeof fullModelSchema.safeParse>) {
  if (parsed.success) return [];
  return parsed.error.issues.filter(
    (i) => i.path[0] === "revenueRows" && i.path[i.path.length - 1] === "collectionRate",
  );
}

describe("fullModelSchema — Tuition Collection Rate required", () => {
  it("emits an issue at revenueRows[i].collectionRate for tuition_based models", () => {
    const parsed = fullModelSchema.safeParse(baseModel());
    const issues = collectionRateIssues(parsed);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toMatch(/Tuition Collection Rate/i);
    expect(issues[0].message).toMatch(/95.*100.*autopay/i);
    expect(issues[0].message).toMatch(/88.*95.*invoice/i);
  });

  it("emits the same issue for hybrid_mixed models", () => {
    const parsed = fullModelSchema.safeParse(
      baseModel({ schoolProfile: { fundingProfile: "hybrid_mixed" } }),
    );
    expect(collectionRateIssues(parsed).length).toBeGreaterThan(0);
  });

  it("does NOT emit the issue for charter_public_funded (pure charter) models", () => {
    const parsed = fullModelSchema.safeParse(
      baseModel({
        schoolProfile: { fundingProfile: "charter_public_funded", schoolType: "charter_school" },
      }),
    );
    expect(collectionRateIssues(parsed)).toEqual([]);
  });

  it("DOES emit the issue for hybrid_mixed charter models with a tuition row missing collectionRate", () => {
    const parsed = fullModelSchema.safeParse(
      baseModel({
        schoolProfile: { fundingProfile: "hybrid_mixed", schoolType: "charter_school" },
      }),
    );
    expect(collectionRateIssues(parsed).length).toBeGreaterThan(0);
  });

  it("does NOT emit the issue when collectionRate is supplied", () => {
    const parsed = fullModelSchema.safeParse(
      baseModel({
        revenueRows: [
          {
            id: "gross_tuition",
            category: "tuition_and_fees",
            lineItem: "Private Pay / Tuition",
            enabled: true,
            driverType: "per_student",
            amounts: [10000, 10300, 10609, 10927, 11255],
            billingMonths: 10,
            collectionMethod: "autopay",
            collectionRate: 96,
          },
        ],
      }),
    );
    expect(collectionRateIssues(parsed)).toEqual([]);
  });

  it("does NOT emit the issue for an auxiliary tuition_and_fees row without a billing method (e.g. registration fees)", () => {
    const parsed = fullModelSchema.safeParse(
      baseModel({
        revenueRows: [
          {
            id: "gross_tuition",
            category: "tuition_and_fees",
            lineItem: "Private Pay / Tuition",
            enabled: true,
            driverType: "per_student",
            amounts: [10000, 10300, 10609, 10927, 11255],
            billingMonths: 10,
            collectionMethod: "autopay",
            collectionRate: 96,
          },
          {
            id: "registration_fees",
            category: "tuition_and_fees",
            lineItem: "Registration / Enrollment Fees",
            enabled: true,
            driverType: "per_student",
            amounts: [250, 250, 250, 250, 250],
            billingMonths: 12,
            // no collectionMethod, no collectionRate
          },
        ],
      }),
    );
    expect(collectionRateIssues(parsed)).toEqual([]);
  });
});
