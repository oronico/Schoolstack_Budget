import { describe, it, expect } from "vitest";
import {
  classifyRevenueRow,
  computeRevenueSourceMix,
  PRIVATE_BUCKET_ORDER,
  CHARTER_BUCKET_ORDER,
} from "@workspace/finance";

describe("classifyRevenueRow (private taxonomy)", () => {
  it("classifies gross_tuition as private_pay", () => {
    expect(
      classifyRevenueRow({ id: "gross_tuition", category: "tuition_and_fees" }),
    ).toBe("private_pay");
  });
  it("classifies registration / fees as private_pay", () => {
    expect(
      classifyRevenueRow({
        id: "registration_fees",
        category: "tuition_and_fees",
      }),
    ).toBe("private_pay");
  });
  it("returns null for tuition_offsets (gets netted into private_pay)", () => {
    expect(
      classifyRevenueRow({ id: "scholarships_aid", category: "tuition_offsets" }),
    ).toBeNull();
  });
  it("classifies ESA rows as esa", () => {
    expect(
      classifyRevenueRow({ id: "esa_revenue", category: "school_choice" }),
    ).toBe("esa");
  });
  it("classifies voucher rows as voucher", () => {
    expect(
      classifyRevenueRow({ id: "voucher_revenue", category: "school_choice" }),
    ).toBe("voucher");
  });
  it("classifies tax-credit rows as tax_credit", () => {
    expect(
      classifyRevenueRow({
        id: "tax_credit_scholarship",
        category: "school_choice",
      }),
    ).toBe("tax_credit");
    expect(
      classifyRevenueRow({
        id: "federal_tax_credit_sgo",
        category: "school_choice",
      }),
    ).toBe("tax_credit");
  });
  it("classifies scholarship-org rows as scholarship", () => {
    expect(
      classifyRevenueRow({
        id: "scholarship_org",
        category: "school_choice",
      }),
    ).toBe("scholarship");
    expect(
      classifyRevenueRow({
        id: "private_scholarships",
        category: "philanthropy",
        lineItem: "Private Scholarships",
      }),
    ).toBe("scholarship");
  });
  it("classifies philanthropy rows as fundraising", () => {
    expect(
      classifyRevenueRow({
        id: "donations_fundraising",
        category: "philanthropy",
      }),
    ).toBe("fundraising");
    expect(
      classifyRevenueRow({
        id: "fundraising_events",
        category: "philanthropy",
      }),
    ).toBe("fundraising");
  });
  it("buckets other_revenue under fundraising in the private taxonomy", () => {
    expect(
      classifyRevenueRow({ id: "facility_rental", category: "other_revenue" }),
    ).toBe("fundraising");
  });
});

describe("classifyRevenueRow (charter taxonomy)", () => {
  const charter = "charter_school";
  it("classifies state per-pupil as public_per_pupil", () => {
    expect(
      classifyRevenueRow(
        { id: "state_local_perpupil", category: "public_funding" },
        charter,
      ),
    ).toBe("public_per_pupil");
  });
  it("classifies title funds as federal_title", () => {
    expect(
      classifyRevenueRow({ id: "title_i", category: "public_funding" }, charter),
    ).toBe("federal_title");
    expect(
      classifyRevenueRow(
        { id: "sped_funding", category: "public_funding" },
        charter,
      ),
    ).toBe("federal_title");
  });
  it("classifies CSP grant separately", () => {
    expect(
      classifyRevenueRow(
        { id: "csp_grant", category: "philanthropy" },
        charter,
      ),
    ).toBe("csp_grant");
  });
  it("classifies other philanthropy as other_grants", () => {
    expect(
      classifyRevenueRow(
        { id: "donations_fundraising", category: "philanthropy" },
        charter,
      ),
    ).toBe("other_grants");
  });
});

