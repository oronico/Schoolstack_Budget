import { describe, it, expect } from "vitest";
import {
  parseExportSourceLabel,
  parseLiveSnapshotSourceLabel,
} from "../actuals-source";

// `parseExportSourceLabel` underpins the "Pulled from your books" caption
// that the saved-actuals summary renders next to a saved snapshot. The
// label format is an internal contract with `buildActualsSuggestion` in
// `lib/finance/decision-engine`; if that helper changes its output, this
// test will surface the mismatch before the caption silently disappears.
describe("parseExportSourceLabel", () => {
  it("parses a CSV export label with an upload date", () => {
    expect(
      parseExportSourceLabel("From quickbooks-q1.csv uploaded Mar 14"),
    ).toEqual({
      filename: "quickbooks-q1.csv",
      uploadedLabel: "Mar 14",
    });
  });

  it("parses an XLSX export label with an upload date", () => {
    expect(
      parseExportSourceLabel("From acme-2026Q1.xlsx uploaded Apr 2"),
    ).toEqual({
      filename: "acme-2026Q1.xlsx",
      uploadedLabel: "Apr 2",
    });
  });

  it("parses a CSV export label without an upload date (fallback)", () => {
    expect(parseExportSourceLabel("From quickbooks-q1.csv")).toEqual({
      filename: "quickbooks-q1.csv",
    });
  });

  it("returns null for live-snapshot labels", () => {
    expect(
      parseExportSourceLabel("From QuickBooks (synced 2 hours ago)"),
    ).toBeNull();
    expect(parseExportSourceLabel("From Xero · Acme Realm")).toBeNull();
    expect(parseExportSourceLabel("From QuickBooks")).toBeNull();
    // The current live-snapshot label format used by
    // `buildActualsSuggestion` for tagged enrollment must not falsely
    // match the books-export caption.
    expect(
      parseExportSourceLabel("From QuickBooks tag 'Students FY26'"),
    ).toBeNull();
    expect(
      parseExportSourceLabel("From Xero tag 'Active Students'"),
    ).toBeNull();
  });

  it("returns null for prior-year and current-year labels", () => {
    expect(parseExportSourceLabel("Prior-year actuals from setup")).toBeNull();
    expect(
      parseExportSourceLabel("Current-year projection from setup"),
    ).toBeNull();
    expect(
      parseExportSourceLabel(
        "Current-year projection (annualized from 6 months)",
      ),
    ).toBeNull();
  });

  it("returns null for unrelated strings", () => {
    expect(parseExportSourceLabel("")).toBeNull();
    expect(parseExportSourceLabel("Detected from your facility expense")).toBeNull();
    expect(parseExportSourceLabel("Signed rent from facility plan")).toBeNull();
  });
});

// `parseLiveSnapshotSourceLabel` underpins the "From <provider> tag <name>"
// subtitle the actuals editor's enrollment row renders whenever the
// suggestion came from `liveSnapshot.enrollment`. The label format is an
// internal contract with `buildActualsSuggestion`; if either side drifts
// the subtitle silently disappears, so this test pins the shape.
describe("parseLiveSnapshotSourceLabel", () => {
  it("parses a QuickBooks live-snapshot label", () => {
    expect(
      parseLiveSnapshotSourceLabel("From QuickBooks tag 'Students FY26'"),
    ).toEqual({ provider: "QuickBooks", tagName: "Students FY26" });
  });

  it("parses a Xero live-snapshot label", () => {
    expect(
      parseLiveSnapshotSourceLabel("From Xero tag 'Active Students'"),
    ).toEqual({ provider: "Xero", tagName: "Active Students" });
  });

  it("preserves a tag name with internal punctuation", () => {
    // Tag names are founder-supplied (e.g. a QuickBooks Class) so we
    // can't constrain their content. The regex deliberately matches
    // greedy on the tag so apostrophe-free characters round-trip.
    expect(
      parseLiveSnapshotSourceLabel(
        "From QuickBooks tag 'K-8 Students (FY26)'",
      ),
    ).toEqual({ provider: "QuickBooks", tagName: "K-8 Students (FY26)" });
  });

  it("returns null for CSV-export labels", () => {
    expect(
      parseLiveSnapshotSourceLabel("From quickbooks-q1.csv uploaded Mar 14"),
    ).toBeNull();
    expect(parseLiveSnapshotSourceLabel("From quickbooks-q1.csv")).toBeNull();
  });

  it("returns null for prior-year, current-year, and unrelated labels", () => {
    expect(
      parseLiveSnapshotSourceLabel("Prior-year actuals from setup"),
    ).toBeNull();
    expect(
      parseLiveSnapshotSourceLabel("Current-year projection from setup"),
    ).toBeNull();
    expect(parseLiveSnapshotSourceLabel("")).toBeNull();
    // Looks live-ish but missing the quoted tag — must not match.
    expect(parseLiveSnapshotSourceLabel("From QuickBooks")).toBeNull();
    expect(
      parseLiveSnapshotSourceLabel("From QuickBooks tag Students FY26"),
    ).toBeNull();
  });
});
