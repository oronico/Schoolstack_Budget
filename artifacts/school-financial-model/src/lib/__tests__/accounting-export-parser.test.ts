import { describe, expect, it } from "vitest";
import {
  parseAccountingExportCsv,
  parseAccountingExportRows,
  parseAccountingNumber,
  computeCategorySubtotalReconciliation,
} from "@workspace/finance";

describe("parseAccountingNumber", () => {
  it("parses plain numbers", () => {
    expect(parseAccountingNumber("1234")).toBe(1234);
    expect(parseAccountingNumber("0")).toBe(0);
  });
  it("strips currency symbols and thousands separators", () => {
    expect(parseAccountingNumber("$1,234.56")).toBeCloseTo(1234.56);
    expect(parseAccountingNumber(" $ 1,000,000 ")).toBe(1_000_000);
  });
  it("handles parens-wrapped negatives (accounting convention)", () => {
    expect(parseAccountingNumber("(1,234)")).toBe(-1234);
    expect(parseAccountingNumber("($500.50)")).toBeCloseTo(-500.5);
  });
  it("handles leading-dash negatives", () => {
    expect(parseAccountingNumber("-1,234")).toBe(-1234);
  });
  it("treats blanks and dash-only cells as missing", () => {
    expect(parseAccountingNumber("")).toBeUndefined();
    expect(parseAccountingNumber("   ")).toBeUndefined();
    expect(parseAccountingNumber("-")).toBeUndefined();
    expect(parseAccountingNumber("—")).toBeUndefined();
  });
  it("returns undefined for unparseable values", () => {
    expect(parseAccountingNumber("abc")).toBeUndefined();
    expect(parseAccountingNumber("1.2.3")).toBeUndefined();
  });
});

