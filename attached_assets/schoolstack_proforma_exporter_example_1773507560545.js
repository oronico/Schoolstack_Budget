const path = require('path');
const XlsxPopulate = require('xlsx-populate');

const CELL_MAP = {
  schoolName: 'D5',
  state: 'D6',
  schoolType: 'D7',
  firstOperatingYear: 'D8',
  enrollmentY1: 'D11',
  enrollmentY2: 'D12',
  enrollmentY3: 'D13',
  enrollmentY4: 'D14',
  enrollmentY5: 'D15',
  tuitionPerStudentY1: 'D18',
  tuitionGrowthPct: 'D19',
  esaPerStudentY1: 'D20',
  esaGrowthPct: 'D21',
  otherEarnedPerStudentY1: 'D22',
  otherEarnedGrowthPct: 'D23',
  collectionRatePct: 'D24',
  grantsY1: 'D25',
  grantsGrowthPct: 'D26',
  studentsPerTeacher: 'D29',
  teacherSalaryY1: 'D30',
  teacherSalaryGrowthPct: 'D31',
  adminFteY1: 'D32',
  adminFteY2: 'D33',
  adminFteY3: 'D34',
  adminFteY4: 'D35',
  adminFteY5: 'D36',
  adminSalaryY1: 'D37',
  adminSalaryGrowthPct: 'D38',
  benefitsBurdenPct: 'D39',
  annualRentY1: 'D42',
  rentGrowthPct: 'D43',
  otherFacilityCostY1: 'D44',
  otherFacilityCostGrowthPct: 'D45',
  programCostPerStudentY1: 'D46',
  programCostGrowthPct: 'D47',
  fixedOperatingCostY1: 'D48',
  fixedOperatingCostGrowthPct: 'D49',
  startingCash: 'D52',
  existingAnnualDebtService: 'D53',
  proposedLoanAmount: 'D54',
  interestRatePct: 'D55',
  termYears: 'D56',
};

function normalizePercent(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return num > 1 ? num / 100 : num;
}

function sanitizeInput(input) {
  return {
    ...input,
    tuitionGrowthPct: normalizePercent(input.tuitionGrowthPct),
    esaGrowthPct: normalizePercent(input.esaGrowthPct),
    otherEarnedGrowthPct: normalizePercent(input.otherEarnedGrowthPct),
    collectionRatePct: normalizePercent(input.collectionRatePct),
    grantsGrowthPct: normalizePercent(input.grantsGrowthPct),
    teacherSalaryGrowthPct: normalizePercent(input.teacherSalaryGrowthPct),
    adminSalaryGrowthPct: normalizePercent(input.adminSalaryGrowthPct),
    benefitsBurdenPct: normalizePercent(input.benefitsBurdenPct),
    rentGrowthPct: normalizePercent(input.rentGrowthPct),
    otherFacilityCostGrowthPct: normalizePercent(input.otherFacilityCostGrowthPct),
    programCostGrowthPct: normalizePercent(input.programCostGrowthPct),
    fixedOperatingCostGrowthPct: normalizePercent(input.fixedOperatingCostGrowthPct),
    interestRatePct: normalizePercent(input.interestRatePct),
  };
}

async function generateProFormaWorkbook(input, options = {}) {
  const data = sanitizeInput(input);
  const templatePath = options.templatePath || path.join(process.cwd(), 'templates', 'SchoolStack_Prelaunch_ProForma_Template_v1.xlsx');
  const workbook = await XlsxPopulate.fromFileAsync(templatePath);
  const assumptions = workbook.sheet('Assumptions');

  for (const [field, cell] of Object.entries(CELL_MAP)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      assumptions.cell(cell).value(data[field]);
    }
  }

  // Force recalculation when Excel opens the file
  workbook.calculationEngineEnabled(false);

  return workbook.outputAsync();
}

module.exports = {
  CELL_MAP,
  generateProFormaWorkbook,
};
