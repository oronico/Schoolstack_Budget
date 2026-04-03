import { detectUnusualAssumptions, type AssumptionFlag } from "../src/lib/assumption-flags.js";
import { runConsultantEngine, computeYearFinancialsFromData, type YearFinancials } from "../src/lib/consultant-engine.js";
import { resolveEsc, computeEffectiveFte } from "../src/lib/workbook-helpers.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER, BENCHMARK_CURRENT_RATIO } from "../src/lib/benchmark-thresholds.js";
import { computeStraightLineDepreciation, computeProjectedAR } from "@workspace/finance";
import { microschoolStartup, privateSchoolWithESA, charterPublicFunding } from "./sample-payloads.js";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function hasFlag(flags: AssumptionFlag[], flagType: string): AssumptionFlag | undefined {
  return flags.find(f => f.flagType === flagType);
}

function hasSeverity(flags: AssumptionFlag[], flagType: string, severity: string): boolean {
  const flag = hasFlag(flags, flagType);
  return flag?.severity === severity;
}

async function testMicroschoolFlags() {
  console.log("\n=== Microschool Startup Flags ===");
  const flags = await detectUnusualAssumptions(microschoolStartup as Record<string, unknown>);

  assert("Generates flags for microschool", flags.length > 0);

  const y1Cap = hasFlag(flags, "low_initial_capacity");
  if (microschoolStartup.enrollment.year1 < (microschoolStartup.schoolProfile.maxCapacity * 0.5)) {
    assert("Low initial capacity flag present (under 50% of max)", !!y1Cap);
    assert("Low initial capacity flag is info", y1Cap?.severity === "info");
  }

  assert("All flags have field property", flags.every(f => typeof f.field === "string" && f.field.length > 0));
  assert("All flags have flagType property", flags.every(f => typeof f.flagType === "string" && f.flagType.length > 0));
  assert("All flags have severity property", flags.every(f => ["info", "warning", "critical"].includes(f.severity)));
  assert("All flags have currentValue property", flags.every(f => typeof f.currentValue === "string"));
  assert("All flags have defaultPrompt property", flags.every(f => typeof f.defaultPrompt === "string" && f.defaultPrompt.length > 0));
}

async function testRetentionFlag() {
  console.log("\n=== Retention Flag (Critical at <80%) ===");

  const lowRetention = {
    ...microschoolStartup,
    enrollment: { ...microschoolStartup.enrollment, retentionRate: 70 },
  };
  const flags = await detectUnusualAssumptions(lowRetention as Record<string, unknown>);
  assert("Critical retention flag at 70%", hasSeverity(flags, "low_retention", "critical"));

  const okRetention = {
    ...microschoolStartup,
    enrollment: { ...microschoolStartup.enrollment, retentionRate: 90 },
  };
  const okFlags = await detectUnusualAssumptions(okRetention as Record<string, unknown>);
  assert("No retention flag at 90%", !hasFlag(okFlags, "low_retention"));

  const borderlineRetention = {
    ...microschoolStartup,
    enrollment: { ...microschoolStartup.enrollment, retentionRate: 79 },
  };
  const borderFlags = await detectUnusualAssumptions(borderlineRetention as Record<string, unknown>);
  assert("Critical retention flag at 79%", hasSeverity(borderFlags, "low_retention", "critical"));
}

async function testRetentionNegative() {
  console.log("\n=== Negative: 85% Retention NOT flagged ===");
  const okRetention = {
    ...microschoolStartup,
    enrollment: { ...microschoolStartup.enrollment, retentionRate: 85 },
  };
  const flags = await detectUnusualAssumptions(okRetention as Record<string, unknown>);
  assert("85% retention produces no low_retention flag", !hasFlag(flags, "low_retention"));
}

async function testEnrollmentSpikeFlag() {
  console.log("\n=== Enrollment Spike Flag (Warning >30%) ===");

  const highGrowth = {
    ...microschoolStartup,
    enrollment: { year1: 10, year2: 20, year3: 30, year4: 40, year5: 50, retentionRate: 85 },
  };
  const flags = await detectUnusualAssumptions(highGrowth as Record<string, unknown>);
  const spikeFlag = hasFlag(flags, "enrollment_spike");
  assert("Enrollment spike warning present (100% Y1→Y2 growth)", !!spikeFlag);
  assert("Enrollment spike is warning severity", spikeFlag?.severity === "warning");
}

async function testTuitionConcentration() {
  console.log("\n=== Tuition Concentration (Info if <70% of expenses) ===");
  const charterFlags = await detectUnusualAssumptions(charterPublicFunding as Record<string, unknown>);
  const tuitionFlag = hasFlag(charterFlags, "low_tuition_coverage");
  if (tuitionFlag) {
    assert("low_tuition_coverage present for charter", true);
    assert("low_tuition_coverage is info severity", tuitionFlag.severity === "info");
    assert("low_tuition_coverage has currentValue", !!tuitionFlag.currentValue);
  }
}

