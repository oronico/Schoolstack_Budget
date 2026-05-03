// Task #455 — Unit tests for the cross-package fragility helper.
//
// These tests pin the contract that downstream consumers (api-server
// assumption-flag detector + lender/board PDF builders, plus the wizard's
// RevenueStep chip) rely on. We deliberately exercise the canonical
// fragile entries from the production STATE_FUNDING_MAP rather than
// fixture data so a future relabel of e.g. OH voucher status from
// "litigated" → "active" is caught here instead of silently flipping
// behavior in production.
import { describe, it, expect } from "vitest";
import {
  detectFragileFunding,
  ROW_ID_TO_PROGRAM_TYPE,
  PROGRAM_TYPE_TO_ROW_ID,
  STATE_FUNDING_MAP,
} from "@workspace/finance";

describe("ROW_ID_TO_PROGRAM_TYPE / PROGRAM_TYPE_TO_ROW_ID", () => {
  it("are exact inverses of each other", () => {
    for (const [rowId, programType] of Object.entries(ROW_ID_TO_PROGRAM_TYPE)) {
      expect(PROGRAM_TYPE_TO_ROW_ID[programType]).toBe(rowId);
    }
    for (const [programType, rowId] of Object.entries(PROGRAM_TYPE_TO_ROW_ID)) {
      expect(ROW_ID_TO_PROGRAM_TYPE[rowId]).toBe(programType);
    }
  });

  it("covers every SchoolChoiceProgramType that appears in STATE_FUNDING_MAP", () => {
    const seenTypes = new Set<string>();
    for (const entry of Object.values(STATE_FUNDING_MAP)) {
      for (const p of entry.programs) seenTypes.add(p.type);
    }
    for (const t of seenTypes) {
      expect(
        PROGRAM_TYPE_TO_ROW_ID[t as keyof typeof PROGRAM_TYPE_TO_ROW_ID],
        `Missing row-id mapping for program type "${t}". Add it to PROGRAM_TYPE_TO_ROW_ID and the wizard's RevenueStep mapping.`,
      ).toBeTruthy();
    }
  });
});

describe("detectFragileFunding — empty / guard cases", () => {
  it("returns an empty report when rows are missing", () => {
    const r = detectFragileFunding(null, "OH");
    expect(r.all).toHaveLength(0);
    expect(r.litigated).toHaveLength(0);
  });

  it("returns an empty report when state code is missing", () => {
    const r = detectFragileFunding([{ id: "voucher_revenue", enabled: true }], null);
    expect(r.all).toHaveLength(0);
  });

  it("returns an empty report for an unknown state", () => {
    const r = detectFragileFunding([{ id: "voucher_revenue", enabled: true }], "ZZ");
    expect(r.all).toHaveLength(0);
  });

  it("never flags charter schools (school-choice rows are not part of their forecast)", () => {
    const r = detectFragileFunding(
      [{ id: "voucher_revenue", enabled: true }],
      "OH",
      "charter_school",
    );
    expect(r.all).toHaveLength(0);
  });

  it("ignores explicitly disabled rows", () => {
    const r = detectFragileFunding(
      [{ id: "voucher_revenue", enabled: false }],
      "OH",
    );
    expect(r.all).toHaveLength(0);
  });

  it("ignores rows whose id is not a school-choice program", () => {
    const r = detectFragileFunding(
      [{ id: "gross_tuition", enabled: true }, { id: "registration_fees", enabled: true }],
      "OH",
    );
    expect(r.all).toHaveLength(0);
  });
});

