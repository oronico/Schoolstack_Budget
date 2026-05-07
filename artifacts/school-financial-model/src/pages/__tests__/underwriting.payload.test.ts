import { describe, it, expect } from "vitest";
import { computeBaseFinancials } from "@workspace/finance";
import {
  EMPTY_MODEL,
  buildModelDataPayload,
  computeLenderFlags,
  projectEnrollment,
  type GuestModel,
} from "../underwriting";

type RevRow = { id: string; amounts: number[]; collectionRate?: number };
type StaffRow = { id?: string; roleName?: string; startYear?: number; annualizedRate?: number };

function defaultModel(overrides: Partial<GuestModel> = {}): GuestModel {
  return { ...EMPTY_MODEL, ...overrides };
}

describe("buildModelDataPayload — tuition collection rate", () => {
  it("emits raw tuition amount + collectionRate so the engine applies slippage (Task #599/#603)", () => {
    // The wizard now passes the sticker tuition unchanged and tags the row
    // with collectionRate. The scenario engine multiplies by collectionRate
    // for every revenue driver type (Task #603), so every entry point
    // (wizard, full builder, API) sees identical P&L treatment without the
    // payload doing any pre-multiplication.
    const m = defaultModel({ year1Students: 30, perStudentTuition: 12000, tuitionCollectionRate: 95 });
    const payload = buildModelDataPayload(m) as { revenueRows: RevRow[] };
    const tuition = payload.revenueRows.find((r) => r.id === "rev_tuition");
    expect(tuition).toBeDefined();
    expect(tuition!.amounts[0]).toBe(12000);
    expect(tuition!.collectionRate).toBe(95);
  });

  it("Y1 tuition revenue through engine equals $342,000 for 30 students at $12K with 95% collection", () => {
    const m = defaultModel({ year1Students: 30, perStudentTuition: 12000, tuitionCollectionRate: 95 });
    const payload = buildModelDataPayload(m) as Parameters<typeof computeBaseFinancials>[0];
    const metrics = computeBaseFinancials(payload);
    expect(metrics.revenue[0]).toBeCloseTo(342000, -1);
  });

  it("Y5 revenue stays well below $1M for default 30-student case (regression: no million-dollar inflation)", () => {
    const m = defaultModel();
    const payload = buildModelDataPayload(m) as Parameters<typeof computeBaseFinancials>[0];
    const metrics = computeBaseFinancials(payload);
    expect(metrics.revenue[4]).toBeLessThan(1_000_000);
    expect(metrics.revenue[4]).toBeGreaterThan(500_000);
  });
});

describe("buildModelDataPayload — deferred founder compensation", () => {
  it("emits founder staffing row with startYear=2 when comp begins Year 2", () => {
    const m = defaultModel({
      founderAnnualCompensation: 60000,
      founderCompensationBeginsYear: 2,
      founderIsPaidYear1: false,
    });
    const payload = buildModelDataPayload(m) as { staffingRows: StaffRow[] };
    const founder = payload.staffingRows.find((r) => r.id === "staff_founder");
    expect(founder).toBeDefined();
    expect(founder!.startYear).toBe(2);
    expect(founder!.annualizedRate).toBe(60000);
  });

  it("emits founder row with startYear=1 when paid in Year 1", () => {
    const m = defaultModel({
      founderAnnualCompensation: 60000,
      founderCompensationBeginsYear: 1,
      founderIsPaidYear1: true,
    });
    const payload = buildModelDataPayload(m) as { staffingRows: StaffRow[] };
    const founder = payload.staffingRows.find((r) => r.id === "staff_founder");
    expect(founder).toBeDefined();
    expect(founder!.startYear).toBe(1);
  });

  it("omits founder row when no compensation planned", () => {
    const m = defaultModel({ founderAnnualCompensation: 0, founderIsPaidYear1: false });
    const payload = buildModelDataPayload(m) as { staffingRows: StaffRow[] };
    expect(payload.staffingRows.find((r) => r.id === "staff_founder")).toBeUndefined();
  });
});

describe("computeLenderFlags — guest DSCR", () => {
  it("labels DSCR flags as 'Estimated DSCR' when debt service is entered", () => {
    const m = defaultModel({ existingAnnualDebtService: 6000, hasExistingDebt: true });
    const enroll = projectEnrollment(m.year1Students, m.annualGrowthPct);
    const flags = computeLenderFlags(m, enroll);
    const dscrFlag = flags.find((f) => f.label.includes("DSCR"));
    expect(dscrFlag).toBeDefined();
    expect(dscrFlag!.label.startsWith("Estimated DSCR")).toBe(true);
  });

  it("DSCR ratio changes when entered debt service changes", () => {
    const enroll = projectEnrollment(EMPTY_MODEL.year1Students, EMPTY_MODEL.annualGrowthPct);
    const lowDebt = computeLenderFlags(defaultModel({ existingAnnualDebtService: 6000 }), enroll)
      .find((f) => f.label.includes("DSCR"))!.label;
    const highDebt = computeLenderFlags(defaultModel({ existingAnnualDebtService: 60000 }), enroll)
      .find((f) => f.label.includes("DSCR"))!.label;
    expect(lowDebt).not.toEqual(highDebt);
  });

  it("emits no DSCR flag when no debt service is entered", () => {
    const enroll = projectEnrollment(EMPTY_MODEL.year1Students, EMPTY_MODEL.annualGrowthPct);
    const flags = computeLenderFlags(defaultModel(), enroll);
    expect(flags.find((f) => f.label.includes("DSCR"))).toBeUndefined();
  });
});