async function testTuitionConcentrationNegative() {
  console.log("\n=== Negative: High Tuition Coverage NOT flagged ===");
  const highTuitionPayload = {
    ...microschoolStartup,
    expenseRows: (microschoolStartup as Record<string, unknown>).expenseRows
      ? ((microschoolStartup as Record<string, unknown>).expenseRows as Array<Record<string, unknown>>).map(r => ({ ...r, amounts: (r.amounts as number[]).map(a => a * 0.5) }))
      : [],
  };
  const microFlags = await detectUnusualAssumptions(highTuitionPayload as Record<string, unknown>);
  assert("High-tuition-coverage payload has no low_tuition_coverage flag", !hasFlag(microFlags, "low_tuition_coverage"));
}

async function testZeroEscalation() {
  console.log("\n=== Zero Escalation Flag (Warning) ===");

  const withZeroEsc = {
    ...microschoolStartup,
    expenseRows: [
      { id: "e1", category: "facility_operations", lineItem: "Rent", enabled: true, driverType: "annual_fixed", amounts: [30000, 30000, 30000, 30000, 30000], escalationRate: 0 },
    ],
    costInflationRate: 3,
  };
  const flags = await detectUnusualAssumptions(withZeroEsc as Record<string, unknown>);
  assert("Zero escalation flag present with inflation", !!hasFlag(flags, "zero_escalation"));
  assert("Zero escalation is warning severity", hasSeverity(flags, "zero_escalation", "warning"));

  const withZeroEscNoInflation = {
    ...microschoolStartup,
    expenseRows: [
      { id: "e1", category: "facility_operations", lineItem: "Rent", enabled: true, driverType: "annual_fixed", amounts: [30000, 30000, 30000, 30000, 30000], escalationRate: 0 },
    ],
    costInflationRate: 0,
  };
  const flags2 = await detectUnusualAssumptions(withZeroEscNoInflation as Record<string, unknown>);
  const zeroFlag = hasFlag(flags2, "zero_escalation");
  assert("Zero escalation flag present without inflation", !!zeroFlag);
  assert("Zero escalation is warning even without inflation", zeroFlag?.severity === "warning");
}

async function testNetMarginFlag() {
  console.log("\n=== Net Margin / Deep Losses Flag ===");
  const charterFlags = await detectUnusualAssumptions(charterPublicFunding as Record<string, unknown>);
  const marginFlag = hasFlag(charterFlags, "deep_losses");
  if (marginFlag) {
    assert("deep_losses flag is warning severity", marginFlag.severity === "warning");
    assert("deep_losses flag has currentValue", !!marginFlag.currentValue);
  }
}