describe("detectFragileFunding — non-active program detection", () => {
  it("flags OH voucher row as litigated (matches STATE_FUNDING_MAP)", () => {
    // Sanity-check the source of truth before asserting helper behavior so
    // a status flip in the catalog is reported with a clear message.
    const ohVoucher = STATE_FUNDING_MAP.OH.programs.find(p => p.type === "voucher");
    expect(ohVoucher?.status).toBe("litigated");

    const r = detectFragileFunding(
      [{ id: "voucher_revenue", enabled: true, lineItem: "OH EdChoice" }],
      "oh", // case-insensitive
      "private_school",
    );
    expect(r.litigated).toHaveLength(1);
    expect(r.litigated[0].rowId).toBe("voucher_revenue");
    expect(r.litigated[0].programType).toBe("voucher");
    expect(r.litigated[0].status).toBe("litigated");
    expect(r.litigated[0].stateCode).toBe("OH");
    expect(r.all).toHaveLength(1);
    expect(r.pending).toHaveLength(0);
    expect(r.blocked).toHaveLength(0);
  });

  it("flags UT ESA row as litigated", () => {
    const utEsa = STATE_FUNDING_MAP.UT.programs.find(p => p.type === "esa");
    expect(utEsa?.status).toBe("litigated");

    const r = detectFragileFunding([{ id: "esa_revenue", enabled: true }], "UT");
    expect(r.litigated).toHaveLength(1);
    expect(r.litigated[0].programType).toBe("esa");
  });

  it("flags GA Promise Scholarship as pending", () => {
    const gaProgram = STATE_FUNDING_MAP.GA.programs.find(p => p.status === "pending");
    expect(gaProgram).toBeDefined();
    const rowId = PROGRAM_TYPE_TO_ROW_ID[gaProgram!.type];

    const r = detectFragileFunding([{ id: rowId, enabled: true }], "GA");
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0].status).toBe("pending");
    expect(r.litigated).toHaveLength(0);
  });

  it("flags WY ESA as blocked", () => {
    const wyEsa = STATE_FUNDING_MAP.WY.programs.find(p => p.type === "esa");
    expect(wyEsa?.status).toBe("blocked");

    const r = detectFragileFunding([{ id: "esa_revenue", enabled: true }], "WY");
    expect(r.blocked).toHaveLength(1);
    expect(r.blocked[0].status).toBe("blocked");
  });

  it("does not flag an active program (e.g. AZ ESA)", () => {
    const azEsa = STATE_FUNDING_MAP.AZ.programs.find(p => p.type === "esa");
    expect(azEsa?.status).toBe("active");

    const r = detectFragileFunding([{ id: "esa_revenue", enabled: true }], "AZ");
    expect(r.all).toHaveLength(0);
  });

  it("dedupes when the same row id appears more than once", () => {
    const r = detectFragileFunding(
      [
        { id: "voucher_revenue", enabled: true },
        { id: "voucher_revenue", enabled: true },
      ],
      "OH",
    );
    expect(r.litigated).toHaveLength(1);
  });

  it("treats rows missing an explicit `enabled` flag as enabled (legacy data)", () => {
    const r = detectFragileFunding([{ id: "voucher_revenue" }], "OH");
    expect(r.litigated).toHaveLength(1);
  });

  it("preserves the founder-supplied lineItem label when present", () => {
    const r = detectFragileFunding(
      [{ id: "voucher_revenue", enabled: true, lineItem: "Custom voucher name" }],
      "OH",
    );
    expect(r.litigated[0].rowLineItem).toBe("Custom voucher name");
  });

  it("falls back to the program label when lineItem is missing", () => {
    const r = detectFragileFunding([{ id: "voucher_revenue", enabled: true }], "OH");
    expect(r.litigated[0].rowLineItem).toBe(
      STATE_FUNDING_MAP.OH.programs.find(p => p.type === "voucher")!.label,
    );
  });
});

describe("detectFragileFunding — yearRange computation", () => {
  it("omits yearRange when openingYear is not provided", () => {
    const r = detectFragileFunding(
      [{ id: "voucher_revenue", enabled: true, amounts: [1000, 1000, 1000, 1000, 1000] }],
      "OH",
      "private_school",
    );
    expect(r.litigated[0].yearRange).toBeUndefined();
  });

  it("computes the inclusive year range from non-zero amounts", () => {
    const r = detectFragileFunding(
      [{ id: "voucher_revenue", enabled: true, amounts: [0, 1000, 1000, 1000, 0] }],
      "OH",
      "private_school",
      2026,
    );
    expect(r.litigated[0].yearRange).toEqual({ firstYear: 2027, lastYear: 2029 });
  });

  it("collapses to a single-year span when only one year carries amounts", () => {
    const r = detectFragileFunding(
      [{ id: "voucher_revenue", enabled: true, amounts: [0, 0, 5000, 0, 0] }],
      "OH",
      "private_school",
      2026,
    );
    expect(r.litigated[0].yearRange).toEqual({ firstYear: 2028, lastYear: 2028 });
  });

  it("omits yearRange when every amount is zero (no real exposure)", () => {
    const r = detectFragileFunding(
      [{ id: "voucher_revenue", enabled: true, amounts: [0, 0, 0, 0, 0] }],
      "OH",
      "private_school",
      2026,
    );
    expect(r.litigated[0].yearRange).toBeUndefined();
  });
});

// Task #455 regression — flip a single program from non-active to active
// (and back) and confirm the helper reflects the change row-for-row. This
// guards against accidental cross-program coupling in the seen-set logic
// (e.g. an early-return that suppresses other rows once one fragile match
// fires).
describe("detectFragileFunding — single-program status flip", () => {
  it("emits exactly one match per fragile row regardless of how many active rows are present", () => {
    const r = detectFragileFunding(
      [
        { id: "voucher_revenue", enabled: true }, // OH voucher → litigated
        { id: "tax_credit_scholarship_revenue", enabled: true }, // OH tax credit → active
        { id: "private_scholarship_revenue", enabled: true }, // generic → active in OH
      ],
      "OH",
      "private_school",
    );
    expect(r.all).toHaveLength(1);
    expect(r.litigated).toHaveLength(1);
    expect(r.litigated[0].rowId).toBe("voucher_revenue");
  });

  it("emits zero matches once the only fragile row is removed", () => {
    const r = detectFragileFunding(
      [{ id: "tax_credit_scholarship_revenue", enabled: true }],
      "OH",
      "private_school",
    );
    expect(r.all).toHaveLength(0);
  });
});
