import { describe, expect, it } from "vitest";
import { computeChestertonProjections, CHESTERTON_YEAR_COUNT } from "../projections";
import { buildDefaultChestertonData } from "../template";

describe("computeChestertonProjections", () => {
  it("produces seven year columns (Year 0 - Year 6)", () => {
    const data = buildDefaultChestertonData();
    const proj = computeChestertonProjections(data);
    expect(proj.rows).toHaveLength(CHESTERTON_YEAR_COUNT);
    expect(proj.rows.map(r => r.yearLabel)).toEqual([
      "Year 0", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
    ]);
  });

  it("Year 6 enrollment mirrors Year 5 like the Excel projections tab", () => {
    const data = buildDefaultChestertonData();
    const proj = computeChestertonProjections(data);
    expect(proj.rows[6].enrollment).toBe(proj.rows[5].enrollment);
  });

  it("Year 0 has no G&A so operating expense = faculty cost", () => {
    const data = buildDefaultChestertonData();
    const proj = computeChestertonProjections(data);
    // Year 0 enrollment is non-zero (15 freshmen); faculty cost = perPeriod * sum(periods) * sectionsNeeded
    const perPeriod = 44000 / 5;
    const totalPeriods = (data.salarySchedule ?? []).reduce((s, r) => s + (r.periodsPerSection ?? 0), 0);
    const sections = Math.max(1, Math.ceil(15 / 25));
    expect(proj.rows[0].operatingExpense).toBeCloseTo(perPeriod * totalPeriods * sections, 2);
  });

  it("fundraising gap = operating expense - net revenue", () => {
    const data = buildDefaultChestertonData();
    const proj = computeChestertonProjections(data);
    for (const r of proj.rows) {
      expect(r.fundraisingGap).toBeCloseTo(r.operatingExpense - r.netRevenue, 2);
    }
  });

  it("net revenue = gross tuition - aid + book/supply fee", () => {
    const data = buildDefaultChestertonData();
    const proj = computeChestertonProjections(data);
    // Year 1: enrollment = 15+15 = 30, tuition = 8500, aid = 10%, book = 600
    const enrollY1 = 30;
    const expected = 8500 * enrollY1 * (1 - 0.10) + 600 * enrollY1;
    expect(proj.rows[1].netRevenue).toBeCloseTo(expected, 2);
  });

  it("escalates tuition by CEILING(.,50) starting Year 2", () => {
    const data = buildDefaultChestertonData();
    const proj = computeChestertonProjections({ ...data, financialAidPct: 0, bookSupplyFee: 0 });
    // Year 2 tuition = ceil(8500 * 1.04 / 50)*50 = ceil(176.8)*50 = 177*50 = 8850
    const enrollY2 = (data.phaseEnrollment ?? []).reduce((s, r) => s + (r.year2 ?? 0), 0);
    expect(proj.rows[2].netRevenue).toBeCloseTo(8850 * enrollY2, 2);
  });

  it("returns zeros when chesterton data is undefined", () => {
    const proj = computeChestertonProjections(undefined);
    expect(proj.rows).toHaveLength(CHESTERTON_YEAR_COUNT);
    for (const r of proj.rows) {
      expect(r.enrollment).toBe(0);
      expect(r.netRevenue).toBe(0);
      expect(r.operatingExpense).toBe(0);
      expect(r.fundraisingGap).toBe(0);
    }
  });
});

describe("computeChestertonProjections matches the Excel CSN Operating Manual", () => {
  it("Year 0 - Year 6 totals exactly match the workbook's cached cell.results", async () => {
    // Sanity-parity check: import the server-side workbook builder, render
    // a workbook for the same inputs, and compare the cached results in the
    // PROJECTIONS tab against the in-app calculator. If anyone changes one
    // side without the other, this test fails loudly.
    const { generateChestertonOperatingManual } = await import(
      "../../../../../api-server/src/lib/packets/chesterton-operating-manual.js"
    );

    const data = buildDefaultChestertonData();
    const wb = await generateChestertonOperatingManual({
      schoolName: "Test School",
      chesterton: data,
    });

    const ws = wb.getWorksheet("1 - 5 YR FINANCIAL PROJECTIONS");
    if (!ws) throw new Error("Projections worksheet missing");

    function findRow(label: string): number {
      for (let r = 1; r <= ws!.rowCount; r++) {
        if (ws!.getCell(r, 1).value === label) return r;
      }
      throw new Error(`Row not found: ${label}`);
    }

    function read(r: number, c: number): number {
      const v = ws!.getCell(r, c).value;
      if (typeof v === "number") return v;
      if (v && typeof v === "object" && "result" in v) {
        const res = (v as { result?: unknown }).result;
        if (typeof res === "number") return res;
      }
      return 0;
    }

    const totalEnrollmentRow = findRow("Total Enrollment");
    const netRevenueRow = findRow("Net Tuition + Fees");
    const operatingExpenseRow = findRow("Total Operating Expense");
    const fundraisingGapRow = findRow("Fundraising Gap");

    const proj = computeChestertonProjections(data);
    for (let i = 0; i < CHESTERTON_YEAR_COUNT; i++) {
      const col = 2 + i; // B (col 2) = Year 0, ..., H (col 8) = Year 6
      expect(read(totalEnrollmentRow, col), `enrollment Y${i}`).toBeCloseTo(proj.rows[i].enrollment, 2);
      expect(read(netRevenueRow, col), `netRevenue Y${i}`).toBeCloseTo(proj.rows[i].netRevenue, 2);
      expect(read(operatingExpenseRow, col), `operatingExpense Y${i}`).toBeCloseTo(proj.rows[i].operatingExpense, 2);
      expect(read(fundraisingGapRow, col), `fundraisingGap Y${i}`).toBeCloseTo(proj.rows[i].fundraisingGap, 2);
    }
  });
});
