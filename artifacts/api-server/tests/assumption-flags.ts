import { detectUnusualAssumptions, type AssumptionFlag } from "../src/lib/assumption-flags.js";
import { runConsultantEngine, computeYearFinancialsFromData, type YearFinancials } from "../src/lib/consultant-engine.js";
import { resolveEsc, computeEffectiveFte } from "../src/lib/workbook-helpers.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "../src/lib/benchmark-thresholds.js";
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
  const microFlags = await detectUnusualAssumptions(microschoolStartup as Record<string, unknown>);
  assert("Microschool (tuition-heavy) has no low_tuition_coverage flag", !hasFlag(microFlags, "low_tuition_coverage"));
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
  const row = extremeRatio.staffingRows[0] as any;
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
    facilities: { ...(microschoolStartup as Record<string, unknown>).facilities, generalCostInflation: 7 },
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

    assert(
      `Year ${y + 1} both DSCR signs agree: engine=${engDSCR.toFixed(2)}x workbook=${wbDSCR.toFixed(2)}x`,
      (engDSCR >= 0) === (wbDSCR >= 0),
      `engine sign=${engDSCR >= 0}, workbook sign=${wbDSCR >= 0}`
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
  testDscrThresholdParity();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("All assumption flag tests passed! ✅");
  }
}

main().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
