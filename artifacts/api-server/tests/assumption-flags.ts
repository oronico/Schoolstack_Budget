import { detectUnusualAssumptions, type AssumptionFlag } from "../src/lib/assumption-flags.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
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
