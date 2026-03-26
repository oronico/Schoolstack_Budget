export interface GuidedQuestion {
  id: string;
  question: string;
  hint?: string;
  relatedLineItems: string[];
}

export interface CategoryQuestions {
  category: string;
  intro: string;
  questions: GuidedQuestion[];
}

export const GUIDED_EXPENSE_QUESTIONS: CategoryQuestions[] = [
  {
    category: "instructional_program",
    intro: "Let's think about what it costs to actually run your program day-to-day.",
    questions: [
      {
        id: "q_curriculum",
        question: "Will you purchase a packaged curriculum or create your own materials?",
        hint: "Packaged curricula (like Amplify, Core Knowledge, or Montessori kits) typically cost $200–$500 per student. Custom materials are cheaper but take more staff time.",
        relatedLineItems: ["Curriculum & Instructional Materials"],
      },
      {
        id: "q_classroom_supplies",
        question: "What classroom supplies will students need — art supplies, science materials, manipulatives?",
        hint: "Most schools budget $75–$150 per student for consumable classroom supplies.",
        relatedLineItems: ["Classroom Supplies"],
      },
      {
        id: "q_testing",
        question: "Will your school administer standardized tests or assessments?",
        hint: "Charter schools usually must. Private schools often choose optional assessments like MAP or NWEA ($10–$30 per student).",
        relatedLineItems: ["Testing & Assessment"],
      },
      {
        id: "q_sped",
        question: "Will you serve students with special needs or IEPs?",
        hint: "Even if you don't have a full special education program, you may need contracted speech, OT, or evaluation services.",
        relatedLineItems: ["Special Education Services"],
      },
      {
        id: "q_pd",
        question: "How will you invest in teacher training and professional development?",
        hint: "Workshops, conferences, coaching. Most schools spend $1,000–$3,000 per teacher per year.",
        relatedLineItems: ["Professional Development"],
      },
      {
        id: "q_enrichment",
        question: "Will you offer enrichment programs, after-school activities, or summer programs?",
        hint: "These can be revenue-generating but also have costs — instructors, supplies, insurance.",
        relatedLineItems: ["Enrichment / After-School Programs"],
      },
      {
        id: "q_field_trips",
        question: "Will students go on field trips?",
        hint: "Budget for transportation, admission fees, and chaperone costs. Many schools set aside $50–$100 per student per year.",
        relatedLineItems: ["Classroom Supplies"],
      },
      {
        id: "q_food",
        question: "Will your school provide meals or snacks?",
        hint: "Full meal programs cost $4–$8 per student per day. Some schools participate in federal meal programs to offset costs.",
        relatedLineItems: ["Food / Meal Service"],
      },
      {
        id: "q_transportation",
        question: "Will you provide student transportation?",
        hint: "Bus contracts, van leases, or rideshare partnerships. This is often one of the largest variable costs for schools that offer it.",
        relatedLineItems: ["Student Transportation"],
      },
      {
        id: "q_uniforms",
        question: "Does your school require uniforms or provide student supplies?",
        hint: "Some schools subsidize uniforms or provide backpacks, planners, and basic supplies.",
        relatedLineItems: ["Uniforms / Student Supplies"],
      },
    ],
  },
  {
    category: "technology",
    intro: "Technology is essential for modern schools — even small ones. Let's figure out what you need.",
    questions: [
      {
        id: "q_devices",
        question: "Do you have a 1:1 device program, or will students share devices?",
        hint: "1:1 programs (every student gets a Chromebook/iPad) cost $200–$400 per device. Shared carts are cheaper but limit flexibility.",
        relatedLineItems: ["Student Devices & Hardware"],
      },
      {
        id: "q_software",
        question: "Do you use software for student information, learning management, or communication?",
        hint: "SIS (student records), LMS (Google Classroom, Canvas), and parent communication tools. Budget $3,000–$8,000/year for a small school.",
        relatedLineItems: ["Software & Subscriptions (SIS, LMS)"],
      },
      {
        id: "q_software_licensing",
        question: "Is there an annual or monthly licensing fee for your software?",
        hint: "Many education platforms charge per-student or flat annual fees. Check if pricing is monthly or annual — it affects cash flow timing.",
        relatedLineItems: ["Software & Subscriptions (SIS, LMS)"],
      },
      {
        id: "q_internet",
        question: "How reliable is your internet connection? Will you need a dedicated line?",
        hint: "Schools need business-grade internet. Budget $200–$500/month depending on your location and student count.",
        relatedLineItems: ["Internet & Telecommunications"],
      },
      {
        id: "q_it_support",
        question: "Who handles IT issues — a staff member, a parent volunteer, or a managed service?",
        hint: "Managed IT services for small schools run $500–$1,500/month. Some schools train a staff member to handle basic issues.",
        relatedLineItems: ["IT Support / Managed Services"],
      },
    ],
  },
  {
    category: "occupancy_facility",
    intro: "Your building is likely one of your biggest costs. Let's make sure nothing is missed.",
    questions: [
      {
        id: "q_rent",
        question: "Are you renting, leasing, or do you own your building?",
        hint: "Rent is typically the single largest non-personnel expense. Include any escalation clauses in your lease.",
        relatedLineItems: ["Rent / Lease"],
      },
      {
        id: "q_utilities_included",
        question: "Does your lease include utilities, or do you pay them separately?",
        hint: "Some leases are 'gross' (utilities included). Others are 'triple net' where you pay utilities, taxes, and insurance separately.",
        relatedLineItems: ["Utilities"],
      },
      {
        id: "q_cam",
        question: "Does your lease include CAM (common area maintenance) fees?",
        hint: "CAM fees cover shared spaces like lobbies, parking lots, and landscaping in multi-tenant buildings. These can add $2–$5 per square foot annually.",
        relatedLineItems: ["Maintenance & Repairs (General)"],
      },
      {
        id: "q_insurance",
        question: "Do you have property insurance and general liability coverage?",
        hint: "Schools typically need both. Property insurance covers the building/contents; liability covers injuries and lawsuits. Budget $3,000–$8,000/year for small schools.",
        relatedLineItems: ["Property & Liability Insurance", "General Liability Insurance"],
      },
      {
        id: "q_maintenance",
        question: "Who handles building maintenance — you, your landlord, or a contractor?",
        hint: "Even in leased spaces, you're often responsible for interior maintenance. Budget for unexpected repairs.",
        relatedLineItems: ["Maintenance & Repairs (General)"],
      },
      {
        id: "q_janitorial",
        question: "How will you handle cleaning — hire a service or do it in-house?",
        hint: "Janitorial contracts run $500–$2,000/month depending on facility size. Some schools have staff handle daily cleaning.",
        relatedLineItems: ["Janitorial / Cleaning"],
      },
      {
        id: "q_security",
        question: "Do you need security systems, cameras, or a security guard?",
        hint: "Basic security systems cost $50–$200/month. On-site security personnel is much more — $15–$25/hour.",
        relatedLineItems: ["Security"],
      },
    ],
  },
  {
    category: "administrative_general",
    intro: "Running a school means running a business. Let's make sure your operations are covered.",
    questions: [
      {
        id: "q_marketing",
        question: "How will families find your school — word of mouth, social media, paid advertising?",
        hint: "Even established schools spend $3,000–$10,000/year on marketing. New schools should budget more for initial awareness.",
        relatedLineItems: ["Marketing & Admissions"],
      },
      {
        id: "q_legal_accounting",
        question: "Do you have an accountant and lawyer? How much do they cost annually?",
        hint: "Annual accounting/audit: $3,000–$10,000. Legal retainer: $2,000–$5,000/year. Charter schools often require an annual audit.",
        relatedLineItems: ["Legal & Accounting"],
      },
      {
        id: "q_office",
        question: "What office supplies and operational materials does your admin team need?",
        hint: "Paper, printer ink, postage, folders, filing supplies. Small schools typically spend $1,500–$3,000/year.",
        relatedLineItems: ["Office Supplies & Postage"],
      },
      {
        id: "q_bank_fees",
        question: "How do families pay tuition — credit card, ACH, check?",
        hint: "Credit card processing fees are typically 2.5–3.5% of the transaction. ACH is much cheaper ($0.25–$1.00 per transaction).",
        relatedLineItems: ["Bank & Merchant Processing Fees"],
      },
      {
        id: "q_payroll",
        question: "Are you using a payroll provider like Gusto, ADP, or Paychex?",
        hint: "Payroll services cost $40–$150/month base plus $6–$12 per employee. They handle tax withholding, filings, and compliance.",
        relatedLineItems: ["Payroll Processing Fees"],
      },
      {
        id: "q_workers_comp",
        question: "Do you have workers' compensation insurance?",
        hint: "Required in most states for any employees. Rates vary by state but typically cost 1–3% of total payroll.",
        relatedLineItems: ["Workers' Compensation Insurance"],
      },
      {
        id: "q_background",
        question: "Will all staff need background checks and fingerprinting?",
        hint: "Most states require this for anyone working with children. Cost: $30–$100 per person.",
        relatedLineItems: ["Background Checks / Fingerprinting"],
      },
      {
        id: "q_contracted",
        question: "Will you contract any services like speech therapy, occupational therapy, or nursing?",
        hint: "Contracted specialists cost $50–$150/hour. Some schools share providers with other nearby schools to reduce costs.",
        relatedLineItems: ["Contracted Services (Speech, OT, Nursing)"],
      },
    ],
  },
];
