import {
  resolveEsc,
  computeEffectiveFte,
  type RevenueRow,
  type StaffingRow,
  type ExpenseRow,
  type CapitalDebtRow,
  type TuitionTier,
  type SchoolProfile,
  type ModelData,
} from "./workbook-helpers.js";
import {
  detectFragileFunding,
  detectFundingMixInconsistencies,
  hasLegacyStackedPattern,
  CURRENT_REVENUE_MODEL_VERSION,
  HIGH_IMPACT_CONFIDENCE_KEYS,
  isEstimateWithoutEvidence,
  ASSUMPTION_REGISTRY,
  findPerPupilBenchmark,
  evaluatePerPupilRevenue,
  buildPerPupilFlagCopy,
  type AssumptionConfidenceEntry,
  type FragileProgramMatch,
  type SchoolType,
  assertEveryNextStep,
} from "@workspace/finance";

type YearFinancials = {
  year: number;
  students: number;
  totalRevenue: number;
  tuitionRevenue: number;
  publicRevenue: number;
  philanthropyRevenue: number;
  totalStaffingCost: number;
  facilityCost: number;
  totalOpex: number;
  debtService: number;
  loanDebtService?: number;
  totalExpenses: number;
  netIncome: number;
  netMargin: number;
  projectedAR?: number;
};

// Task #911 — added "positive" so the tuition-coverage signal can flip
// from an Info warning ("only 39% of expenses") to an affirmative
// callout ("tuition covers 137% of expenses") when sticker tuition +
// fees more than fund the Year-1 cost base. Existing consumers branch
// only on "critical" | "warning" (sometimes "info") and treat
// everything else as advisory, so adding a fourth value is safe —
// the lender PDF renderer prints the capitalized severity label
// ("Positive") next to the value with the default teal tone.
export type FlagSeverity = "info" | "warning" | "critical" | "positive";

export interface AssumptionFlag {
  field: string;
  flagType: string;
  currentValue: string;
  benchmark: string;
  severity: FlagSeverity;
  defaultPrompt: string;
  /**
   * Task #658 — short, concrete one-line next step the founder can take
   * right now. Required, never empty. Example:
   *   "Open Step 4: Enrollment and lower retention to 80-85% or paste
   *    your retention plan into the Story step."
   */
  nextStep: string;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
  retentionRate?: number;
}

interface Facilities {
  annualSalaryIncrease?: number;
  generalCostInflation?: number;
  [k: string]: unknown;
}

function buildEnrollmentArray(en: Enrollment, yearCount: number): number[] {
  return [
    en.year1 || 0,
    en.year2 || 0,
    en.year3 || 0,
    ...(yearCount > 3 ? [en.year4 || 0] : []),
    ...(yearCount > 4 ? [en.year5 || 0] : []),
  ];
}


