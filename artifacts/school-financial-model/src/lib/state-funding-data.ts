// Task #455: state funding data moved to `@workspace/finance` so the
// api-server (assumption flags + lender/board PDFs) and the wizard share a
// single source of truth for program status (active / pending / blocked /
// litigated). This file is kept as a thin re-export so existing imports
// (`@/lib/state-funding-data`) continue to work without a sweeping rename.
export {
  STATE_FUNDING_MAP,
  getStateFundingConfig,
  getAllStatesWithProgram,
  getCharterMethodologyStates,
} from "@workspace/finance";

export type {
  CharterMethodology,
  SchoolChoiceProgramType,
  ProgramStatus,
  ProgramInfo,
  CharterPerPupilRange,
  StateFundingEntry,
  SchoolType,
  StateFundingConfig,
} from "@workspace/finance";
