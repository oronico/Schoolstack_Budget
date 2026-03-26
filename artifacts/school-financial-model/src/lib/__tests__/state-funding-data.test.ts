import { describe, it, expect } from "vitest";
import {
  getStateFundingConfig,
  getAllStatesWithProgram,
  getCharterMethodologyStates,
  STATE_FUNDING_MAP,
} from "../state-funding-data";

describe("STATE_FUNDING_MAP", () => {
  const EXPECTED_JURISDICTIONS = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
    "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
  ];

  it("covers exactly all 50 states plus DC (51 jurisdictions)", () => {
    const mapKeys = Object.keys(STATE_FUNDING_MAP).sort();
    const expectedSorted = [...EXPECTED_JURISDICTIONS].sort();
    expect(mapKeys).toEqual(expectedSorted);
    expect(mapKeys.length).toBe(51);
  });

  it("every entry has required fields", () => {
    for (const [code, entry] of Object.entries(STATE_FUNDING_MAP)) {
      expect(entry.charterMethodology).toBeTruthy();
      expect(entry.charterMethodologyLabel).toBeTruthy();
      expect(entry.charterCoachingText).toBeTruthy();
      expect(Array.isArray(entry.programs)).toBe(true);
      expect(typeof entry.federalTaxCreditSGO).toBe("boolean");
    }
  });

  it("every program has a valid status field", () => {
    const validStatuses = ["active", "pending", "blocked", "litigated"];
    for (const [code, entry] of Object.entries(STATE_FUNDING_MAP)) {
      for (const p of entry.programs) {
        expect(validStatuses).toContain(p.status);
      }
    }
  });

  it("table-driven methodology verification for all states", () => {
    const expected: Record<string, string> = {
      AL: "single_count_period", AK: "multiple_count_dates", AZ: "multiple_count_dates",
      AR: "adm", CA: "ada", CO: "single_count_day", CT: "single_count_day",
      DE: "adm", FL: "adm", GA: "single_count_day", HI: "other",
      ID: "ada", IL: "multiple_count_periods", IN: "single_count_day",
      IA: "single_count_day", KS: "single_count_day", KY: "ada",
      LA: "multiple_count_dates", ME: "multiple_count_dates", MD: "single_count_day",
      MA: "single_count_day", MI: "multiple_count_dates", MN: "adm",
      MS: "ada", MO: "ada", MT: "multiple_count_dates", NE: "adm",
      NV: "single_count_day", NH: "single_count_day", NJ: "single_count_day",
      NM: "single_count_period", NY: "adm", NC: "adm", ND: "adm",
      OH: "multiple_count_periods", OK: "adm", OR: "adm", PA: "adm",
      RI: "adm", SC: "adm", SD: "adm", TN: "adm", TX: "ada",
      UT: "single_count_day", VT: "adm", VA: "adm", WA: "other",
      WV: "single_count_day", WI: "multiple_count_dates", WY: "single_count_period",
      DC: "adm",
    };
    for (const [code, methodology] of Object.entries(expected)) {
      expect(STATE_FUNDING_MAP[code]?.charterMethodology).toBe(methodology);
    }
  });
});

describe("getStateFundingConfig - Charter schools", () => {
  it("TX → ADA methodology", () => {
    const config = getStateFundingConfig("charter_school", "TX");
    expect(config.charterMethodology).toBe("ada");
    expect(config.enrollmentRevenueMethod).toBe("ada");
    expect(config.charterCoachingText).toContain("Average Daily Attendance");
  });

  it("CA → ADA methodology", () => {
    const config = getStateFundingConfig("charter_school", "CA");
    expect(config.charterMethodology).toBe("ada");
    expect(config.enrollmentRevenueMethod).toBe("ada");
  });

  it("FL → ADM methodology", () => {
    const config = getStateFundingConfig("charter_school", "FL");
    expect(config.charterMethodology).toBe("adm");
    expect(config.enrollmentRevenueMethod).toBe("adm");
    expect(config.charterCoachingText).toContain("Average Daily Membership");
  });

  it("NC → ADM methodology", () => {
    const config = getStateFundingConfig("charter_school", "NC");
    expect(config.enrollmentRevenueMethod).toBe("adm");
  });

  it("CO → Single Count Day → count_days method", () => {
    const config = getStateFundingConfig("charter_school", "CO");
    expect(config.charterMethodology).toBe("single_count_day");
    expect(config.enrollmentRevenueMethod).toBe("count_days");
    expect(config.charterCoachingText).toContain("single count day");
  });

  it("AZ → Multiple Count Dates → count_days method", () => {
    const config = getStateFundingConfig("charter_school", "AZ");
    expect(config.charterMethodology).toBe("multiple_count_dates");
    expect(config.enrollmentRevenueMethod).toBe("count_days");
  });

  it("AL → Single Count Period → count_days method", () => {
    const config = getStateFundingConfig("charter_school", "AL");
    expect(config.charterMethodology).toBe("single_count_period");
    expect(config.enrollmentRevenueMethod).toBe("count_days");
  });

  it("OH → Multiple Count Periods → count_days method", () => {
    const config = getStateFundingConfig("charter_school", "OH");
    expect(config.charterMethodology).toBe("multiple_count_periods");
    expect(config.enrollmentRevenueMethod).toBe("count_days");
  });

  it("WA → Other methodology → null enrollment method", () => {
    const config = getStateFundingConfig("charter_school", "WA");
    expect(config.charterMethodology).toBe("other");
    expect(config.enrollmentRevenueMethod).toBeNull();
  });

  it("charter schools get no school-choice programs", () => {
    const config = getStateFundingConfig("charter_school", "AZ");
    expect(config.availablePrograms).toHaveLength(0);
  });
});

