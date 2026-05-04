import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let currentUser: Record<string, unknown> | null = { id: 1, guidanceLevel: "basics" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: currentUser,
    refetchUser: async () => {},
    isLoading: false,
    login: () => {},
    logout: () => {},
  }),
}));

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { WhatThisMeansInYourBooks } from "../WhatThisMeansInYourBooks";

describe("WhatThisMeansInYourBooks", () => {
  it("hides the Story sidebar entirely when entityType is unknown", () => {
    const { container } = render(
      <WhatThisMeansInYourBooks stepTitle="Story" entityType={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides the Story sidebar when entityType is 'undetermined'", () => {
    const { container } = render(
      <WhatThisMeansInYourBooks stepTitle="Story" entityType="undetermined" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nonprofit-specific lines on Story for a 501(c)(3)", () => {
    render(<WhatThisMeansInYourBooks stepTitle="Story" entityType="nonprofit_501c3" />);
    expect(screen.getByTestId("bookkeeping-sidebar-story")).toBeInTheDocument();
    expect(screen.getByText(/Restricted vs\. unrestricted donor intent/)).toBeInTheDocument();
    expect(
      screen.getByText(/program vs\. admin overhead, how donor gifts get classified/),
    ).toBeInTheDocument();
  });

  it("renders the for-profit intro and hides nonprofit-only lines on Story for an LLC", () => {
    render(<WhatThisMeansInYourBooks stepTitle="Story" entityType="llc_single" />);
    expect(screen.getByTestId("bookkeeping-sidebar-story")).toBeInTheDocument();
    expect(screen.queryByText(/Restricted vs\. unrestricted donor intent/)).toBeNull();
    expect(
      screen.getByText(/direct vs\. overhead expenses/),
    ).toBeInTheDocument();
  });

  it("hides the donations nonprofit-only line on Revenue for an LLC", () => {
    render(<WhatThisMeansInYourBooks stepTitle="Revenue" entityType="llc_single" />);
    expect(screen.getByTestId("bookkeeping-sidebar-revenue")).toBeInTheDocument();
    expect(screen.queryByText(/Donations and grants/)).toBeNull();
  });

  it("keeps the donations line on Revenue for a nonprofit", () => {
    render(<WhatThisMeansInYourBooks stepTitle="Revenue" entityType="nonprofit_501c3" />);
    expect(screen.getByText(/Donations and grants/)).toBeInTheDocument();
  });

  it("renders nothing for a step title with no entry (e.g. Chesterton 'Fundraising Goals')", () => {
    const { container } = render(
      <WhatThisMeansInYourBooks stepTitle="Fundraising Goals" entityType="nonprofit_501c3" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for an empty step title (single-year/clamped state)", () => {
    const { container } = render(
      <WhatThisMeansInYourBooks stepTitle="" entityType="nonprofit_501c3" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("resolves Capital & Financing by title regardless of position (default 5-year)", () => {
    // In default 5-year mode this is positional step 7. The lookup must
    // succeed by title, not by position.
    render(
      <WhatThisMeansInYourBooks
        stepTitle="Capital & Financing"
        entityType="llc_single"
      />,
    );
    expect(
      screen.getByTestId("bookkeeping-sidebar-capital-financing"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Loan principal/)).toBeInTheDocument();
  });

  it("resolves Expenses by title in Chesterton mode (where positional ID shifts)", () => {
    // In Chesterton mode the positional index of "Expenses" shifts because
    // extra Fundraising/Gift Chart/Recruiting steps are inserted. The
    // lookup by title must still land on the correct copy.
    render(
      <WhatThisMeansInYourBooks
        stepTitle="Expenses"
        entityType="llc_single"
      />,
    );
    expect(
      screen.getByTestId("bookkeeping-sidebar-expenses"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Curriculum, classroom supplies, field trips/),
    ).toBeInTheDocument();
  });

  it("resolves Review by title in single-year mode (where later steps are skipped)", () => {
    render(
      <WhatThisMeansInYourBooks
        stepTitle="Review"
        entityType="llc_single"
      />,
    );
    expect(
      screen.getByTestId("bookkeeping-sidebar-review"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Opening cash, receivables, fixed assets/),
    ).toBeInTheDocument();
  });
});