function pctStr(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function buildFragilityFlag(
  m: FragileProgramMatch,
  flagType: "litigated_funding" | "pending_funding",
  severity: FlagSeverity,
): AssumptionFlag {
  // Build a status-aware sentence the founder can paste into their lender
  // narrative. We deliberately quote the program label (not just "ESA") so a
  // multi-program state (e.g. NH with both ESA and voucher entries) reads
  // correctly when the founder enables more than one fragile row.
  const statusLabel =
    m.status === "litigated"
      ? "is currently subject to legal challenge"
      : m.status === "blocked"
        ? "is currently blocked by court order"
        : "has been authorized but is not yet disbursing funds";
  const noteSuffix = m.notes ? ` (${m.notes})` : "";
  // Year-range context: show "Years 2026–2030" (or "Year 2026" for a
  // single-year span) so the founder immediately sees how many forecast
  // years lean on the fragile dollars. Falls back to a generic phrasing
  // when the helper couldn't compute a range (e.g. legacy model with no
  // openingYear / amounts).
  const yearSpan = m.yearRange
    ? m.yearRange.firstYear === m.yearRange.lastYear
      ? `Year ${m.yearRange.firstYear}`
      : `Years ${m.yearRange.firstYear}–${m.yearRange.lastYear}`
    : "the 5-year forecast";
  const benchmark =
    flagType === "litigated_funding"
      ? "Lenders expect a written backstop plan"
      : "Confirm program go-live date with the state";
  return {
    field: `revenueRows.${m.rowId}`,
    flagType,
    currentValue: `${m.stateCode} ${m.programLabel} ${statusLabel}${noteSuffix}`,
    benchmark,
    severity,
    defaultPrompt:
      flagType === "litigated_funding"
        ? `Your forecast counts on ${m.stateCode} ${m.programLabel} across ${yearSpan}, which ${statusLabel}. If the dollars stop, what's your backstop — tuition, philanthropy, or scaled-back staffing? Lenders will ask.`
        : `Your forecast counts on ${m.stateCode} ${m.programLabel} across ${yearSpan}, which ${statusLabel}. Confirm the program's expected start date and what happens to enrollment if it slips a year.`,
    nextStep:
      flagType === "litigated_funding"
        ? `Open Step 5: Revenue, lower the ${m.stateCode} ${m.programLabel} amount, and add a backstop revenue line (tuition, philanthropy) covering the same dollars.`
        : `Open Step 5: Revenue and either delay the ${m.stateCode} ${m.programLabel} line by one year, or trim Step 6: Staffing to cover the gap if funding slips.`,
  };
}

export async function detectUnusualAssumptions(rawData: Record<string, unknown>): Promise<AssumptionFlag[]> {
  const data = rawData as unknown as ModelData;
  const flags: AssumptionFlag[] = [];
  const sp = (data.schoolProfile || {}) as SchoolProfile;
  const en = (data.enrollment || {}) as Enrollment;
  const facilities = (data.facilities || {}) as Facilities;

  const hasRowData = !!(
    (data.revenueRows && data.revenueRows.length > 0) ||
    (data.staffingRows && data.staffingRows.length > 0) ||
    (data.expenseRows && data.expenseRows.length > 0)
  );
  let yearFinancials: YearFinancials[] = [];

  const yearCount = hasRowData
    ? (data.revenueRows?.[0]?.amounts?.length || data.expenseRows?.[0]?.amounts?.length || (sp.schoolStage === "operating_school" ? 5 : 3))
    : 5;

  const enrollmentByYear = buildEnrollmentArray(en, yearCount);
  const retentionRate = en.retentionRate ?? 85;
  const sharedRate = data.tuitionEscalation?.rate ?? 3;
  const costInflationPct = (data as Record<string, unknown>).costInflationRate as number ?? sharedRate;

  // --- ENROLLMENT-CENTRIC FLAGS (highest priority) ---

  if (retentionRate < 80) {
    flags.push({
      field: "enrollment.retentionRate",
      flagType: "low_retention",
      currentValue: `${retentionRate}%`,
      benchmark: "80%+",
      severity: "critical",
      defaultPrompt: `Your retention rate is ${retentionRate}%. High attrition is the #1 killer of school financial models. What specific strategies will you use to keep families year over year?`,
      nextStep: "Open Step 4: Enrollment and either raise retention to 80%+ or paste your family-retention plan into Step 1: Story.",
    });
  }

  for (let y = 1; y < enrollmentByYear.length; y++) {
    const prev = enrollmentByYear[y - 1];
    if (prev > 0) {
      const growthRate = (enrollmentByYear[y] - prev) / prev;
      if (growthRate > 0.30) {
        flags.push({
          field: `enrollment.year${y + 1}`,
          flagType: "enrollment_spike",
          currentValue: `${(growthRate * 100).toFixed(0)}% growth (Year ${y} → ${y + 1})`,
          benchmark: "≤ 30% year-over-year",
          severity: "warning",
          defaultPrompt: `You're projecting ${(growthRate * 100).toFixed(0)}% enrollment growth from Year ${y} to Year ${y + 1}. What's driving this — a new grade level, second location, or marketing push? Lenders will want specifics.`,
          nextStep: "Open Step 4: Enrollment and either soften the steepest year to a 15-25% jump or document the new grade, second site, or marketing push driving the growth in Step 1: Story.",
        });
        break;
      }
    }
  }

  const maxCapacity = sp.maxCapacity || 0;
  if (maxCapacity > 0 && enrollmentByYear[0] > 0 && enrollmentByYear[0] < maxCapacity * 0.5) {
    flags.push({
      field: "enrollment.year1",
      flagType: "low_initial_capacity",
      currentValue: `${enrollmentByYear[0]} students (${((enrollmentByYear[0] / maxCapacity) * 100).toFixed(0)}% of ${maxCapacity} capacity)`,
      benchmark: "≥ 50% of building capacity",
      severity: "info",
      defaultPrompt: `Year 1 enrollment fills only ${((enrollmentByYear[0] / maxCapacity) * 100).toFixed(0)}% of your building capacity. Is this a phased growth strategy, or could you open with more students?`,
      nextStep: "Open Step 4: Enrollment and either grow Year 1 to fill at least 50% of capacity, or note the phased-growth strategy in Step 1: Story.",
    });
  }

  if (enrollmentByYear.length > 2 && enrollmentByYear[0] > 0) {
    const decliningYears = enrollmentByYear.slice(1).filter((e, i) => e <= enrollmentByYear[i]).length;
    const totalTransitions = enrollmentByYear.length - 1;
    if (decliningYears === totalTransitions) {
      flags.push({
        field: "enrollment",
        flagType: "flat_declining_enrollment",
        currentValue: `Enrollment is flat or declining after Year 1`,
        benchmark: "Growth expected",
        severity: "warning",
        defaultPrompt: "Your enrollment doesn't grow after Year 1. Is this intentional (e.g., a single-cohort model), or did you miss entering growth targets?",
        nextStep: "Open Step 4: Enrollment and add growth across Years 2-5, or note in Step 1: Story why a single-cohort or flat enrollment is intentional.",
      });
    } else if (decliningYears > 0) {
      const declineYearIndices = enrollmentByYear.slice(1).map((e, i) => e < enrollmentByYear[i] ? i + 2 : null).filter(Boolean);
      if (declineYearIndices.length > 0) {
        flags.push({
          field: "enrollment",
          flagType: "flat_declining_enrollment",
          currentValue: `Enrollment declines in Year(s) ${declineYearIndices.join(", ")}`,
          benchmark: "Sustained growth expected",
          severity: "info",
          defaultPrompt: `Your enrollment declines in some years. Is this intentional (e.g., planned cohort exit), or does it reflect a conservative assumption?`,
          nextStep: "Open Step 4: Enrollment and add growth across Years 2-5, or note in Step 1: Story why a single-cohort or flat enrollment is intentional.",
        });
      }
    }
  }

  // --- FINANCIAL FLAGS (use engine helpers for math integrity) ---

  if (hasRowData) {
    const expenseRows = (data.expenseRows || []) as ExpenseRow[];
    for (const row of expenseRows) {
      if (!row.enabled) continue;
      if (row.escalationRate === 0) {
        const resolved = resolveEsc(row.escalationRate, costInflationPct);
        if (costInflationPct > 0 && resolved === costInflationPct) {
          flags.push({
            field: `expenseRows.${row.id}`,
            flagType: "zero_escalation",
            currentValue: `0% explicit escalation on "${row.lineItem}" (falls through to ${costInflationPct}% inflation)`,
            benchmark: `General cost inflation: ${costInflationPct}%`,
            severity: "warning",
            defaultPrompt: `You set 0% escalation on "${row.lineItem}" but your general cost inflation is ${costInflationPct}%. The system uses the inflation fallback. If you intend truly flat costs, explain why this line item won't increase with inflation.`,
            nextStep: "Open Step 7: Expenses, raise the escalation rate on this line to your general inflation rate, or note in Step 1: Story why the cost is contractually fixed.",
          });
        } else {
          flags.push({
            field: `expenseRows.${row.id}`,
            flagType: "zero_escalation",
            currentValue: `0% explicit escalation on "${row.lineItem}"`,
            benchmark: `Costs typically rise 2-4% per year`,
            severity: "warning",
            defaultPrompt: `You set 0% escalation on "${row.lineItem}". Costs typically rise with inflation. Is this line item contractually fixed, or should it increase over time?`,
            nextStep: "Open Step 7: Expenses, raise the escalation rate on this line to your general inflation rate, or note in Step 1: Story why the cost is contractually fixed.",
          });
        }
      }
    }

    const revenueRows = data.revenueRows || [];
    const grossTuition = revenueRows.find(r => r.id === "gross_tuition" && r.enabled);
    if (grossTuition) {
      const resolvedTuitionEsc = resolveEsc(grossTuition.escalationRate, costInflationPct);
      if (resolvedTuitionEsc > 5) {
        flags.push({
          field: "revenueRows.gross_tuition.escalationRate",
          flagType: "high_tuition_growth",
          currentValue: `${resolvedTuitionEsc}% annual tuition escalation`,
          benchmark: "≤ 5% per year",
          severity: "warning",
          defaultPrompt: `You're increasing tuition by ${resolvedTuitionEsc}% per year. That's aggressive — what market conditions, program enhancements, or competitive positioning justifies this?`,
          nextStep: "Open Step 5: Revenue, lower the gross tuition escalation to under 5% per year, or document the market or program enhancements supporting it in Step 1: Story.",
        });
      }
    }

    const staffingRows = data.staffingRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];
    const salaryEscRate = ((data as Record<string, unknown>).salaryEscalationRate as number ?? sharedRate) / 100;
    const isPartial = sp.isPartialFirstYear || false;
    const operatingMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
    const prorationFactor = operatingMonths / 12;

    const debtIncluded = sp.debtIncluded !== false;
    const effectiveCapDebtRows = debtIncluded
      ? capDebtRows
      : capDebtRows.filter(r => !r.isLoan);

    const { computeAllYearsFromRows } = await import("./consultant-engine");
    yearFinancials = computeAllYearsFromRows(
        enrollmentByYear,
        revenueRows as RevenueRow[],
        staffingRows as StaffingRow[],
        expenseRows as ExpenseRow[],
        effectiveCapDebtRows as CapitalDebtRow[],
        salaryEscRate,
        prorationFactor,
        (data.tuitionTiers || []) as TuitionTier[],
        costInflationPct,
        sp as SchoolProfile,
        retentionRate,
        true,
      );

    for (let y = 0; y < yearFinancials.length; y++) {
      const yf = yearFinancials[y];
      if (yf.netMargin < -0.10) {
        flags.push({
          field: `year${y + 1}.netMargin`,
          flagType: "deep_losses",
          currentValue: `${(yf.netMargin * 100).toFixed(1)}% net margin in Year ${y + 1}`,
          benchmark: "> -10%",
          severity: "warning",
          defaultPrompt: `Year ${y + 1} shows a ${(yf.netMargin * 100).toFixed(1)}% net margin — deep losses that need explanation. What's your plan to reach breakeven?`,
          nextStep: "Open Step 7: Expenses to trim cost or Step 5: Revenue to add a line, until the deepest-loss year clears -10% net margin.",
        });
        break;
      }
    }

    if (yearFinancials.length > 0) {
      // Task #926 — Per-pupil revenue benchmark validation.
      //
      // Compute Y1 revenue per student from the canonical engine
      // (totalRevenue is post-funding-mix v2, post-proration — exactly
      // what prints at `5-Year Operating Stmt!B5`). When the result
      // sits above the published ceiling for the (state, schoolType)
      // pair we emit a warning the founder can acknowledge. The
      // Liberty (AZ charter) demo at task-time produced $24,375 /
      // student — far above the $18k AZ ceiling — and the engine
      // silently passed the number through to the lender packet.
      //
      // Severity is `warning` (not `critical`): the model is still
      // exportable; we just want the lender to see the explanation
      // alongside the headline.
      const y1ForPP = yearFinancials[0];
      const y1StudentsForPP = enrollmentByYear[0] ?? 0;
      if (y1StudentsForPP > 0 && y1ForPP.totalRevenue > 0) {
        const perPupil = y1ForPP.totalRevenue / y1StudentsForPP;
        const benchmark = findPerPupilBenchmark(
          sp.state,
          sp.schoolType as SchoolType,
          sp.fundingProfile as string | undefined,
        );
        const evaluation = evaluatePerPupilRevenue(perPupil, benchmark);
        const copy = buildPerPupilFlagCopy(evaluation, {
          state: sp.state,
          schoolType: sp.schoolType as SchoolType,
        });
        if (copy) {
          flags.push({
            field: copy.field,
            flagType: copy.flagType,
            currentValue: copy.currentValue,
            benchmark: copy.benchmark,
            severity: copy.severity,
            defaultPrompt: copy.defaultPrompt,
            nextStep: copy.nextStep,
          });
        }
      }

      const y1 = yearFinancials[0];
      // Task #911 — Tuition coverage signal:
      //
      //   ratio = tuition_capacity / total_expenses
      //
      // ⚠️  GROSS BILLING BASIS, NOT NET COLLECTED  ⚠️
      //
      // This ratio is intentionally computed at SCHEDULED / STICKER
      // billings — gross tuition × enrollment + fee schedule. It does
      // NOT apply collection rate, scholarship discounts, voucher
      // offsets, billing-month proration, or the Task #860 funding-mix
      // correction.
      //
      // For Riverside (200 students, $12,500 tuition + $750 fees), the
      // three reference numbers diverge as follows:
      //   • GROSS billing capacity (this signal)  = $2,650,000
      //   • NET tuition revenue (Op Stmt)         = $2,262,500
      //       — gross minus 12% scholarship pool
      //   • Engine y1.tuitionRevenue (pre-fix)    =   $641,000
      //       — net minus voucher offset (Task #860 funding-mix)
      //
      // We deliberately picked the GROSS basis because the question
      // this signal answers is "does the school's posted price sheet
      // cover the cost base?" — a pricing-defense / business-model
      // question lenders ask at underwriting — NOT "what cash will
      // the school actually collect?" Using NET here would conflate
      // two distinct stories (your pricing covers costs vs your
      // collections cover costs) and would penalize generous-aid
      // schools whose sticker IS strong but whose realized revenue
      // looks weak after discounts. Gross is the right anchor for
      // the headline; NET belongs in a separate companion signal.
      //
      // The realized-cash reconciliation (gross → discounts →
      // collected) is the job of Task #911 sub-bullet 2.5
      // ("Net-collected tuition coverage and reconciliation to
      // gross"). When 2.5 lands, this flag will gain a sibling that
      // reports the NET coverage so the lender packet shows both
      // numbers side-by-side. ⚠️ Task 2.5 MUST keep this gross
      // basis intact — do not "fix" this to use net; add the net
      // sibling alongside.
      //
      // where
      //   tuition_capacity = sum of enabled revenueRows whose
      //                      `category === "tuition_and_fees"` and whose
      //                      `driverType !== "percent_of_base"` (the
      //                      `percent_of_base` rows model scholarship
      //                      offsets, not collected tuition). Computed
      //                      as sticker (amounts[0]) × Y1 enrollment for
      //                      `per_student` rows and as the raw amount
      //                      for `annual_fixed` rows, with NO Task #860
      //                      funding-mix correction (voucher revenue
      //                      lives in `school_choice` rows, not here)
      //                      and NO scholarship offset deduction —
      //                      the signal answers "does sticker tuition
      //                      + registration / activity fees cover the
      //                      cost base?" not "what's the realized net
      //                      tuition after discounts and funder offsets?"
      //   total_expenses   = `yearFinancials[0].totalExpenses`, which
      //                      is the same number that prints on the
      //                      5-Year Operating Stmt sheet (column B
      //                      Total Expenses row) and on the lender
      //                      Pro-Forma workbook's Operating Statement.
      //
      // Before the fix this divided `y1.tuitionRevenue` (post-funding-
      // mix correction AND scholarship-net) by `y1.totalExpenses`, so
      // Riverside's voucher revenue (FL FES-EO) silently knocked the
      // tuition numerator from $2.26M down to ~$0.65M and the flag
      // misreported 39% coverage on a model that actually covers
      // ~137%. See demo-math-smoke.ts `[persona] tuition coverage
      // matches gross-sticker hand-calc` for the per-persona guardrail.
      const y1Students = enrollmentByYear[0] ?? 0;
      let tuitionCapacity = 0;
      for (const r of revenueRows) {
        if (!r.enabled) continue;
        if (r.category !== "tuition_and_fees") continue;
        if (r.driverType === "percent_of_base") continue;
        const amt = r.amounts?.[0] ?? 0;
        if (r.driverType === "per_student") tuitionCapacity += amt * y1Students;
        else if (r.driverType === "monthly") tuitionCapacity += amt * 12;
        else tuitionCapacity += amt; // annual_fixed / annual / etc.
      }
      if (y1.totalExpenses > 0 && tuitionCapacity > 0) {
        const ratio = tuitionCapacity / y1.totalExpenses;
        const tuitionPct = (ratio * 100).toFixed(0);
        if (ratio < 0.70) {
          flags.push({
            field: "year1.tuitionCoverage",
            flagType: "low_tuition_coverage",
            currentValue: `Tuition covers ${tuitionPct}% of Year 1 total expenses`,
            benchmark: "≥ 70%",
            severity: "info",
            defaultPrompt: `Tuition accounts for only ${tuitionPct}% of Year 1 expenses, meaning you depend on grants or donations to cover costs. What's your plan if that external funding doesn't materialize?`,
            nextStep: "Open Step 5: Revenue and grow tuition lines, or trim Step 7: Expenses, until tuition covers at least 70% of Year 1 expenses.",
          });
        } else if (ratio > 1.0) {
          flags.push({
            field: "year1.tuitionCoverage",
            flagType: "strong_tuition_coverage",
            currentValue: `Tuition covers ${tuitionPct}% of Year 1 total expenses`,
            benchmark: "≥ 100%",
            severity: "positive",
            defaultPrompt: `Sticker tuition plus registration and activity fees fund ${tuitionPct}% of your Year 1 operating cost base — a strong signal that the school can stand on tuition alone before philanthropy, vouchers, or grants. Tell the lender how you'll defend pricing and convert that capacity into collected revenue.`,
            nextStep: "Open Step 5: Revenue to confirm your collection rate and any scholarship discount, then capture your pricing-defense story in Step 1: Story so the lender packet leads with this strength.",
          });
        }
      }
    }

    const hasLoanRows = capDebtRows.some(r => r.enabled && r.isLoan && (r.loanPrincipal || 0) > 0);
    if (hasLoanRows && yearFinancials.length > 0) {
      const y1 = yearFinancials[0];
      const y1LoanDS = y1.loanDebtService ?? y1.debtService;
      if (y1LoanDS === 0) {
        flags.push({
          field: "capitalAndDebtRows",
          flagType: "no_debt_service",
          currentValue: "Loan rows present but $0 debt service computed",
          benchmark: "Debt service > $0 when loans exist",
          severity: "info",
          defaultPrompt: "You have loan rows in your model but no debt service is being calculated. Check your loan terms and rates — this might be a configuration issue.",
          nextStep: "Open Step 5: Revenue, find your capital and debt rows, and double-check the loan principal, rate, and amortization months.",
        });
      }
    }

    // Staffing ratio flag (only flag absurdly high ratios — data entry errors)
    if (enrollmentByYear[0] > 0 && staffingRows.length > 0) {
      const teacherCategories = ["instruction", "teaching", "teacher"];
      let totalTeacherFte = 0;
      for (const row of staffingRows) {
        const cat = (row.functionCategory || "").toLowerCase();
        if (teacherCategories.some(t => cat.includes(t))) {
          totalTeacherFte += computeEffectiveFte(row, 0, enrollmentByYear[0]);
        }
      }
      if (totalTeacherFte > 0) {
        const ratio = enrollmentByYear[0] / totalTeacherFte;
        if (ratio > 50) {
          flags.push({
            field: "staffingRows.teacherRatio",
            flagType: "extreme_staffing_ratio",
            currentValue: `1:${Math.round(ratio)} student-teacher ratio`,
            benchmark: "< 1:50",
            severity: "warning",
            defaultPrompt: `Your student-teacher ratio is 1:${Math.round(ratio)}, which seems unusually high. Is this correct, or might you need to add more teaching staff?`,
            nextStep: "Open Step 6: Staffing and add or correct teaching FTEs so the student-teacher ratio falls under 1:50.",
          });
        }
      }
    }
  }

  // --- WORKING CAPITAL FLAG (opening + projected) ---
  const ob = (data.openingBalances || {}) as { cash?: number; accountsReceivable?: number; accountsPayable?: number; currentDebtPortion?: number };
  const wcCash = ob.cash ?? 0;
  const wcAR = ob.accountsReceivable ?? 0;
  const wcAP = ob.accountsPayable ?? 0;
  const wcCurrentDebt = ob.currentDebtPortion ?? 0;
  const wcCurrentLiab = wcAP + wcCurrentDebt;
  if (wcCurrentLiab > 0) {
    const currentRatio = (wcCash + wcAR) / wcCurrentLiab;
    if (currentRatio < 1.1) {
      flags.push({
        field: "openingBalances.currentRatio",
        flagType: "low_working_capital",
        currentValue: `${currentRatio.toFixed(2)}x current ratio`,
        benchmark: "≥ 1.1x",
        severity: "warning",
        defaultPrompt: `Your opening current ratio is ${currentRatio.toFixed(2)}x, which is below the 1.1x minimum lenders expect. How will you ensure short-term obligations are covered? Consider increasing cash reserves or reducing short-term liabilities.`,
        nextStep: "Open Step 2: School Details and raise opening cash, or reduce opening short-term liabilities, until the current ratio clears 1.1x.",
      });
    }
  }

  // --- STATE-FUNDING FRAGILITY (Task #455) ---
  //
  // When a founder's revenue model leans on a school-choice program whose
  // legal status is unsettled (litigated / blocked / pending), surface that
  // as an assumption flag so it lands in the lender review and the
  // founder's "things to explain" list. Litigated and blocked programs are
  // warnings (the dollars could disappear mid-year); pending programs are
  // info-tier (legislatively scheduled but not yet flowing).
  const fragility = detectFragileFunding(
    (data.revenueRows || []) as Array<{ id: string; lineItem?: string; enabled?: boolean; amounts?: number[] }>,
    sp.state,
    sp.schoolType as SchoolType | undefined,
    sp.openingYear,
  );
  for (const m of fragility.litigated) {
    flags.push(buildFragilityFlag(m, "litigated_funding", "warning"));
  }
  for (const m of fragility.blocked) {
    flags.push(buildFragilityFlag(m, "litigated_funding", "warning"));
  }
  for (const m of fragility.pending) {
    flags.push(buildFragilityFlag(m, "pending_funding", "info"));
  }

  if (hasRowData && yearFinancials.length > 0) {
    let runningCash = wcCash;
    for (let y = 0; y < yearFinancials.length; y++) {
      const yf = yearFinancials[y];
      runningCash += yf.netIncome;
      const projAR = yf.projectedAR != null ? yf.projectedAR : wcAR;
      const projCurrentAssets = Math.max(0, runningCash) + projAR;
      const projCurrentLiab = wcAP + wcCurrentDebt;
      if (projCurrentLiab > 0) {
        const projRatio = projCurrentAssets / projCurrentLiab;
        if (projRatio < 1.1 && !flags.some(f => f.flagType === "low_working_capital")) {
          flags.push({
            field: `year${y + 1}.workingCapital`,
            flagType: "low_working_capital",
            currentValue: `${projRatio.toFixed(2)}x projected current ratio before Year ${y + 1}`,
            benchmark: "≥ 1.1x",
            severity: "warning",
            defaultPrompt: `Your projected current ratio drops to ${projRatio.toFixed(2)}x before Year ${y + 1}, which is below the 1.1x minimum. Build cash reserves earlier or reduce short-term liabilities to avoid liquidity stress.`,
            nextStep: "Open Step 2: School Details and raise opening cash, or reduce opening short-term liabilities, until the current ratio clears 1.1x.",
          });
          break;
        }
      }
    }
  }

  // Task #659 — Assumptions Confidence layer: emit a coach-tone flag when
  // a high-impact assumption (tuition_per_student, enrollment_y1,
  // enrollment_y5) is marked "estimate" with no evidence note. Capped to
  // the 3 strategic keys so the founder isn't drowned in nudges.
  const assumptionConfidence = (data as Record<string, unknown>).assumptionConfidence as
    | Record<string, AssumptionConfidenceEntry>
    | undefined;
  if (assumptionConfidence) {
    for (const key of HIGH_IMPACT_CONFIDENCE_KEYS) {
      const entry = assumptionConfidence[key];
      if (!isEstimateWithoutEvidence(entry)) continue;
      const meta = ASSUMPTION_REGISTRY[key];
      flags.push({
        field: `assumptionConfidence.${key}`,
        flagType: "estimate_without_evidence",
        currentValue: `${meta.label} marked as estimate with no evidence note`,
        benchmark: "Quote, signed agreement, research, or actuals",
        severity: "warning",
        defaultPrompt: `Your ${meta.label.toLowerCase()} is one of the biggest swing factors in the model. Drop in the source you're leaning on — a peer-school benchmark, a draft tuition schedule, or last year's roster — so a reviewer can see the reasoning, not just the number.`,
        nextStep: `Open Step ${meta.defaultStepNumber}: ${meta.stepTitle}, raise the confidence above estimate, or add a short evidence note (peer benchmark, prior-year roster, draft tuition schedule) to anchor the number.`,
      });
    }
  }

  // Task #860 — Funding-mix inconsistency. The detector scans only
  // `school_choice` per-student rows (ESA, voucher, tax-credit
  // scholarships funded by school-choice programs). When their sum
  // exceeds the *net* per-student tuition (sticker price after tuition
  // tier discounts), the founder has either understated tuition or
  // stacked funding sources that can't actually co-fund the same seat.
  // The engine caps combined tuition + choice revenue at the net seat
  // basis so the model stays defensible, but the founder must
  // reconcile the inputs before exporting a Lender / Board packet.
  // Tuition_offsets / privately funded scholarship rows are NOT in this
  // detector's scope — they're treated as discounts elsewhere.
  const revRows = (data.revenueRows || []) as RevenueRow[];
  if (revRows.length > 0) {
    const mismatches = detectFundingMixInconsistencies(
      revRows as unknown as Parameters<typeof detectFundingMixInconsistencies>[0],
      yearCount,
      enrollmentByYear,
      (data.tuitionTiers || []) as unknown as Parameters<typeof detectFundingMixInconsistencies>[3],
    );
    if (mismatches.length > 0) {
      const first = mismatches[0];
      const yearLabel = `Year ${first.yearIdx + 1}`;
      const seat = `$${Math.round(first.seatPerStudent).toLocaleString()}`;
      const funding = `$${Math.round(first.fundingPerStudent).toLocaleString()}`;
      const excess = `$${Math.round(first.excessPerStudent).toLocaleString()}`;
      const yearList =
        mismatches.length === 1
          ? yearLabel
          : `${mismatches.length} years (starting ${yearLabel})`;
      flags.push({
        field: "revenueRows.gross_tuition",
        flagType: "funding_mix_inconsistent",
        currentValue: `${yearLabel}: net tuition ${seat}/student, school-choice (ESA + voucher + tax-credit) total ${funding}/student (over by ${excess})`,
        benchmark: "Per-student school-choice funding ≤ per-student net tuition",
        severity: "warning",
        defaultPrompt: `Tuition is the seat price. Your per-student school-choice rows (ESA / voucher / tax-credit) sum to ${funding} in ${yearLabel} — more than the ${seat} per-student tuition you actually charge. Either raise tuition to reflect the true seat cost, or lower the per-student funding amounts so each funder's row represents what that funder pays toward one seat. Until then we cap combined tuition + school-choice revenue at the net seat basis so the model stays defensible.`,
        nextStep: `Open Step 5: Revenue and reconcile ${yearList} so per-student school-choice (ESA / voucher / tax-credit) amounts sum to no more than the per-student net tuition (after tier discounts).`,
      });
    }
  }

  // Task #860 EXPANDED — Funding-mix unmigrated. Hard-block flag for
  // legacy v1 models that still carry the stacked per-student tuition +
  // per-student school_choice pattern. The engine corrects the math
  // either way, but until the founder accepts the migration we block
  // export so they can review the changelog entry showing exactly how
  // Year-1 revenue moved from "naive sum" to "engine-corrected".
  const revenueModelVersion =
    (data as { revenueModelVersion?: number }).revenueModelVersion ?? 1;
  if (
    revenueModelVersion < CURRENT_REVENUE_MODEL_VERSION &&
    revRows.length > 0 &&
    enrollmentByYear[0] > 0 &&
    hasLegacyStackedPattern(
      revRows as unknown as Parameters<typeof hasLegacyStackedPattern>[0],
      enrollmentByYear[0],
      (data.tuitionTiers || []) as unknown as Parameters<typeof hasLegacyStackedPattern>[2],
      yearCount,
    )
  ) {
    flags.push({
      field: "revenueModelVersion",
      flagType: "funding_mix_unmigrated",
      currentValue: `revenueModelVersion=${revenueModelVersion} (legacy stacked tuition + school-choice pattern detected)`,
      benchmark: `revenueModelVersion ≥ ${CURRENT_REVENUE_MODEL_VERSION}`,
      severity: "critical",
      defaultPrompt:
        "Your model still uses the legacy revenue shape where ESA / voucher / tax-credit rows are added on top of tuition for the same seat. The engine corrects this for you, but you need to open the wizard once so we can stamp the funding-mix v2 migration and show you the before/after Year-1 revenue change.",
      nextStep:
        "Open the wizard's Revenue step (Step 5). The migration runs automatically on load — review the changelog entry and save the model so the funding-mix v2 stamp persists.",
    });
  }

  // Task #686 — guardrail: every emitted AssumptionFlag must carry a
  // concrete coach-voice nextStep.
  return assertEveryNextStep(flags, "AssumptionFlag") as AssumptionFlag[];
}
