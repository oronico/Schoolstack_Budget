import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProFormaMethodologyNote } from "../LenderPacketPreview";

/**
 * Task #897 — the in-app lender packet preview now mirrors the
 * "Reading the Two Workbooks" methodology callout that ships in the
 * downloaded PDF (see `renderProFormaMethodologyNote` in
 * `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts`).
 *
 * The body copy in both surfaces MUST stay byte-identical so a founder
 * previewing the packet in the app sees the same disclosure a lender
 * will read in the PDF. Drift between the two surfaces is the bug this
 * test guards against.
 */
const PDF_BODY_COPY =
  "This packet ships two Excel workbooks. The 5-Year Financial Model (underwriting) is the canonical bottom line and uses the full driver engine; its Operating Statement Net Income subtracts personnel, operating expenses, interest, principal & capital outlays, and depreciation. The Lender Pro-Forma is a simplified comparator built from per-student / per-row averages so a reviewer can re-run sensitivities by editing one assumption; its 5-Year P&L Net Income is GAAP-style (NOI minus interest only — principal and depreciation are not on that P&L). Because the two sheets use different driver models AND different bottom-line definitions, their Y1 Net Income figures will not tie on the same payload, and they are not meant to. The figures cited in this PDF narrative source from the underwriting model.";

describe("ProFormaMethodologyNote (Task #897)", () => {
  it("renders the same body copy as the PDF callout", () => {
    render(
      <ProFormaMethodologyNote
        onJumpToProjection={() => {}}
        onJumpToAttachments={() => {}}
      />,
    );

    const note = screen.getByTestId("pro-forma-methodology-note");
    expect(note).toHaveTextContent("Reading the Two Workbooks");
    expect(note.textContent).toContain(PDF_BODY_COPY);
  });

  it("invokes the jump callbacks when the founder clicks the anchor buttons", () => {
    const onJumpToProjection = vi.fn();
    const onJumpToAttachments = vi.fn();
    render(
      <ProFormaMethodologyNote
        onJumpToProjection={onJumpToProjection}
        onJumpToAttachments={onJumpToAttachments}
      />,
    );

    fireEvent.click(screen.getByTestId("pro-forma-methodology-jump-projection"));
    expect(onJumpToProjection).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("pro-forma-methodology-jump-attachments"));
    expect(onJumpToAttachments).toHaveBeenCalledTimes(1);
  });
});