describe("computeRevenueSourceMix", () => {
  it("rolls per-row dollars into per-bucket totals + percentages (private)", () => {
    const rows = [
      {
        id: "gross_tuition",
        enabled: true,
        category: "tuition_and_fees",
        driverType: "per_student",
        amounts: [10_000, 10_000, 10_000, 10_000, 10_000],
      },
      {
        id: "esa_revenue",
        enabled: true,
        category: "school_choice",
        driverType: "per_student",
        amounts: [5_000, 5_000, 5_000, 5_000, 5_000],
      },
      {
        id: "donations_fundraising",
        enabled: true,
        category: "philanthropy",
        driverType: "annual_fixed",
        amounts: [50_000, 50_000, 50_000, 50_000, 50_000],
      },
    ];
    const result = computeRevenueSourceMix({
      rows,
      yearCount: 5,
      studentsByYear: [100, 100, 100, 100, 100],
    });
    expect(result.taxonomy).toBe("private");
    expect(result.buckets).toEqual(PRIVATE_BUCKET_ORDER);
    const y1 = result.years[0];
    // 10k * 100 = 1M tuition; 5k * 100 = 500k ESA; 50k fundraising → total 1.55M
    expect(y1.total).toBe(1_550_000);
    expect(y1.totalsByBucket.get("private_pay")).toBe(1_000_000);
    expect(y1.totalsByBucket.get("esa")).toBe(500_000);
    expect(y1.totalsByBucket.get("fundraising")).toBe(50_000);
    const sumShares = Array.from(y1.sharesByBucket.values()).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sumShares).toBeCloseTo(100, 5);
    expect(y1.sharesByBucket.get("private_pay")).toBeCloseTo(64.516, 2);
    expect(y1.sharesByBucket.get("esa")).toBeCloseTo(32.258, 2);
  });

  it("nets tuition_offsets into private_pay (no double-count of full-price seats)", () => {
    const rows = [
      {
        id: "gross_tuition",
        enabled: true,
        category: "tuition_and_fees",
        driverType: "per_student",
        amounts: [10_000, 10_000, 10_000, 10_000, 10_000],
      },
      {
        id: "scholarships_aid",
        enabled: true,
        category: "tuition_offsets",
        driverType: "percent_of_base",
        percentBase: "gross_tuition",
        amounts: [20, 20, 20, 20, 20],
      },
    ];
    const result = computeRevenueSourceMix({
      rows,
      yearCount: 5,
      studentsByYear: [100, 100, 100, 100, 100],
    });
    const y1 = result.years[0];
    // 1M gross - 200k offset = 800k net into private_pay
    expect(y1.totalsByBucket.get("private_pay")).toBe(800_000);
    expect(y1.total).toBe(800_000);
    expect(y1.sharesByBucket.get("private_pay")).toBeCloseTo(100, 5);
  });

  it("uses charter taxonomy when schoolType=charter_school", () => {
    const rows = [
      {
        id: "state_local_perpupil",
        enabled: true,
        category: "public_funding",
        driverType: "per_student",
        amounts: [9_000, 9_000, 9_000, 9_000, 9_000],
      },
      {
        id: "title_i",
        enabled: true,
        category: "public_funding",
        driverType: "per_student",
        amounts: [800, 800, 800, 800, 800],
      },
      {
        id: "csp_grant",
        enabled: true,
        category: "philanthropy",
        driverType: "annual_fixed",
        amounts: [250_000, 0, 0, 0, 0],
      },
    ];
    const result = computeRevenueSourceMix({
      rows,
      yearCount: 5,
      studentsByYear: [200, 200, 200, 200, 200],
      schoolType: "charter_school",
    });
    expect(result.taxonomy).toBe("charter");
    expect(result.buckets).toEqual(CHARTER_BUCKET_ORDER);
    const y1 = result.years[0];
    expect(y1.totalsByBucket.get("public_per_pupil")).toBe(1_800_000);
    expect(y1.totalsByBucket.get("federal_title")).toBe(160_000);
    expect(y1.totalsByBucket.get("csp_grant")).toBe(250_000);
  });

  it("tracks restricted philanthropy separately within the fundraising bucket", () => {
    const rows = [
      {
        id: "gross_tuition",
        enabled: true,
        category: "tuition_and_fees",
        driverType: "per_student",
        amounts: [10_000, 10_000, 10_000, 10_000, 10_000],
      },
      {
        id: "donations_fundraising",
        enabled: true,
        category: "philanthropy",
        driverType: "annual_fixed",
        amounts: [40_000, 40_000, 40_000, 40_000, 40_000],
      },
      {
        id: "restricted_capital",
        enabled: true,
        category: "philanthropy",
        driverType: "annual_fixed",
        amounts: [60_000, 60_000, 60_000, 60_000, 60_000],
      },
      {
        id: "board_giving",
        enabled: true,
        category: "philanthropy",
        driverType: "annual_fixed",
        isRestricted: true,
        amounts: [50_000, 50_000, 50_000, 50_000, 50_000],
      },
    ];
    const result = computeRevenueSourceMix({
      rows,
      yearCount: 5,
      studentsByYear: [100, 100, 100, 100, 100],
    });
    const y1 = result.years[0];
    // 40k unrestricted + 60k restricted_capital + 50k restricted board giving
    expect(y1.totalsByBucket.get("fundraising")).toBe(150_000);
    expect(y1.restrictedByBucket.get("fundraising")).toBe(110_000);
    // No restricted dollars in any other bucket
    expect(y1.restrictedByBucket.get("private_pay")).toBe(0);
  });

  it("flags charter restricted philanthropy under other_grants", () => {
    const rows = [
      {
        id: "state_local_perpupil",
        enabled: true,
        category: "public_funding",
        driverType: "per_student",
        amounts: [9_000, 9_000, 9_000, 9_000, 9_000],
      },
      {
        id: "restricted_program",
        enabled: true,
        category: "philanthropy",
        driverType: "annual_fixed",
        amounts: [80_000, 80_000, 80_000, 80_000, 80_000],
      },
    ];
    const result = computeRevenueSourceMix({
      rows,
      yearCount: 5,
      studentsByYear: [200, 200, 200, 200, 200],
      schoolType: "charter_school",
    });
    const y1 = result.years[0];
    expect(y1.totalsByBucket.get("other_grants")).toBe(80_000);
    expect(y1.restrictedByBucket.get("other_grants")).toBe(80_000);
  });

  it("returns zero restricted dollars when no rows are restricted", () => {
    const rows = [
      {
        id: "donations_fundraising",
        enabled: true,
        category: "philanthropy",
        driverType: "annual_fixed",
        amounts: [25_000, 25_000, 25_000, 25_000, 25_000],
      },
    ];
    const result = computeRevenueSourceMix({
      rows,
      yearCount: 1,
      studentsByYear: [50],
    });
    expect(result.years[0].totalsByBucket.get("fundraising")).toBe(25_000);
    expect(result.years[0].restrictedByBucket.get("fundraising")).toBe(0);
  });

  it("returns zero shares when total revenue is zero", () => {
    const result = computeRevenueSourceMix({
      rows: [],
      yearCount: 3,
      studentsByYear: [0, 0, 0],
    });
    expect(result.years).toHaveLength(3);
    for (const y of result.years) {
      expect(y.total).toBe(0);
      for (const v of y.sharesByBucket.values()) expect(v).toBe(0);
    }
  });
});