describe("parseAccountingExportCsv", () => {
  it("returns an empty result with a warning when the file is blank", () => {
    const result = parseAccountingExportCsv("");
    expect(result.totals).toEqual({});
    expect(result.recognizedRowCount).toBe(0);
    expect(result.parseWarnings).toContain("The file appears to be empty.");
  });

  it("extracts headline totals from a QuickBooks-style P&L CSV", () => {
    // Mirrors the shape of a real QuickBooks P&L export — section headers,
    // indented sub-rows, and grand totals with currency formatting. The
    // four indented sub-rows (Tuition, Donations, Salaries, Rent) feed
    // the curated category breakdown alongside the headline totals.
    const csv = [
      "Acme School,,Profit & Loss",
      "January - December 2026,,",
      ",,",
      "Income,,",
      "  Tuition,,\"$500,000.00\"",
      "  Donations,,\"$120,000.00\"",
      "Total Income,,\"$620,000.00\"",
      ",,",
      "Expenses,,",
      "  Salaries,,\"$300,000.00\"",
      "  Rent,,\"$60,000.00\"",
      "  Supplies,,\"$40,000.00\"",
      "Total Expenses,,\"$400,000.00\"",
      ",,",
      "Net Income,,\"$220,000.00\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(620_000);
    expect(result.totals.totalExpenses).toBe(400_000);
    expect(result.totals.netIncome).toBe(220_000);
    // Category breakdown is also pulled from the indented sub-rows so the
    // founder can sanity-check the headline figures against the books.
    expect(result.totals.tuitionRevenue).toBe(500_000);
    expect(result.totals.philanthropyRevenue).toBe(120_000);
    expect(result.totals.payrollExpense).toBe(300_000);
    expect(result.totals.facilityExpense).toBe(60_000);
    expect(result.parseWarnings).toEqual([]);
    // 3 headline totals + 4 category subtotals = 7 recognized rows.
    expect(result.recognizedRowCount).toBe(7);
  });

  it("derives net income when explicit row is missing but both totals are present", () => {
    const csv = [
      "Total Revenue,\"$500,000\"",
      "Total Expenses,\"$425,000\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(500_000);
    expect(result.totals.totalExpenses).toBe(425_000);
    expect(result.totals.netIncome).toBe(75_000);
  });

  it("warns when revenue or expense totals are absent", () => {
    const csv = "Some Other Row,$100\nAnother,$50";
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBeUndefined();
    expect(result.totals.totalExpenses).toBeUndefined();
    expect(result.parseWarnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Total Revenue/i),
        expect.stringMatching(/Total Expenses/i),
      ]),
    );
  });

  it("recognizes net loss reported in parentheses as a negative", () => {
    const csv = [
      "Total Income,\"$200,000\"",
      "Total Expenses,\"$240,000\"",
      "Net Income (Loss),\"($40,000)\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.netIncome).toBe(-40_000);
  });

  it("uses the right-most numeric column when multiple periods are present", () => {
    // Many P&L exports have Q1, Q2, Q3, Q4, Total columns; the period total
    // belongs in the right-most column. The parser should land on it
    // rather than picking up a quarter total by accident.
    const csv = [
      "Account,Q1,Q2,Q3,Q4,Total",
      "Total Income,150000,150000,150000,150000,600000",
      "Total Expenses,100000,100000,100000,100000,400000",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(600_000);
    expect(result.totals.totalExpenses).toBe(400_000);
  });

  it("rejects oversized files with a clear warning", () => {
    const huge = "A,1\n".repeat(300_000); // > 1 MB
    const result = parseAccountingExportCsv(huge);
    expect(result.totals).toEqual({});
    expect(result.parseWarnings[0]).toMatch(/larger than/);
  });

  it("matches alternate label phrasings (e.g. 'Total Ordinary Income')", () => {
    const csv = [
      "Total Ordinary Income,\"$300,000\"",
      "Total Ordinary Expenses,\"$250,000\"",
      "Net Ordinary Income,\"$50,000\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(300_000);
    expect(result.totals.totalExpenses).toBe(250_000);
    expect(result.totals.netIncome).toBe(50_000);
  });

  it("parses a Xero for-profit Profit & Loss export", () => {
    // Mirrors a default Xero P&L: "Operating Income" / "Less Operating
    // Expenses" sections with "Total Operating Income / Expenses" subtotal
    // rows and an "Operating Profit" or "Net Profit" summary row. The
    // sub-rows under each section feed the curated category breakdown.
    const csv = [
      "Profit and Loss,,",
      "Acme Microschool,,",
      "For the year ended 31 December 2026,,",
      ",,",
      "Operating Income,,",
      "  Tuition Income,,\"480,000.00\"",
      "  Donations Received,,\"95,000.00\"",
      "Total Operating Income,,\"575,000.00\"",
      ",,",
      "Less Operating Expenses,,",
      "  Wages and Salaries,,\"320,000.00\"",
      "  Rent,,\"55,000.00\"",
      "  Utilities,,\"12,000.00\"",
      "Total Operating Expenses,,\"387,000.00\"",
      ",,",
      "Operating Profit,,\"188,000.00\"",
      "Net Profit,,\"188,000.00\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(575_000);
    expect(result.totals.totalExpenses).toBe(387_000);
    expect(result.totals.netIncome).toBe(188_000);
    expect(result.totals.tuitionRevenue).toBe(480_000);
    expect(result.totals.philanthropyRevenue).toBe(95_000);
    expect(result.totals.payrollExpense).toBe(320_000);
    expect(result.totals.facilityExpense).toBe(55_000);
    expect(result.parseWarnings).toEqual([]);
  });

  it("parses a Xero nonprofit P&L using Surplus/(Deficit)", () => {
    // Xero's nonprofit P&L template uses "Total Operating Revenue" instead
    // of "Income" and reports the bottom line as "Surplus/(Deficit)".
    const csv = [
      "Statement of Activities,,",
      ",,",
      "Total Operating Revenue,,\"$420,000\"",
      "Total Operating Expenses,,\"$455,000\"",
      "Surplus/(Deficit),,\"($35,000)\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(420_000);
    expect(result.totals.totalExpenses).toBe(455_000);
    expect(result.totals.netIncome).toBe(-35_000);
  });

  it("parses a Wave Income Statement export", () => {
    // Mirrors Wave's CSV export: "Income" / "Expenses" sections with
    // "Total Income" / "Total Expenses" subtotal rows and a
    // "Net Profit/Loss" summary row. Wave templates often label payroll
    // simply as "Payroll" and rent as "Rent" — both feed the curated
    // category breakdown.
    const csv = [
      "Wave - Income Statement,,",
      "Tutoring Pod LLC,,",
      "Jan 1 2026 - Dec 31 2026,,",
      ",,",
      "Income,,",
      "  Tuition Fees,,\"$210,000.00\"",
      "  Donations,,\"$8,500.00\"",
      "Total Income,,\"$218,500.00\"",
      ",,",
      "Expenses,,",
      "  Payroll,,\"$140,000.00\"",
      "  Software,,\"$6,200.00\"",
      "  Rent,,\"$24,000.00\"",
      "Total Expenses,,\"$170,200.00\"",
      ",,",
      "Net Profit/Loss,,\"$48,300.00\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(218_500);
    expect(result.totals.totalExpenses).toBe(170_200);
    expect(result.totals.netIncome).toBe(48_300);
    expect(result.totals.tuitionRevenue).toBe(210_000);
    expect(result.totals.philanthropyRevenue).toBe(8_500);
    expect(result.totals.payrollExpense).toBe(140_000);
    expect(result.totals.facilityExpense).toBe(24_000);
    expect(result.parseWarnings).toEqual([]);
  });

  it("recognizes a Wave net loss reported via 'Net Profit/(Loss)'", () => {
    // Some Wave templates parenthesize the loss half of the label.
    const csv = [
      "Total Income,\"$80,000\"",
      "Total Expenses,\"$95,000\"",
      "Net Profit/(Loss),\"($15,000)\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.netIncome).toBe(-15_000);
  });
});

// --- Category subtotal extraction -------------------------------------------
//
// The parser pulls a small curated list of category subtotals (tuition,
// philanthropy, payroll, facility/rent) so the wizard summary card and the
// actuals editor can show a sanity-check breakdown alongside the headline
// totals. These tests exercise each label dialect across QuickBooks, Xero,
// and Wave so a label phrasing change in any one tool can't silently
// regress.
describe("category subtotal extraction", () => {
  it("extracts QuickBooks 'Total Tuition Income' / 'Total Donations' parent rows", () => {
    // Real-world QB charts of accounts often roll multiple tuition tiers
    // into a parent "Tuition Income" account and surface a "Total Tuition
    // Income" subtotal — the parser should land on the parent subtotal
    // instead of grabbing the first tier row by accident.
    const csv = [
      "Income,,",
      "  Tuition Income,,",
      "    K-2 Tuition,,\"180,000.00\"",
      "    3-5 Tuition,,\"220,000.00\"",
      "  Total Tuition Income,,\"400,000.00\"",
      "  Total Donations,,\"75,000.00\"",
      "Total Income,,\"475,000.00\"",
      "Expenses,,",
      "  Total Payroll,,\"260,000.00\"",
      "  Total Rent,,\"42,000.00\"",
      "Total Expenses,,\"310,000.00\"",
      "Net Income,,\"165,000.00\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.tuitionRevenue).toBe(400_000);
    expect(result.totals.philanthropyRevenue).toBe(75_000);
    expect(result.totals.payrollExpense).toBe(260_000);
    expect(result.totals.facilityExpense).toBe(42_000);
  });

  it("extracts Xero nonprofit-template categories (Contributions / Personnel / Occupancy)", () => {
    // Xero's nonprofit template uses "Contributions Received" instead of
    // "Donations" and tends to roll up payroll into "Personnel Costs"
    // and rent into "Occupancy Costs".
    const csv = [
      "Statement of Activities,,",
      "Operating Revenue,,",
      "  Tuition Income,,\"$612,000\"",
      "  Contributions Received,,\"$140,000\"",
      "Total Operating Revenue,,\"$752,000\"",
      "Less Operating Expenses,,",
      "  Personnel Costs,,\"$420,000\"",
      "  Occupancy Costs,,\"$78,000\"",
      "Total Operating Expenses,,\"$498,000\"",
      "Surplus/(Deficit),,\"$254,000\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.tuitionRevenue).toBe(612_000);
    expect(result.totals.philanthropyRevenue).toBe(140_000);
    expect(result.totals.payrollExpense).toBe(420_000);
    expect(result.totals.facilityExpense).toBe(78_000);
  });

  it("extracts Wave-style 'Tuition & Fees' / 'Payroll Expenses' / 'Rent Expense' phrasings", () => {
    // Wave templates often expand the label slightly compared to QB —
    // "Payroll Expenses" instead of bare "Payroll", "Rent Expense"
    // instead of bare "Rent", and "Tuition & Fees" with an ampersand.
    const csv = [
      "Income,,",
      "  Tuition & Fees,,\"$340,000\"",
      "  Fundraising Income,,\"$22,000\"",
      "Total Income,,\"$362,000\"",
      "Expenses,,",
      "  Payroll Expenses,,\"$215,000\"",
      "  Rent Expense,,\"$48,000\"",
      "Total Expenses,,\"$263,000\"",
      "Net Profit/Loss,,\"$99,000\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.tuitionRevenue).toBe(340_000);
    expect(result.totals.philanthropyRevenue).toBe(22_000);
    expect(result.totals.payrollExpense).toBe(215_000);
    expect(result.totals.facilityExpense).toBe(48_000);
  });

  it("normalizes parens-wrapped negative expenses to a positive magnitude", () => {
    // Some Xero templates render expense rows in parens (the accounting
    // convention for negatives). The breakdown chip and the actuals
    // editor's contributing-account list both want a positive figure so
    // the founder sees "Payroll $45,000" rather than "Payroll -$45,000".
    const csv = [
      "Total Operating Income,\"$120,000\"",
      "  Wages and Salaries,\"(45,000)\"",
      "  Rent,\"(12,000)\"",
      "Total Operating Expenses,\"(57,000)\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.payrollExpense).toBe(45_000);
    expect(result.totals.facilityExpense).toBe(12_000);
  });

  it("leaves category fields undefined when no recognized sub-row is present", () => {
    // A bare "Total Income / Total Expenses" export with no matching
    // sub-rows — we should still extract the headline totals but leave
    // every category field undefined rather than guessing.
    const csv = [
      "Total Income,\"$300,000\"",
      "Total Expenses,\"$250,000\"",
      "Net Income,\"$50,000\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(300_000);
    expect(result.totals.tuitionRevenue).toBeUndefined();
    expect(result.totals.philanthropyRevenue).toBeUndefined();
    expect(result.totals.payrollExpense).toBeUndefined();
    expect(result.totals.facilityExpense).toBeUndefined();
  });

  it("does not match per-tier tuition rows like 'Tuition - Grades K-2'", () => {
    // Catching this guards against the most common false positive: a
    // school with multiple tuition tiers shouldn't end up with the first
    // tier wrongly recorded as "the" tuition figure. The parser leaves
    // tuitionRevenue undefined here so the headline revenue still
    // surfaces but the founder isn't misled.
    const csv = [
      "Income,,",
      "  Tuition - Grades K-2,,\"$120,000\"",
      "  Tuition - Grades 3-5,,\"$180,000\"",
      "Total Income,,\"$300,000\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.totalRevenue).toBe(300_000);
    expect(result.totals.tuitionRevenue).toBeUndefined();
  });

  it("first matching sub-row wins so a parent total beats a tier when listed first", () => {
    // When the export presents "Total Tuition" before any tier rows, the
    // parser should land on the parent subtotal — first-match-wins
    // semantics match the headline-totals path.
    const csv = [
      "  Total Tuition,\"$500,000\"",
      "  Tuition,\"$200,000\"",
    ].join("\n");
    const result = parseAccountingExportCsv(csv);
    expect(result.totals.tuitionRevenue).toBe(500_000);
  });
});

describe("parseAccountingExportRows", () => {
  // The XLSX upload path in the wizard converts a workbook to a string[][]
  // grid via SheetJS and feeds it to this entry point. These tests exercise
  // that grid shape directly so we know the row-level processor stays in
  // sync with the CSV path's label aliases.
  it("extracts headline totals from a SheetJS-style grid (Xero shape)", () => {
    const rows: string[][] = [
      ["Profit and Loss"],
      ["Acme School"],
      [""],
      ["", "", ""],
      ["Total Operating Income", "", "575000"],
      ["Total Operating Expenses", "", "387000"],
      ["Net Profit", "", "188000"],
    ];
    const result = parseAccountingExportRows(rows);
    expect(result.totals.totalRevenue).toBe(575_000);
    expect(result.totals.totalExpenses).toBe(387_000);
    expect(result.totals.netIncome).toBe(188_000);
    expect(result.recognizedRowCount).toBe(3);
  });

  it("extracts totals from an Excel-shaped grid with quarterly columns", () => {
    // .xlsx exports often place each period in its own column with the
    // grand total on the right — the row processor should still land on
    // the right-most numeric cell.
    const rows: string[][] = [
      ["Account", "Q1", "Q2", "Q3", "Q4", "Total"],
      ["Total Income", "100000", "110000", "120000", "130000", "460000"],
      ["Total Expenses", "80000", "85000", "90000", "95000", "350000"],
    ];
    const result = parseAccountingExportRows(rows);
    expect(result.totals.totalRevenue).toBe(460_000);
    expect(result.totals.totalExpenses).toBe(350_000);
    // Net income should be derived since no explicit row was present.
    expect(result.totals.netIncome).toBe(110_000);
  });

  it("returns warnings when the grid has no recognized totals", () => {
    const rows: string[][] = [
      ["Some Heading", "", ""],
      ["Misc Row", "", "1000"],
    ];
    const result = parseAccountingExportRows(rows);
    expect(result.totals).toEqual({});
    expect(result.parseWarnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Total Revenue/i),
        expect.stringMatching(/Total Expenses/i),
      ]),
    );
  });
});

// --- Category subtotal reconciliation ---------------------------------------
//
// When the curated category subtotals add up to materially less than the
// headline total (under 90%), the wizard surfaces an "Other revenue /
// expense $X" chip so the founder knows their chart of accounts has
// un-mapped buckets the breakdown is missing. These tests pin the gap
// math so that warning can't silently regress.
describe("computeCategorySubtotalReconciliation", () => {
  it("flags a revenue gap when tuition + philanthropy fall short of headline revenue", () => {
    // Headline says $575k revenue but the categories we recognized
    // (tuition + donations) only total $400k — that's a 30% shortfall and
    // a clear sign the founder's books have un-mapped revenue buckets.
    const result = computeCategorySubtotalReconciliation({
      totalRevenue: 575_000,
      tuitionRevenue: 320_000,
      philanthropyRevenue: 80_000,
    });
    expect(result.revenueGap).toBe(175_000);
    expect(result.expenseGap).toBeUndefined();
  });

  it("flags an expense gap when payroll + facility fall short of headline expenses", () => {
    const result = computeCategorySubtotalReconciliation({
      totalExpenses: 500_000,
      payrollExpense: 260_000,
      facilityExpense: 50_000,
    });
    expect(result.expenseGap).toBe(190_000);
    expect(result.revenueGap).toBeUndefined();
  });

  it("does not flag a gap when categories cover at least 90% of the headline", () => {
    // 92% coverage — close enough that we don't surface the warning. The
    // small remaining gap is more likely rounding / a tiny misc account
    // than a missing bucket the founder needs to map.
    const result = computeCategorySubtotalReconciliation({
      totalRevenue: 500_000,
      tuitionRevenue: 400_000,
      philanthropyRevenue: 60_000,
      totalExpenses: 400_000,
      payrollExpense: 300_000,
      facilityExpense: 70_000,
    });
    expect(result.revenueGap).toBeUndefined();
    expect(result.expenseGap).toBeUndefined();
  });

  it("does not flag a gap when no categories were recognized on a side", () => {
    // The "no categories at all" state is handled separately by the UI
    // (we just don't render the breakdown row). We must not surface a
    // confusing "Other revenue $575k" chip that equals the entire
    // headline figure when there's no breakdown to gap-check against.
    const result = computeCategorySubtotalReconciliation({
      totalRevenue: 575_000,
      totalExpenses: 400_000,
    });
    expect(result.revenueGap).toBeUndefined();
    expect(result.expenseGap).toBeUndefined();
  });

  it("does not flag a gap when the headline total is missing", () => {
    // If we only recognized category sub-rows but never found a Total
    // Revenue row, we have nothing to reconcile against.
    const result = computeCategorySubtotalReconciliation({
      tuitionRevenue: 100_000,
      philanthropyRevenue: 20_000,
    });
    expect(result.revenueGap).toBeUndefined();
  });

  it("flags both sides independently when each has a material shortfall", () => {
    const result = computeCategorySubtotalReconciliation({
      totalRevenue: 600_000,
      tuitionRevenue: 300_000,
      totalExpenses: 500_000,
      payrollExpense: 200_000,
    });
    expect(result.revenueGap).toBe(300_000);
    expect(result.expenseGap).toBe(300_000);
  });

  it("treats a partial category recognition (only one of two) as enough to gap-check", () => {
    // The founder's books surfaced tuition but no donations row — that
    // single-category breakdown is still a real breakdown, so a 50% gap
    // against headline revenue should fire the warning.
    const result = computeCategorySubtotalReconciliation({
      totalRevenue: 400_000,
      tuitionRevenue: 200_000,
    });
    expect(result.revenueGap).toBe(200_000);
  });

  it("integrates with parseAccountingExportCsv on a real-world Xero shortfall", () => {
    // Mirrors the task example: headline revenue $575k but the curated
    // categories (tuition + donations) only sum to $400k. The reconciler
    // should land on a $175k gap when fed the parser's output directly.
    const csv = [
      "Operating Income,,",
      "  Tuition Income,,\"320,000\"",
      "  Donations Received,,\"80,000\"",
      "Total Operating Income,,\"575,000\"",
      "Less Operating Expenses,,",
      "  Wages and Salaries,,\"180,000\"",
      "  Rent,,\"40,000\"",
      "Total Operating Expenses,,\"400,000\"",
    ].join("\n");
    const parsed = parseAccountingExportCsv(csv);
    const recon = computeCategorySubtotalReconciliation(parsed.totals);
    expect(recon.revenueGap).toBe(175_000);
    expect(recon.expenseGap).toBe(180_000);
  });
});
