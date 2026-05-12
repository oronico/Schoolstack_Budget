import ExcelJS from "exceljs";

const BASE = "http://localhost:8080";
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const email = `probe-csn-${stamp}@e2e.schoolstack.test`;
const password = "PlaywrightPassword#42";

function chestertonSeedBlock() {
  return {
    planningYear: 2027, year2: 2028, year3: 2029, year4: 2030, year5: 2031,
    foundingMembersCount: 8,
    fundraisingGoals: [
      { id: "fg-1", category: "Major gifts (Year 1)", goalAmount: 250000 },
      { id: "fg-2", category: "Annual fund (Year 1)", goalAmount: 75000 },
      { id: "fg-3", category: "Events / community (Year 1)", goalAmount: 50000 },
    ],
    totalFundraisingGoal: 375000,
    monthlyOpeningCadence: [
      { id: "cad-1", month: "Jul 2026", milestone: "Found first parent rep" },
      { id: "cad-2", month: "Aug 2026", milestone: "Branding kit ready" },
    ],
    prospectiveFamilies: [
      { id: "fam-1", name: "Johnson Family", relationship: "Friend", commitment: "Soft yes" },
    ],
    prospectiveFacilities: [
      { id: "fac-1", name: "Phase I (Year 0–1)", capacity: 70,  location: "TBD" },
      { id: "fac-2", name: "Phase II (Year 2–3)", capacity: 100, location: "TBD" },
    ],
    priestlyOutreach: [{ id: "priest-1", name: "Father TBD", affiliation: "Parish Name" }],
    keyInfluencers: [{ id: "inf-1", name: "First Last", affiliation: "Role" }],
  };
}

function payload() {
  return {
    name: "Probe Chesterton Academy", currentStep: 1,
    data: {
      schoolProfile: { schoolName: "Probe Chesterton Academy", state: "VA", schoolType: "chesterton_academy", entityType: "nonprofit_501c3", schoolStage: "new_school", plannedOpeningYear: "2027", openingYear: 2027, currentStudents: 0, longTermEnrollmentGoal: 120, maxCapacity: 150, fiscalYearStartMonth: 7, isPartialFirstYear: false, year1OperatingMonths: 12, ownershipType: "rent", monthlyRent: 8000, annualRentEscalation: 3, postLeaseRenewalBump: 15, isNNNLease: false, nnnCamCharges: 0, nnnMaintenance: 0, nnnUtilities: 0, propertyTaxAnnual: 0, hasMortgage: false, mortgageMonthlyPayment: 0, estimatedMonthlyFacilityBudget: 0, accountingBasis: "accrual" },
      enrollment: { year1: 30, year2: 45, year3: 60, year4: 75, year5: 90 },
      programs: [{ id: "prog-csn-classical", name: "Classical Liberal Arts (9–12)", annualTuition: 8500, priorYear: 0, currentYear: 0, year1: 30, year2: 45, year3: 60, year4: 75, year5: 90 }],
      revenueRows: [
        { id: "rev-tuition", category: "tuition_and_fees", lineItem: "Tuition", enabled: true, driverType: "per_student", amounts: [8500, 8755, 9018, 9288, 9567] },
        { id: "rev-philanthropy", category: "philanthropy", lineItem: "Annual fund", enabled: true, driverType: "annual_fixed", amounts: [100000, 110000, 120000, 130000, 140000] },
      ],
      staffingRows: [
        { id: "staff-head", roleName: "Headmaster", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 75000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 8, payrollLike: true, notes: "", staffingMode: "fixed" },
        { id: "staff-teacher", roleName: "Lead Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 4, annualizedRate: 44000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 8, payrollLike: true, notes: "", staffingMode: "fixed" },
      ],
      expenseRows: [{ id: "exp-rent", category: "facility", lineItem: "Rent", enabled: true, driverType: "monthly", amounts: [96000, 0, 0, 0, 0] }],
      chesterton: chestertonSeedBlock(),
    },
  };
}

const reg = await fetch(`${BASE}/api/auth/register`, {
  method: "POST", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({ email, password, name: "Probe Founder" }),
});
console.log("register:", reg.status);
const { token } = await reg.json();

const create = await fetch(`${BASE}/api/models`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(payload()),
});
console.log("create:", create.status);
const { id } = await create.json();
console.log("modelId:", id);

const dl = await fetch(`${BASE}/api/models/${id}/export/chesterton-operating-manual`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log("download:", dl.status, "ct:", dl.headers.get("content-type"));
const buf = Buffer.from(await dl.arrayBuffer());
console.log("size:", buf.length);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
const sheetNames = wb.worksheets.map((w) => w.name);
console.log("sheets:", JSON.stringify(sheetNames, null, 2));
console.log("count:", sheetNames.length);
