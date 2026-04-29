// Implementation lives in @workspace/finance — see scenario-engine shim header.
// The api-server uses the same engine to precompute decision impacts for the
// public share-link page so we never expose the raw model on the wire.
export {
  applyAddProgramDecision,
  applyDecisionToData,
  applyPersistedScenarioToData,
  buildBlankAddProgramInputs,
  buildBlankEnrollmentChangeInputs,
  buildBlankSiteInputs,
  computeDecisionImpact,
  computeDecisionImpactFromPersisted,
  computeProjectedSnapshot,
  decisionToPersistedOverrides,
  enrollmentChangeInputsToOverrides,
  siteInputsToOverrides,
  buildDecisionFlowBullets as buildDecisionBullets,
  DECISION_FLOW_LABELS as DECISION_LABELS,
  DECISION_SHORT,
  DECISION_THEME,
  type AddProgramInputs,
  type DecisionImpact,
  type DecisionInputs,
  type EnrollmentChangeInputs,
  type ProjectedSnapshot,
  type SiteInputs,
  type PersistedDecisionOverrides,
} from "@workspace/finance";
export {
  buildActualsSuggestion,
  providerDisplayName,
  relativeTimeAgo,
  type ActualsSuggestion,
  type ActualsSuggestionField,
  type ActualsContributor,
  type AccountingSnapshotLike,
  type AccountingSnapshotProvider,
  type AccountingDiscoveredAccountLike,
  type AccountingAccountKindLike,
} from "@workspace/finance";
export {
  parseAccountingExportCsv,
  parseAccountingNumber,
  MAX_ACCOUNTING_EXPORT_BYTES,
  type AccountingExportLike,
  type AccountingExportTotals,
  type ParsedAccountingExport,
} from "@workspace/finance";
