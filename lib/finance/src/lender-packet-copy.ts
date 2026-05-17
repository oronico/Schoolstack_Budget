/**
 * Task #903 — single source of truth for the workbook methodology
 * disclosure that appears both in the lender packet PDF
 * (`renderProFormaMethodologyNote` in
 * `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts`) and the
 * in-app lender packet preview (`ProFormaMethodologyNote` in
 * `artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx`).
 *
 * Task #921 — rewritten to describe the SINGLE workbook the founder
 * wizard actually ships today (the 5-Year Financial Model). The
 * Lender Pro-Forma generator + API route exist
 * (`artifacts/api-server/src/lib/lender-proforma-export.ts`, route
 * `GET /api/models/:id/export/lender-proforma`) but the wizard's
 * ExportStep currently exposes a Download button only for the
 * underwriting workbook (`underwritingV2`). Surfacing a "ships two
 * workbooks" claim while only one workbook is reachable from the UI
 * was a credibility risk a lender would hit on first read. The
 * Lender Pro-Forma is gated to "available on request" until the
 * follow-up task (queued post-#921) QAs the generator and wires the
 * Download button — at which point this copy reverts to the
 * two-workbook framing.
 *
 * Constant names retain the `PRO_FORMA_METHODOLOGY_NOTE_*` prefix
 * because both surfaces and a vitest test already import these
 * symbols; renaming would force a wider edit without changing
 * behavior. The semantic content — what the disclaimer says — is
 * what matters for the lender-facing claim.
 */
export const PRO_FORMA_METHODOLOGY_NOTE_TITLE = "Reading the 5-Year Financial Model";

export const PRO_FORMA_METHODOLOGY_NOTE_BODY =
  "This packet ships one Excel workbook: the 5-Year Financial Model (underwriting). It is the canonical bottom line and uses the full driver engine; its Operating Statement Net Income subtracts personnel, operating expenses, interest, principal & capital outlays, and depreciation. Every figure cited in this PDF narrative sources from that workbook. A simplified Lender Pro-Forma comparator — built from per-student / per-row averages so a reviewer can re-run sensitivities by editing one assumption — is available on request pending QA, and will be re-included in this packet once verified.";
