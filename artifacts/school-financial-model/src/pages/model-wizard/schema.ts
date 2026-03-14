import { z } from "zod";

export const schoolProfileSchema = z.object({
  schoolName: z.string().min(1, "School name is required"),
  state: z.string().min(1, "State is required"),
  schoolType: z.enum(["microschool", "private_school", "charter_school", "other"]),
  openingYear: z.coerce.number().min(2000).max(2100),
  currentStudents: z.coerce.number().min(0),
  maxCapacity: z.coerce.number().min(1, "Capacity must be at least 1"),
  fiscalYearStartMonth: z.coerce.number().min(1).max(12),
  isPartialFirstYear: z.boolean(),
  year1OperatingMonths: z.coerce.number().min(1).max(12),
});

export const enrollmentSchema = z.object({
  year1: z.coerce.number().min(0, "Required"),
  year2: z.coerce.number().min(0, "Required"),
  year3: z.coerce.number().min(0, "Required"),
  year4: z.coerce.number().min(0, "Required"),
  year5: z.coerce.number().min(0, "Required"),
});

export const revenueSchema = z.object({
  tuitionPerStudent: z.coerce.number().min(0),
  annualTuitionIncrease: z.coerce.number().min(0).max(100),
  esaRevenuePerStudent: z.coerce.number().min(0),
  publicFundingPerStudent: z.coerce.number().min(0),
  otherRevenuePerStudent: z.coerce.number().min(0),
  scholarshipRate: z.coerce.number().min(0).max(100),
  annualDonations: z.coerce.number().min(0),
  foundationGrants: z.coerce.number().min(0),
  capitalGifts: z.coerce.number().min(0),
});

export const staffingSchema = z.object({
  studentsPerTeacher: z.coerce.number().min(1, "Must be at least 1"),
  teacherSalary: z.coerce.number().min(0),
  adminStaffCount: z.coerce.number().min(0),
  adminSalary: z.coerce.number().min(0),
  founderSalary: z.coerce.number().min(0),
  benefitsRate: z.coerce.number().min(0).max(100),
});

export const facilitiesSchema = z.object({
  monthlyRent: z.coerce.number().min(0),
  annualRentIncrease: z.coerce.number().min(0).max(100),
  annualUtilities: z.coerce.number().min(0),
  annualInsurance: z.coerce.number().min(0),
  facilityMaintenance: z.coerce.number().min(0),
  curriculumCostPerStudent: z.coerce.number().min(0),
  techCostPerStudent: z.coerce.number().min(0),
  annualMarketing: z.coerce.number().min(0),
  professionalDevelopment: z.coerce.number().min(0),
  foodServicePerStudent: z.coerce.number().min(0),
  transportationAnnual: z.coerce.number().min(0),
  studentServicesAnnual: z.coerce.number().min(0),
  otherAnnualExpenses: z.coerce.number().min(0),
  loanAmount: z.coerce.number().min(0),
  annualInterestRate: z.coerce.number().min(0).max(100),
  loanTermYears: z.coerce.number().min(0).max(50),
  annualSalaryIncrease: z.coerce.number().min(0).max(100),
  generalCostInflation: z.coerce.number().min(0).max(100),
});

export const fullModelSchema = z.object({
  schoolProfile: schoolProfileSchema.optional(),
  enrollment: enrollmentSchema.optional(),
  revenue: revenueSchema.optional(),
  staffing: staffingSchema.optional(),
  facilities: facilitiesSchema.optional(),
});

export type FullModelData = z.infer<typeof fullModelSchema>;
