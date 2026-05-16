import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  PRO_FORMA_METHODOLOGY_NOTE_BODY,
  PRO_FORMA_METHODOLOGY_NOTE_TITLE,
} from "@workspace/finance";
import { ProFormaMethodologyNote } from "../LenderPacketPreview";

/**
 * Task #897 / #903 — the in-app lender packet preview and the downloaded
 * PDF (`renderProFormaMethodologyNote` in
 * `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts`) both
 * render the canonical disclosure body exported from
 * `@workspace/finance` (`PRO_FORMA_METHODOLOGY_NOTE_BODY`). Importing the
 * same constant here makes drift between the two surfaces structurally
 * impossible — this test now asserts that the in-app callout actually
 * renders that shared constant, so any edit to the canonical copy is
 * picked up automatically by both surfaces.
 */

describe("ProFormaMethodologyNote (Task #897)", () => {
  it("renders the shared methodology copy from @workspace/finance", () => {
    render(
      <ProFormaMethodologyNote
        onJumpToProjection={() => {}}
        onJumpToAttachments={() => {}}
      />,
    );

    const note = screen.getByTestId("pro-forma-methodology-note");
    expect(note).toHaveTextContent(PRO_FORMA_METHODOLOGY_NOTE_TITLE);
    expect(note.textContent).toContain(PRO_FORMA_METHODOLOGY_NOTE_BODY);
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
