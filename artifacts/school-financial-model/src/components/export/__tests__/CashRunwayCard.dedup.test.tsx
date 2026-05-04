import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CashRunwayCard, type CashRunwayView } from "../CashRunwayCard";

/**
 * Task #500 regression test — locks in the lender/board cash runway dedup.
 *
 * Task #389 collapsed two copy-pasted cash runway cards into a single shared
 * `CashRunwayCard` component (and a matching pair of PDF helpers). The only
 * difference between the lender and board renders is the `data-testid`
 * prefix used by e2e selectors. If a future change adds a lender-only or
 * board-only visual tweak (different copy, an extra badge, a tile reorder),
 * we want this test to fail loudly so the divergence is caught in review.
 *
 * The test renders the same `CashRunwayView` fixture twice — once as the
 * lender variant, once as the board variant — strips the variant-specific
 * testid prefix from each, and asserts the two HTML strings are identical.
 */

const fixture: CashRunwayView = {
  runwayMonths: 24,
  runwayLabel: "Cash runway is approximately 24 months",
  status: "warning",
  yearByYearCash: [
    { year: 1, cumulative: "$150K", reserveMonths: "4 mo reserve", endingCash: "$150K", isTrough: false },
    { year: 2, cumulative: "$0K", reserveMonths: "0 mo reserve", endingCash: "$0K", isTrough: false },
    { year: 3, cumulative: "-$100K", reserveMonths: "0 mo reserve", endingCash: "-$100K", isTrough: true },
    { year: 4, cumulative: "$50K", reserveMonths: "1 mo reserve", endingCash: "$50K", isTrough: false },
    { year: 5, cumulative: "$300K", reserveMonths: "5 mo reserve", endingCash: "$300K", isTrough: false },
  ],
  troughCallout: { year: 3, endingCash: "-$100K", isNegative: true },
};

const positiveFixture: CashRunwayView = {
  runwayMonths: 60,
  runwayLabel: "Cash remains positive through the full 5-year projection",
  status: "good",
  yearByYearCash: [
    { year: 1, cumulative: "$125K", reserveMonths: "6 mo reserve", endingCash: "$125K", isTrough: true },
    { year: 2, cumulative: "$180K", reserveMonths: "9 mo reserve", endingCash: "$180K", isTrough: false },
    { year: 3, cumulative: "$280K", reserveMonths: "12 mo reserve", endingCash: "$280K", isTrough: false },
    { year: 4, cumulative: "$420K", reserveMonths: "15 mo reserve", endingCash: "$420K", isTrough: false },
    { year: 5, cumulative: "$600K", reserveMonths: "18 mo reserve", endingCash: "$600K", isTrough: false },
  ],
  troughCallout: { year: 1, endingCash: "$125K", isNegative: false },
};

const emptyFixture: CashRunwayView = {
  runwayMonths: 0,
  runwayLabel: "No cash projection available yet",
  status: "danger",
  yearByYearCash: [],
  troughCallout: null,
};

function stripPrefix(html: string, prefix: string): string {
  // Drop the variant-specific data-testid prefix so the lender and board
  // renders can be compared byte-for-byte.
  return html.split(`data-testid="${prefix}-`).join('data-testid="VARIANT-');
}

function renderVariantHtml(cash: CashRunwayView, variant: "lender" | "board"): string {
  const { container, unmount } = render(<CashRunwayCard cash={cash} variant={variant} />);
  const html = container.innerHTML;
  unmount();
  return stripPrefix(html, variant === "lender" ? "lender-packet" : "board-packet");
}

describe("CashRunwayCard lender/board dedup (Task #500)", () => {
  it("renders identical markup for lender and board variants on a trough fixture", () => {
    const lenderHtml = renderVariantHtml(fixture, "lender");
    const boardHtml = renderVariantHtml(fixture, "board");
    expect(boardHtml).toBe(lenderHtml);
    // Sanity checks so a future bug that strips the testid attribute entirely
    // can't accidentally make the two renders "match" by both being empty.
    expect(lenderHtml).toContain('data-testid="VARIANT-cash-runway"');
    expect(lenderHtml).toContain('data-testid="VARIANT-ending-cash-row"');
    expect(lenderHtml).toContain('data-testid="VARIANT-ending-cash-y3"');
    expect(lenderHtml).toContain('data-testid="VARIANT-trough-callout"');
    expect(lenderHtml).toContain("Year 3 dips to -$100K");
  });

  it("renders identical markup for lender and board variants on a positive-trough fixture", () => {
    const lenderHtml = renderVariantHtml(positiveFixture, "lender");
    const boardHtml = renderVariantHtml(positiveFixture, "board");
    expect(boardHtml).toBe(lenderHtml);
    expect(lenderHtml).toContain("Year 1 ends at $125K");
  });

  it("renders identical markup for lender and board variants when there is no projection", () => {
    const lenderHtml = renderVariantHtml(emptyFixture, "lender");
    const boardHtml = renderVariantHtml(emptyFixture, "board");
    expect(boardHtml).toBe(lenderHtml);
    // Empty projection → no tile row and no callout.
    expect(lenderHtml).not.toContain("ending-cash-row");
    expect(lenderHtml).not.toContain("trough-callout");
  });

  it("fails if the lender variant uses a different testid prefix than expected", () => {
    // Pin the prefix contract so a future rename of the testid prefix shows
    // up here instead of silently breaking downstream e2e selectors.
    const { container } = render(<CashRunwayCard cash={fixture} variant="lender" />);
    expect(container.querySelector('[data-testid="lender-packet-cash-runway"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="lender-packet-trough-callout"]')).not.toBeNull();
  });

  it("fails if the board variant uses a different testid prefix than expected", () => {
    const { container } = render(<CashRunwayCard cash={fixture} variant="board" />);
    expect(container.querySelector('[data-testid="board-packet-cash-runway"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="board-packet-trough-callout"]')).not.toBeNull();
  });
});