describe("getStateFundingConfig - Private schools", () => {
  it("AZ → ESA $7K-$8K + tax-credit scholarship", () => {
    const config = getStateFundingConfig("private_school", "AZ");
    expect(config.charterMethodology).toBeNull();
    expect(config.enrollmentRevenueMethod).toBeNull();
    const esaProgram = config.availablePrograms.find(p => p.type === "esa");
    expect(esaProgram).toBeDefined();
    expect(esaProgram!.minPerStudent).toBe(7000);
    expect(esaProgram!.maxPerStudent).toBe(8000);
    const tcs = config.availablePrograms.find(p => p.type === "tax_credit_scholarship");
    expect(tcs).toBeDefined();
  });

  it("TX → ESA $10K-$10.5K for private", () => {
    const config = getStateFundingConfig("private_school", "TX");
    const esaProgram = config.availablePrograms.find(p => p.type === "esa");
    expect(esaProgram).toBeDefined();
    expect(esaProgram!.minPerStudent).toBe(10000);
    expect(esaProgram!.maxPerStudent).toBe(10474);
  });

  it("IN → universal voucher", () => {
    const config = getStateFundingConfig("private_school", "IN");
    const voucherProg = config.availablePrograms.find(p => p.type === "voucher");
    expect(voucherProg).toBeDefined();
    expect(voucherProg!.universal).toBe(true);
  });

  it("NJ → no school-choice programs", () => {
    const config = getStateFundingConfig("private_school", "NJ");
    expect(config.availablePrograms).toHaveLength(0);
    expect(config.schoolChoiceCoachingText).toContain("does not currently have");
  });

  it("IN → includes individual tax credit for private schools", () => {
    const config = getStateFundingConfig("private_school", "IN");
    const itc = config.availablePrograms.find(p => p.type === "individual_tax_credit");
    expect(itc).toBeDefined();
    expect(itc!.maxPerStudent).toBe(1000);
  });

  it("IL → includes individual tax credit for private schools", () => {
    const config = getStateFundingConfig("private_school", "IL");
    const itc = config.availablePrograms.find(p => p.type === "individual_tax_credit");
    expect(itc).toBeDefined();
    expect(itc!.maxPerStudent).toBe(250);
  });

  it("FL → ESA + voucher", () => {
    const config = getStateFundingConfig("private_school", "FL");
    expect(config.availablePrograms.some(p => p.type === "esa")).toBe(true);
    expect(config.availablePrograms.some(p => p.type === "voucher")).toBe(true);
  });

  it("federal tax credit SGO appears when opening year >= 2027", () => {
    const config2027 = getStateFundingConfig("private_school", "FL", 2027);
    expect(config2027.availablePrograms.some(p => p.type === "federal_tax_credit_sgo")).toBe(true);

    const config2026 = getStateFundingConfig("private_school", "FL", 2026);
    expect(config2026.availablePrograms.some(p => p.type === "federal_tax_credit_sgo")).toBe(false);
  });

  it("federal tax credit SGO does NOT appear for non-SGO states", () => {
    const config = getStateFundingConfig("private_school", "NJ", 2027);
    expect(config.availablePrograms.some(p => p.type === "federal_tax_credit_sgo")).toBe(false);
  });
});

