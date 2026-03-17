export { buildPacketData } from "./build-packet-data";
export { buildNarrative } from "./build-narrative";
export { buildLenderPacket } from "./build-lender-packet";
export type { LenderPacket, RiskMitigant, DSCRSummary } from "./build-lender-packet";
export { generateLenderPacketPDF } from "./lender-packet-pdf";
export type {
  PacketData,
  PacketInput,
  PacketSection,
  PacketTable,
  PacketTableRow,
  PacketType,
  SectionId,
  NarrativeSummary,
  LinkedAssumption,
  LinkedMetric,
  FormatRules,
} from "./packet-types";
export { LENDER_SECTIONS, BOARD_SECTIONS, SECTION_META } from "./packet-types";
