/**
 * Task #903 — single source of truth for the "Reading the Two Workbooks"
 * methodology disclosure that appears both in the lender packet PDF
 * (`renderProFormaMethodologyNote` in
 * `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts`) and the
 * in-app lender packet preview (`ProFormaMethodologyNote` in
 * `artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx`).
 *
 * Both surfaces import these constants so the copy cannot drift: editing
 * the body in one place updates both the downloaded PDF and the founder's
 * in-app preview at the same time.
 */
export const PRO_FORMA_METHODOLOGY_NOTE_TITLE = "Reading the Two Workbooks";

export const PRO_FORMA_METHODOLOGY_NOTE_BODY =
  "This packet ships two Excel workbooks. The 5-Year Financial Model (underwriting) is the canonical bottom line and uses the full driver engine; its Operating Statement Net Income subtracts personnel, operating expenses, interest, principal & capital outlays, and depreciation. The Lender Pro-Forma is a simplified comparator built from per-student / per-row averages so a reviewer can re-run sensitivities by editing one assumption; its 5-Year P&L Net Income is GAAP-style (NOI minus interest only — principal and depreciation are not on that P&L). Because the two sheets use different driver models AND different bottom-line definitions, their Y1 Net Income figures will not tie on the same payload, and they are not meant to. The figures cited in this PDF narrative source from the underwriting model.";