describe("getStateFundingConfig - Homeschool co-ops", () => {
  it("TX → ESA at homeschool rate ($2K instead of $10K)", () => {
    const config = getStateFundingConfig("homeschool_coop", "TX");
    const esaProgram = config.availablePrograms.find(p => p.type === "esa");
    expect(esaProgram).toBeDefined();
    expect(esaProgram!.minPerStudent).toBe(2000);
    expect(esaProgram!.maxPerStudent).toBe(2000);
  });

  it("AZ → ESA at full rate ($7K-$8K) for homeschoolers", () => {
    const config = getStateFundingConfig("homeschool_coop", "AZ");
    const esaProgram = config.availablePrograms.find(p => p.type === "esa");
    expect(esaProgram).toBeDefined();
    expect(esaProgram!.minPerStudent).toBe(7000);
    expect(esaProgram!.maxPerStudent).toBe(8000);
  });

  it("AL → refundable tax credit for homeschoolers", () => {
    const config = getStateFundingConfig("homeschool_coop", "AL");
    const rtc = config.availablePrograms.find(p => p.type === "refundable_tax_credit");
    expect(rtc).toBeDefined();
    expect(rtc!.minPerStudent).toBe(1000);
    expect(rtc!.maxPerStudent).toBe(2000);
  });

  it("ID → refundable tax credit ($5K)", () => {
    const config = getStateFundingConfig("homeschool_coop", "ID");
    const rtc = config.availablePrograms.find(p => p.type === "refundable_tax_credit");
    expect(rtc).toBeDefined();
    expect(rtc!.maxPerStudent).toBe(5000);
  });

  it("OK → refundable tax credit ($5K-$7.5K)", () => {
    const config = getStateFundingConfig("homeschool_coop", "OK");
    const rtc = config.availablePrograms.find(p => p.type === "refundable_tax_credit");
    expect(rtc).toBeDefined();
    expect(rtc!.minPerStudent).toBe(5000);
    expect(rtc!.maxPerStudent).toBe(7500);
  });

  it("AK → correspondence/charter pathway", () => {
    const config = getStateFundingConfig("homeschool_coop", "AK");
    const cp = config.availablePrograms.find(p => p.type === "correspondence_charter");
    expect(cp).toBeDefined();
    expect(cp!.minPerStudent).toBe(2500);
    expect(cp!.maxPerStudent).toBe(2700);
  });

  it("homeschool co-ops do NOT get voucher programs", () => {
    const config = getStateFundingConfig("homeschool_coop", "IN");
    expect(config.availablePrograms.some(p => p.type === "voucher")).toBe(false);
  });

  it("IL → individual tax credit for homeschoolers", () => {
    const config = getStateFundingConfig("homeschool_coop", "IL");
    const itc = config.availablePrograms.find(p => p.type === "individual_tax_credit");
    expect(itc).toBeDefined();
    expect(itc!.maxPerStudent).toBe(250);
  });
});

describe("getStateFundingConfig - Microschools", () => {
  it("microschools get same programs as private schools", () => {
    const privateConfig = getStateFundingConfig("private_school", "AZ");
    const microConfig = getStateFundingConfig("microschool", "AZ");
    expect(microConfig.availablePrograms.length).toBe(privateConfig.availablePrograms.length);
    for (const pp of privateConfig.availablePrograms) {
      expect(microConfig.availablePrograms.some(p => p.type === pp.type)).toBe(true);
    }
  });

  it("microschool + IL includes individual tax credit", () => {
    const config = getStateFundingConfig("microschool", "IL");
    const itc = config.availablePrograms.find(p => p.type === "individual_tax_credit");
    expect(itc).toBeDefined();
  });
});

describe("getStateFundingConfig - Learning pods", () => {
  it("learning pods get same programs as private schools", () => {
    const privateConfig = getStateFundingConfig("private_school", "FL");
    const podConfig = getStateFundingConfig("learning_pod", "FL");
    expect(podConfig.availablePrograms.length).toBe(privateConfig.availablePrograms.length);
  });
});

describe("getStateFundingConfig - Other school type", () => {
  it("'other' school type gets no auto-configured programs", () => {
    const config = getStateFundingConfig("other", "AZ");
    expect(config.availablePrograms).toHaveLength(0);
  });

  it("'other' school type gets no SGO even with opening year >= 2027", () => {
    const config = getStateFundingConfig("other", "AZ", 2027);
    expect(config.availablePrograms).toHaveLength(0);
    expect(config.availablePrograms.some(p => p.type === "federal_tax_credit_sgo")).toBe(false);
  });
});

describe("getStateFundingConfig - unknown state", () => {
  it("returns null config for unknown state code", () => {
    const config = getStateFundingConfig("private_school", "XX");
    expect(config.charterMethodology).toBeNull();
    expect(config.availablePrograms).toHaveLength(0);
    expect(config.schoolChoiceCoachingText).toContain("don't have funding data");
  });

  it("handles lowercase state code", () => {
    const config = getStateFundingConfig("charter_school", "tx");
    expect(config.charterMethodology).toBe("ada");
  });
});