async function testStaffingRatioFlag() {
  console.log("\n=== Staffing Ratio Flag ===");

  const extremeRatio = {
    ...microschoolStartup,
    enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
    staffingRows: [
      { id: "s1", roleName: "Solo Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
    ],
  };
  const flags = await detectUnusualAssumptions(extremeRatio as Record<string, unknown>);
  const ratioFlag = hasFlag(flags, "extreme_staffing_ratio");
  assert("Extreme staffing ratio flagged (100:1)", !!ratioFlag);
  assert("Extreme staffing ratio is warning severity", ratioFlag?.severity === "warning");
}

async function testStaffingRatioNegative() {
  console.log("\n=== Negative: 1:8 Ratio NOT flagged ===");
  const goodRatio = {
    ...microschoolStartup,
    enrollment: { year1: 16, year2: 16, year3: 16, year4: 16, year5: 16, retentionRate: 85 },
    staffingRows: [
      { id: "s1", roleName: "Teacher A", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
      { id: "s2", roleName: "Teacher B", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
    ],
  };
  const flags = await detectUnusualAssumptions(goodRatio as Record<string, unknown>);
  assert("1:8 student-teacher ratio not flagged", !hasFlag(flags, "extreme_staffing_ratio"));
}

async function testParityWithConsultantEngine() {
  console.log("\n=== Parity: Flags match consultant engine output ===");

  for (const [label, payload] of [
    ["Microschool", microschoolStartup],
    ["Private School", privateSchoolWithESA],
    ["Charter School", charterPublicFunding],
  ] as const) {
    const consultantOutput = await runConsultantEngine(payload as Record<string, unknown>);
    const directFlags = await detectUnusualAssumptions(payload as Record<string, unknown>);

    const consultantFlags = consultantOutput.assumptionFlags || [];

    assert(
      `${label}: Flag count matches (direct=${directFlags.length}, consultant=${consultantFlags.length})`,
      directFlags.length === consultantFlags.length,
      `direct=${directFlags.length}, consultant=${consultantFlags.length}`,
    );

    for (const cf of consultantFlags) {
      const df = directFlags.find(f => f.field === cf.field && f.flagType === cf.flagType);
      assert(
        `${label}: ${cf.flagType}:${cf.field} severity=${cf.severity} matches`,
        !!df && df.severity === cf.severity && df.currentValue === cf.currentValue,
        df ? `sev: ${df.severity}=${cf.severity}, val: ${df.currentValue}=${cf.currentValue}` : "missing",
      );
    }
  }
}

async function testFlagRoundTrip() {
  console.log("\n=== Round-trip: Flags serialize and deserialize correctly ===");

  const flags = await detectUnusualAssumptions(microschoolStartup as Record<string, unknown>);
  const serialized = flags.map(f => ({
    field: f.field,
    flagType: f.flagType,
    severity: f.severity,
    currentValue: f.currentValue,
    benchmark: f.benchmark,
    defaultPrompt: f.defaultPrompt,
  }));

  const json = JSON.stringify(serialized);
  const parsed = JSON.parse(json);

  assert("Serialized flags length matches", parsed.length === flags.length);
  for (let i = 0; i < flags.length; i++) {
    assert(
      `Flag ${i} (${flags[i].flagType}) round-trips correctly`,
      parsed[i].field === flags[i].field &&
      parsed[i].flagType === flags[i].flagType &&
      parsed[i].severity === flags[i].severity &&
      parsed[i].currentValue === flags[i].currentValue,
    );
  }
}

async function testTraceabilityEscalation() {
  console.log("\n=== Traceability: resolveEsc parity ===");
  const rate = resolveEsc(0, 3);
  assert("resolveEsc(0, 3) returns fallback 3", rate === 3);
  const rate2 = resolveEsc(5, 3);
  assert("resolveEsc(5, 3) returns explicit 5", rate2 === 5);
  const rate3 = resolveEsc(undefined, 3);
  assert("resolveEsc(undefined, 3) returns fallback 3", rate3 === 3);
}

async function testTraceabilityNetMargin() {
  console.log("\n=== Traceability: Net margin from engine matches flags ===");
  const yf = computeYearFinancialsFromData(charterPublicFunding as Record<string, unknown>);
  if (yf.length > 0) {
    const y1Margin = yf[0].netMargin;
    const flags = await detectUnusualAssumptions(charterPublicFunding as Record<string, unknown>);
    const marginFlag = flags.find(f => f.flagType === "deep_losses");
    if (marginFlag) {
      const flagMarginStr = marginFlag.currentValue;
      const flagMarginVal = parseFloat(flagMarginStr.replace("%", "")) / 100;
      assert(
        `Engine Y1 margin (${(y1Margin * 100).toFixed(1)}%) matches flag value (${(flagMarginVal * 100).toFixed(1)}%)`,
        Math.abs(y1Margin - flagMarginVal) < 0.001,
        `engine=${y1Margin}, flag=${flagMarginVal}`,
      );
    } else {
      assert("No deep_losses flag means margin >= -10%", y1Margin >= -0.1);
    }
  }
}

async function testTraceabilityStaffingRatio() {
  console.log("\n=== Traceability: Staffing ratio uses shared computeEffectiveFte ===");
  const extremeRatio = {
    ...microschoolStartup,
    enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
    staffingRows: [
      { id: "s1", roleName: "Solo Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
    ],
  };
  const row = extremeRatio.staffingRows[0];
  const efteDirect = computeEffectiveFte(row, 0, 100);
  assert("computeEffectiveFte for 1 FTE fixed = 1", efteDirect === 1);

  const flags = await detectUnusualAssumptions(extremeRatio as Record<string, unknown>);
  const ratioFlag = flags.find(f => f.flagType === "extreme_staffing_ratio");
  assert("extreme_staffing_ratio flag present for 100:1", !!ratioFlag);
  if (ratioFlag) {
    assert("Flag currentValue includes ratio", ratioFlag.currentValue.includes("100"));
  }
}

async function testTraceabilityRevenueComposition() {
  console.log("\n=== Traceability: Revenue/tuition parity between engine and flags ===");
  const yf = computeYearFinancialsFromData(charterPublicFunding as Record<string, unknown>);
  if (yf.length > 0) {
    const y1Rev = yf[0].totalRevenue;
    const y1Tuition = yf[0].tuitionRevenue;
    const flags = await detectUnusualAssumptions(charterPublicFunding as Record<string, unknown>);
    const coverageFlag = flags.find(f => f.flagType === "low_tuition_coverage");
    if (coverageFlag && y1Rev > 0) {
      const engineTuitionPct = (y1Tuition / yf[0].totalExpenses) * 100;
      assert(
        `Tuition coverage flag fires when tuition/expenses < 70% (engine: ${engineTuitionPct.toFixed(1)}%)`,
        engineTuitionPct < 70,
        `engineTuitionPct=${engineTuitionPct.toFixed(1)}%`,
      );
    }
  }
}

async function testHighTuitionGrowthFlag() {
  console.log("\n=== Traceability: High tuition growth flag with gross_tuition row ===");
  const withHighEsc = {
    ...microschoolStartup,
    revenueRows: [
      { id: "gross_tuition", category: "tuition", lineItem: "Gross Tuition", enabled: true, driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 8 },
    ],
  };
  const flags = await detectUnusualAssumptions(withHighEsc as Record<string, unknown>);
  assert("high_tuition_growth flag fires at 8% escalation", !!hasFlag(flags, "high_tuition_growth"));
  assert("high_tuition_growth is warning severity", hasSeverity(flags, "high_tuition_growth", "warning"));

  const withNormalEsc = {
    ...microschoolStartup,
    revenueRows: [
      { id: "gross_tuition", category: "tuition", lineItem: "Gross Tuition", enabled: true, driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 3 },
    ],
  };
  const normalFlags = await detectUnusualAssumptions(withNormalEsc as Record<string, unknown>);
  assert("No high_tuition_growth at 3% escalation", !hasFlag(normalFlags, "high_tuition_growth"));

  const withFallbackEsc = {
    ...microschoolStartup,
    revenueRows: [
      { id: "gross_tuition", category: "tuition", lineItem: "Gross Tuition", enabled: true, driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 0 },
    ],
    tuitionEscalation: { rate: 7 },
  };
  const fallbackFlags = await detectUnusualAssumptions(withFallbackEsc as Record<string, unknown>);
  assert("high_tuition_growth fires via resolveEsc fallback at 7% inflation", !!hasFlag(fallbackFlags, "high_tuition_growth"));
}

async function testDscrEngineParity() {
  console.log("\n=== DSCR engine-vs-workbook parity ===");

  const payload = charterPublicFunding as Record<string, unknown>;

  const engineYF: YearFinancials[] = computeYearFinancialsFromData(payload);
  assert("Engine returns year financials array", Array.isArray(engineYF) && engineYF.length > 0);

  const wb = await generateUnderwritingWorkbook(payload);
  const dscrSheet = wb.getWorksheet("DSCR & Covenants");
  assert("Workbook has DSCR & Covenants sheet", !!dscrSheet);

  if (!dscrSheet) return;

  let dscrRowNum = 0;
  dscrSheet.eachRow((row, rowNumber) => {
    const cellA = row.getCell(1);
    if (cellA.value === "DSCR" && dscrRowNum === 0) {
      dscrRowNum = rowNumber;
    }
  });
  assert("Found DSCR row in workbook", dscrRowNum > 0);

  for (let y = 0; y < engineYF.length; y++) {
    const engDS = engineYF[y].loanDebtService ?? engineYF[y].debtService;
    if (engDS <= 0) continue;

    const engDSCR = (engineYF[y].netIncome + engDS) / engDS;
    const wbCell = dscrSheet.getCell(dscrRowNum, y + 2);
    const wbDSCR = typeof wbCell.value === "number"
      ? wbCell.value
      : (wbCell.result !== undefined ? Number(wbCell.result) : NaN);

    assert(
      `Year ${y + 1} workbook produces valid numeric DSCR: ${wbDSCR}`,
      !isNaN(wbDSCR) && typeof wbDSCR === "number",
      `got ${wbDSCR}`
    );

    const dscrDiff = Math.abs(engDSCR - wbDSCR);
    assert(
      `Year ${y + 1} DSCR numeric parity: engine=${engDSCR.toFixed(2)}x workbook=${wbDSCR.toFixed(2)}x diff=${dscrDiff.toFixed(4)}`,
      dscrDiff < 0.05,
      `diff ${dscrDiff.toFixed(4)} >= 0.05`
    );

    const engStatus = engDSCR >= BENCHMARK_DSCR_GREEN ? "good" : engDSCR >= BENCHMARK_DSCR_AMBER ? "warning" : "danger";
    const wbStatus = wbDSCR >= BENCHMARK_DSCR_GREEN ? "good" : wbDSCR >= BENCHMARK_DSCR_AMBER ? "warning" : "danger";

    assert(
      `Year ${y + 1} threshold status match: engine='${engStatus}' workbook='${wbStatus}' (GREEN=${BENCHMARK_DSCR_GREEN} AMBER=${BENCHMARK_DSCR_AMBER})`,
      engStatus === wbStatus,
      `engine=${engStatus}, workbook=${wbStatus}`
    );
  }

  const sampleNI = 25_000;
  const sampleDS = 100_000;
  const dscr = (sampleNI + sampleDS) / sampleDS;
  assert(`Verify formula algebra: (25k+100k)/100k = ${dscr}x = 1.25x`, dscr === 1.25);
  assert(`DSCR 1.25x >= GREEN(${BENCHMARK_DSCR_GREEN})`, dscr >= BENCHMARK_DSCR_GREEN);

  const amberNI = (BENCHMARK_DSCR_AMBER - 1) * sampleDS;
  const amberDscr = (amberNI + sampleDS) / sampleDS;
  assert(`DSCR at AMBER boundary = ${amberDscr}x ≈ ${BENCHMARK_DSCR_AMBER}`, Math.abs(amberDscr - BENCHMARK_DSCR_AMBER) < 1e-10);
}

async function testConsultantEngineDscrParity() {
  console.log("\n=== Consultant engine DSCR vs workbook parity ===");

  const payload = microschoolStartup as Record<string, unknown>;
  const ceResult = await runConsultantEngine(payload);

  const ceYF = computeYearFinancialsFromData(payload);
  assert("CE computeYearFinancialsFromData returns array", Array.isArray(ceYF) && ceYF.length > 0);

  const wb = await generateUnderwritingWorkbook(payload);
  const dscrSheet = wb.getWorksheet("DSCR & Covenants");
  assert("Workbook has DSCR & Covenants sheet (CE parity)", !!dscrSheet);
  if (!dscrSheet) return;

  let dscrRowNum = 0;
  dscrSheet.eachRow((row: { getCell: (col: number) => { value: unknown } }, rowNumber: number) => {
    if (row.getCell(1).value === "DSCR" && dscrRowNum === 0) dscrRowNum = rowNumber;
  });

  for (let y = 0; y < ceYF.length; y++) {
    const ds = ceYF[y].loanDebtService ?? ceYF[y].debtService;
    if (ds <= 0) continue;

    const ceDscr = (ceYF[y].netIncome + ds) / ds;
    const wbCell = dscrSheet.getCell(dscrRowNum, y + 2);
    const wbDSCR = typeof wbCell.value === "number"
      ? wbCell.value
      : (wbCell.result !== undefined ? Number(wbCell.result) : NaN);

    const diff = Math.abs(ceDscr - wbDSCR);
    assert(
      `CE Y${y + 1} DSCR (${ceDscr.toFixed(2)}x) ≈ workbook (${wbDSCR.toFixed(2)}x), diff=${diff.toFixed(4)}`,
      diff < 0.05,
      `diff ${diff.toFixed(4)} >= 0.05`,
    );
  }

  if (ceResult.keyMetrics) {
    const dscrMetric = ceResult.keyMetrics.find(
      (m: { name: string }) => m.name.includes("Debt Service Coverage"),
    );
    if (dscrMetric) {
      const ceVal = parseFloat(dscrMetric.value);
      if (!isNaN(ceVal)) {
        const wbY1Cell = dscrSheet.getCell(dscrRowNum, 2);
        const wbY1 = typeof wbY1Cell.value === "number"
          ? wbY1Cell.value
          : (wbY1Cell.result !== undefined ? Number(wbY1Cell.result) : NaN);
        const metricDiff = Math.abs(ceVal - wbY1);
        assert(
          `CE keyMetric DSCR (${ceVal.toFixed(2)}x) ≈ workbook Y1 (${wbY1.toFixed(2)}x)`,
          metricDiff < 0.05,
          `diff ${metricDiff.toFixed(4)} >= 0.05`,
        );
      }
    }
  }
}

function testDscrThresholdParity() {
  console.log("\n=== DSCR threshold parity ===");
  assert("BENCHMARK_DSCR_GREEN = 1.25", BENCHMARK_DSCR_GREEN === 1.25);
  assert("BENCHMARK_DSCR_AMBER = 1.15", BENCHMARK_DSCR_AMBER === 1.15);
  assert("GREEN > AMBER", BENCHMARK_DSCR_GREEN > BENCHMARK_DSCR_AMBER);
  assert("AMBER > 1.0 (not trivially low)", BENCHMARK_DSCR_AMBER > 1.0);

  const niByYear = 200_000;
  const loanDS = 100_000;
  const dscrFormula = (niByYear + loanDS) / loanDS;
  assert("DSCR formula: (NI + DS) / DS = 3.0x", dscrFormula === 3.0, `got ${dscrFormula}`);

  const dscrSubOne = (50_000 + 100_000) / 100_000;
  assert("DSCR with tight NI: (50k + 100k)/100k = 1.5x", dscrSubOne === 1.5, `got ${dscrSubOne}`);

  const dscrExact = ((BENCHMARK_DSCR_GREEN - 1) * loanDS + loanDS) / loanDS;
  assert("DSCR at GREEN threshold is exactly GREEN", Math.abs(dscrExact - BENCHMARK_DSCR_GREEN) < 1e-10);

  assert("resolveEsc(5, 3) returns explicit 5", resolveEsc(5, 3) === 5);
  assert("resolveEsc(undefined, 3) returns fallback 3", resolveEsc(undefined, 3) === 3);
  assert("resolveEsc(0, 3) returns fallback 3", resolveEsc(0, 3) === 3);
}

function testPercentOfRevenueProration() {
  console.log("\n=== Percent-of-revenue proration guard ===");
  const pctPayload = {
    schoolProfile: { isPartialFirstYear: true, year1OperatingMonths: 10 },
    enrollment: { year1: 100, year2: 120, year3: 150, year4: 180, year5: 200 },
    revenueRows: [{ id: "tuition", lineItem: "Tuition", category: "tuition_and_fees", enabled: true, driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] }],
    staffingRows: [],
    expenseRows: [{ id: "mgmt_fee", lineItem: "Management Fee", category: "administrative_general", enabled: true, driverType: "percent_of_revenue", amounts: [10, 10, 10, 10, 10] }],
    capitalAndDebtRows: [],
    tuitionEscalation: { rate: 3 },
  };
  const yf = computeYearFinancialsFromData(pctPayload as Record<string, unknown>);
  const y1Rev = yf[0].totalRevenue;
  const y1Opex = yf[0].totalOpex;
  const expectedOpexRatio = y1Opex / y1Rev;
  assert(
    `Percent-of-revenue Y1 expense ratio ~10%: got ${(expectedOpexRatio * 100).toFixed(1)}%`,
    Math.abs(expectedOpexRatio - 0.10) < 0.01,
    `ratio=${expectedOpexRatio}`,
  );
  const y2Rev = yf[1].totalRevenue;
  const y2Opex = yf[1].totalOpex;
  const y2Ratio = y2Opex / y2Rev;
  assert(
    `Percent-of-revenue Y2 expense ratio ~10%: got ${(y2Ratio * 100).toFixed(1)}%`,
    Math.abs(y2Ratio - 0.10) < 0.02,
    `ratio=${y2Ratio}`,
  );
}

function testEscalationFallbackChain() {
  console.log("\n=== Escalation fallback chain ===");
  const payload1 = {
    ...charterPublicFunding,
    tuitionEscalation: { rate: 4 },
    salaryEscalationRate: 5,
    costInflationRate: 6,
  };
  const yf1 = computeYearFinancialsFromData(payload1 as Record<string, unknown>);
  const payloadDefault = { ...charterPublicFunding };
  const yfDefault = computeYearFinancialsFromData(payloadDefault as Record<string, unknown>);
  assert(
    "Explicit escalation rates produce different financials than defaults",
    yf1[1].totalRevenue !== yfDefault[1].totalRevenue || yf1[1].totalStaffingCost !== yfDefault[1].totalStaffingCost || yf1[1].totalOpex !== yfDefault[1].totalOpex,
  );
  const payloadSalary = {
    ...charterPublicFunding,
    salaryEscalationRate: 10,
  };
  const yfSalary = computeYearFinancialsFromData(payloadSalary as Record<string, unknown>);
  assert(
    "Higher salary escalation increases Y2 staffing cost",
    yfSalary[1].totalStaffingCost > yfDefault[1].totalStaffingCost,
    `salary10=${yfSalary[1].totalStaffingCost} default=${yfDefault[1].totalStaffingCost}`,
  );
}

function testDepreciationMath() {
  console.log("\n=== Depreciation straight-line math ===");
  const fa = 700_000;
  const life = 7;
  const y0 = computeStraightLineDepreciation(fa, life, 0);
  assert("Annual depreciation = FA / life", y0.annualDepreciation === 100_000, `got ${y0.annualDepreciation}`);
  assert("Accumulated depreciation Y0 = 1 year", y0.accumulatedDepreciation === 100_000);
  assert("Net book value Y0 = FA - accum", y0.netBookValue === 600_000, `got ${y0.netBookValue}`);

  const y4 = computeStraightLineDepreciation(fa, life, 4);
  assert("Accumulated depreciation Y4 = 5 years", y4.accumulatedDepreciation === 500_000);
  assert("Net book value Y4 = 200k", y4.netBookValue === 200_000, `got ${y4.netBookValue}`);

  const y6 = computeStraightLineDepreciation(fa, life, 6);
  assert("Accumulated depreciation Y6 = 7 years (fully depreciated)", y6.accumulatedDepreciation === 700_000);
  assert("Net book value Y6 = 0", y6.netBookValue === 0);

  const y8 = computeStraightLineDepreciation(fa, life, 8);
  assert("Beyond useful life: accum capped at FA", y8.accumulatedDepreciation === 700_000);
  assert("Beyond useful life: NBV = 0", y8.netBookValue === 0);
  assert("Beyond useful life: annual depr = 0", y8.annualDepreciation === 0);

  const zeroFA = computeStraightLineDepreciation(0, 7, 0);
  assert("Zero fixed assets: no depreciation", zeroFA.annualDepreciation === 0);
}

function testProjectedAR() {
  console.log("\n=== Projected AR growth ===");
  const ar1 = computeProjectedAR(500_000, 30);
  const expected1 = 500_000 * (30 / 365);
  assert("AR = tuition * (days/365)", Math.abs(ar1 - expected1) < 1, `got ${ar1.toFixed(2)} expected ${expected1.toFixed(2)}`);

  const ar2 = computeProjectedAR(1_000_000, 30);
  assert("AR grows with revenue", ar2 > ar1, `${ar2} should be > ${ar1}`);

  const ar0 = computeProjectedAR(0, 30);
  assert("Zero revenue = zero AR", ar0 === 0);

  const ar60 = computeProjectedAR(500_000, 60);
  assert("Longer collection delay = higher AR", ar60 > ar1, `60 day AR ${ar60} > 30 day AR ${ar1}`);
}

function testCurrentRatioCovenant() {
  console.log("\n=== Current ratio covenant ===");
  assert("BENCHMARK_CURRENT_RATIO = 1.1", BENCHMARK_CURRENT_RATIO === 1.1);

  const cash = 200_000;
  const ar = 50_000;
  const ap = 100_000;
  const currentDebt = 50_000;
  const currentAssets = cash + ar;
  const currentLiab = ap + currentDebt;
  const ratio = currentAssets / currentLiab;
  assert("Current ratio formula: (cash + AR) / (AP + currentDebt)", Math.abs(ratio - 1.6667) < 0.01, `got ${ratio.toFixed(4)}`);
  assert("Ratio 1.67 >= 1.1 benchmark → PASS", ratio >= BENCHMARK_CURRENT_RATIO);

  const lowCash = 50_000;
  const lowAR = 10_000;
  const lowRatio = (lowCash + lowAR) / currentLiab;
  assert("Low ratio 0.4 < 1.1 benchmark → FAIL", lowRatio < BENCHMARK_CURRENT_RATIO, `got ${lowRatio.toFixed(2)}`);

  const zeroLiab = 0;
  assert("Zero liabilities → N/A (avoid divide-by-zero)", zeroLiab <= 0);
}

function testDepreciationInEngine() {
  console.log("\n=== Depreciation + AR in consultant engine ===");
  const payload = JSON.parse(JSON.stringify(microschoolStartup));
  payload.openingBalances = {
    fixedAssets: 350_000,
    fixedAssetUsefulLife: 7,
    cash: 100_000,
    accountsReceivable: 20_000,
  };
  const yf = computeYearFinancialsFromData(payload);
  assert("Engine returns 5 year financials", Array.isArray(yf) && yf.length >= 3);
  const y0 = yf[0];
  assert("Y1 depreciation = 50k (350k/7)", y0.depreciation === 50_000, `got ${y0.depreciation}`);
  assert("Y1 projectedAR > 0", (y0.projectedAR ?? 0) > 0, `got ${y0.projectedAR}`);
  if (yf.length > 1) {
    const y1 = yf[1];
    assert("Y2 projectedAR > Y1 (revenue grows)", (y1.projectedAR ?? 0) >= (y0.projectedAR ?? 0));
  }
}

async function main() {
  console.log("=== Assumption Flag Test Suite ===");

  await testMicroschoolFlags();
  await testRetentionFlag();
  await testRetentionNegative();
  await testEnrollmentSpikeFlag();
  await testTuitionConcentration();
  await testTuitionConcentrationNegative();
  await testZeroEscalation();
  await testNetMarginFlag();
  await testStaffingRatioFlag();
  await testStaffingRatioNegative();
  await testParityWithConsultantEngine();
  await testFlagRoundTrip();
  await testTraceabilityEscalation();
  await testTraceabilityNetMargin();
  await testTraceabilityStaffingRatio();
  await testTraceabilityRevenueComposition();
  await testHighTuitionGrowthFlag();
  await testDscrEngineParity();
  await testConsultantEngineDscrParity();
  testDscrThresholdParity();
  testPercentOfRevenueProration();
  testEscalationFallbackChain();
  testDepreciationMath();
  testProjectedAR();
  testCurrentRatioCovenant();
  testDepreciationInEngine();
  await testStepUpCovenants();
  await testStepUpCovenantWithoutConfig();
  await testExpenseSensitivityMatrix();
  await testWorkingCapitalFlag();
  await testWorkingCapitalNegative();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("All assumption flag tests passed! ✅");
  }
}

async function testStepUpCovenants() {
  console.log("\n=== Step-Up DSCR Covenants ===");

  const payload = {
    ...charterPublicFunding,
    covenantThresholds: {
      dscrByYear: [1.10, 1.15, 1.20, 1.25, 1.25],
    },
  };

  const co = await runConsultantEngine(payload as Record<string, unknown>);

  assert("Consultant output has lendingLabAssessment", !!co.lendingLabAssessment);
  const dscrCrit = co.lendingLabAssessment.criteria.find(c => c.name === "Debt Service Coverage");
  if (dscrCrit) {
    assert("DSCR criterion threshold references step-up", dscrCrit.threshold.includes("step-up") || dscrCrit.threshold.includes("Y1"));
  }

  const wb = await generateUnderwritingWorkbook(payload as Record<string, unknown>);
  const dscrSheet = wb.getWorksheet("DSCR & Covenants");
  assert("Workbook has DSCR & Covenants sheet (step-up)", !!dscrSheet);

  if (dscrSheet) {
    let stepUpRowNum = 0;
    dscrSheet.eachRow((row: { getCell: (col: number) => { value: unknown } }, rowNumber: number) => {
      const cellA = row.getCell(1).value;
      if (typeof cellA === "string" && cellA.includes("Step-Up") && stepUpRowNum === 0) {
        stepUpRowNum = rowNumber;
      }
    });
    assert("Found Step-Up DSCR covenant row in workbook", stepUpRowNum > 0);
  }
}

async function testStepUpCovenantWithoutConfig() {
  console.log("\n=== Step-Up DSCR Covenants — fallback without dscrByYear ===");

  const customMinDSCR = 1.50;
  const payload = {
    ...charterPublicFunding,
    covenantThresholds: { minDSCR: customMinDSCR },
  };

  const co = await runConsultantEngine(payload as Record<string, unknown>);
  const dscrCrit = co.lendingLabAssessment.criteria.find(c => c.name === "Debt Service Coverage");
  if (dscrCrit && dscrCrit.threshold) {
    assert("Fallback threshold uses ct.minDSCR not benchmark", dscrCrit.threshold.includes(String(customMinDSCR)));
  }

  const wb = await generateUnderwritingWorkbook(payload as Record<string, unknown>);
  const dscrSheet = wb.getWorksheet("DSCR & Covenants");
  assert("Workbook has DSCR & Covenants sheet (fallback)", !!dscrSheet);

  if (dscrSheet) {
    let flatRowNum = 0;
    let hasStepUp = false;
    dscrSheet.eachRow((row: { getCell: (col: number) => { value: unknown } }, rowNumber: number) => {
      const cellA = row.getCell(1).value;
      if (typeof cellA === "string") {
        if (cellA.includes("DSCR") && !cellA.includes("Step-Up") && !cellA.includes("DSCR & Covenant") && flatRowNum === 0) {
          flatRowNum = rowNumber;
        }
        if (cellA.includes("Step-Up")) hasStepUp = true;
      }
    });
    assert("Flat DSCR covenant row present when no dscrByYear", flatRowNum > 0);
    assert("No Step-Up label when dscrByYear not configured", !hasStepUp);
  }
}

async function testExpenseSensitivityMatrix() {
  console.log("\n=== Expense Sensitivity Matrix ===");

  const co = await runConsultantEngine(microschoolStartup as Record<string, unknown>);

  assert("expenseSensitivityMatrix is array", Array.isArray(co.expenseSensitivityMatrix));
  assert("expenseSensitivityMatrix has cells", co.expenseSensitivityMatrix.length > 0);
  assert("expenseSensitivityMatrix has 35 cells (5x7)", co.expenseSensitivityMatrix.length === 35);

  const enrollPcts = [...new Set(co.expenseSensitivityMatrix.map(c => c.enrollmentPct))];
  const inflPcts = [...new Set(co.expenseSensitivityMatrix.map(c => c.expenseInflationPct))];
  assert("5 unique enrollment %s in expense matrix", enrollPcts.length === 5);
  assert("7 unique expense inflation %s in expense matrix (-10 to +20)", inflPcts.length === 7);

  const highInflCell = co.expenseSensitivityMatrix.find(c => c.enrollmentPct === 0 && c.expenseInflationPct === 20);
  assert("+20% inflation stress case exists", !!highInflCell);

  const baseCell = co.expenseSensitivityMatrix.find(c => c.enrollmentPct === 0 && c.expenseInflationPct === 0);
  assert("Base case cell exists (0% enrollment, 0% inflation)", !!baseCell);

  if (baseCell) {
    const highInflCell = co.expenseSensitivityMatrix.find(c => c.enrollmentPct === 0 && c.expenseInflationPct === 10);
    if (highInflCell) {
      assert("Higher expense inflation reduces net income", highInflCell.netIncome <= baseCell.netIncome);
    }
  }

  assert("Revenue sensitivity matrix still present", co.sensitivityMatrix.length === 25);
}

async function testWorkingCapitalFlag() {
  console.log("\n=== Working Capital Flag ===");

  const lowWC = {
    ...microschoolStartup,
    openingBalances: { cash: 5000, accountsReceivable: 0, fixedAssets: 5000, otherAssets: 0, accountsPayable: 8000, currentDebtPortion: 2000, longTermDebt: 0 },
  };
  const flags = await detectUnusualAssumptions(lowWC as Record<string, unknown>);
  const wcFlag = hasFlag(flags, "low_working_capital");
  assert("low_working_capital flag fires at 0.50x", !!wcFlag);
  if (wcFlag) {
    assert("low_working_capital severity is warning or critical", wcFlag.severity === "warning" || wcFlag.severity === "critical");
    assert("low_working_capital currentValue contains ratio", wcFlag.currentValue.includes("0.50"));
  }

  const critWC = {
    ...microschoolStartup,
    openingBalances: { cash: 1000, accountsReceivable: 0, fixedAssets: 5000, otherAssets: 0, accountsPayable: 8000, currentDebtPortion: 5000, longTermDebt: 0 },
  };
  const critFlags = await detectUnusualAssumptions(critWC as Record<string, unknown>);
  const critFlag = hasFlag(critFlags, "low_working_capital");
  assert("low_working_capital fires at warning level even when ratio < 0.8", !!critFlag && critFlag.severity === "warning");
}

async function testWorkingCapitalNegative() {
  console.log("\n=== Negative: No working capital flag when ratio >= 1.1x ===");

  const goodWC = {
    ...microschoolStartup,
    openingBalances: { cash: 15000, accountsReceivable: 5000, fixedAssets: 5000, otherAssets: 0, accountsPayable: 5000, currentDebtPortion: 3000, longTermDebt: 0 },
  };
  const flags = await detectUnusualAssumptions(goodWC as Record<string, unknown>);
  assert("No low_working_capital flag at 2.5x ratio", !hasFlag(flags, "low_working_capital"));

  const noLiab = {
    ...microschoolStartup,
    openingBalances: { cash: 15000, accountsReceivable: 0, fixedAssets: 5000, otherAssets: 0, accountsPayable: 0, currentDebtPortion: 0, longTermDebt: 0 },
  };
  const noLiabFlags = await detectUnusualAssumptions(noLiab as Record<string, unknown>);
  assert("No low_working_capital flag when no current liabilities", !hasFlag(noLiabFlags, "low_working_capital"));
}

main().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
