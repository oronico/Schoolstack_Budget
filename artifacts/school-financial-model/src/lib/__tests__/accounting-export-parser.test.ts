import { describe, expect, it } from "vitest";
import {
  parseAccountingExportCsv,
  parseAccountingExportRows,
  parseAccountingNumber,
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
    // indented sub-rows, and grand totals with currency formatting.
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
    expect(result.parseWarnings).toEqual([]);
    expect(result.recognizedRowCount).toBe(3);
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
    // rows and an "Operating Profit" or "Net Profit" summary row.
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
    // "Net Profit/Loss" summary row.
    const csv = [
      "Wave - Income Statement,,",
      "Tutoring Pod LLC,,",
      "Jan 1 2026 - Dec 31 2026,,",
      ",,",
      "Income,,",
      "  Sales,,\"$210,000.00\"",
      "  Other Income,,\"$8,500.00\"",
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