describe("getStateFundingConfig - coaching text", () => {
  it("includes programs in coaching text for private school in AZ", () => {
    const config = getStateFundingConfig("private_school", "AZ");
    expect(config.schoolChoiceCoachingText).toContain("ESA");
    expect(config.schoolChoiceCoachingText).toContain("AZ");
  });

  it("shows 'no programs' message for states without programs", () => {
    const config = getStateFundingConfig("private_school", "MA");
    expect(config.schoolChoiceCoachingText).toContain("does not currently have");
  });

  it("coaching text flags blocked programs", () => {
    const config = getStateFundingConfig("private_school", "WY");
    expect(config.schoolChoiceCoachingText).toContain("currently blocked");
  });

  it("coaching text flags litigated programs", () => {
    const config = getStateFundingConfig("private_school", "UT");
    expect(config.schoolChoiceCoachingText).toContain("legal challenge pending");
  });

  it("coaching text flags pending programs", () => {
    const config = getStateFundingConfig("private_school", "GA");
    expect(config.schoolChoiceCoachingText).toContain("not yet launched");
  });
});

describe("getAllStatesWithProgram", () => {
  it("finds ESA states", () => {
    const esaStates = getAllStatesWithProgram("esa");
    expect(esaStates).toContain("AZ");
    expect(esaStates).toContain("TX");
    expect(esaStates).toContain("FL");
    expect(esaStates).toContain("WV");
    expect(esaStates.length).toBeGreaterThanOrEqual(14);
  });

  it("finds federal tax credit SGO states via the flag", () => {
    const sgoStates = getAllStatesWithProgram("federal_tax_credit_sgo");
    expect(sgoStates).toContain("FL");
    expect(sgoStates).toContain("AZ");
    expect(sgoStates).toContain("IN");
    expect(sgoStates.length).toBeGreaterThanOrEqual(10);
  });

  it("finds voucher states", () => {
    const voucherStates = getAllStatesWithProgram("voucher");
    expect(voucherStates).toContain("IN");
    expect(voucherStates).toContain("DC");
    expect(voucherStates.length).toBeGreaterThanOrEqual(10);
  });
});

describe("getCharterMethodologyStates", () => {
  it("ADA states include TX, CA, MS, MO", () => {
    const adaStates = getCharterMethodologyStates("ada");
    expect(adaStates).toContain("TX");
    expect(adaStates).toContain("CA");
    expect(adaStates).toContain("MS");
    expect(adaStates).toContain("MO");
  });

  it("ADM states include FL, NC, AR, PA", () => {
    const admStates = getCharterMethodologyStates("adm");
    expect(admStates).toContain("FL");
    expect(admStates).toContain("NC");
    expect(admStates).toContain("AR");
    expect(admStates).toContain("PA");
  });

  it("single count day states include CO, GA, IN, MA", () => {
    const countDayStates = getCharterMethodologyStates("single_count_day");
    expect(countDayStates).toContain("CO");
    expect(countDayStates).toContain("GA");
    expect(countDayStates).toContain("IN");
    expect(countDayStates).toContain("MA");
  });
});

describe("Schema backward compatibility", () => {
  it("existing model data without new fields still parses", async () => {
    const { schoolProfileSchema } = await import("../../pages/model-wizard/schema");
    const existingData = {
      schoolName: "Test School",
      state: "TX",
      schoolType: "charter_school",
      entityType: "nonprofit_501c3",
      schoolStage: "new_school",
      maxCapacity: 100,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
    };
    const result = schoolProfileSchema.safeParse(existingData);
    expect(result.success).toBe(true);
  });

  it("new weighted enrollment fields parse correctly", async () => {
    const { schoolProfileSchema } = await import("../../pages/model-wizard/schema");
    const dataWithNewFields = {
      schoolName: "Test School",
      state: "TX",
      schoolType: "charter_school",
      entityType: "nonprofit_501c3",
      schoolStage: "new_school",
      maxCapacity: 100,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      spedCount: [10, 12, 14, 16, 18],
      ellCount: [5, 6, 7, 8, 9],
      ecoDisCount: [30, 35, 40, 45, 50],
      enrollmentGrowthRate: 5,
      schoolFteCount: 15,
      newFteCount: 3,
      stateFundingMethodology: "ada",
    };
    const result = schoolProfileSchema.safeParse(dataWithNewFields);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spedCount).toEqual([10, 12, 14, 16, 18]);
      expect(result.data.enrollmentGrowthRate).toBe(5);
      expect(result.data.stateFundingMethodology).toBe("ada");
    }
  });
});
