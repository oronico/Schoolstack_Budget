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
  it("hides the step-1 sidebar entirely when entityType is unknown", () => {
    const { container } = render(
      <WhatThisMeansInYourBooks step={1} entityType={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides the step-1 sidebar when entityType is 'undetermined'", () => {
    const { container } = render(
      <WhatThisMeansInYourBooks step={1} entityType="undetermined" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nonprofit-specific lines on step 1 for a 501(c)(3)", () => {
    render(<WhatThisMeansInYourBooks step={1} entityType="nonprofit_501c3" />);
    expect(screen.getByTestId("bookkeeping-sidebar-step-1")).toBeInTheDocument();
    expect(screen.getByText(/Restricted vs\. unrestricted donor intent/)).toBeInTheDocument();
    expect(
      screen.getByText(/program vs\. admin overhead, how donor gifts get classified/),
    ).toBeInTheDocument();
  });

  it("renders the for-profit intro and hides nonprofit-only lines on step 1 for an LLC", () => {
    render(<WhatThisMeansInYourBooks step={1} entityType="llc_single" />);
    expect(screen.getByTestId("bookkeeping-sidebar-step-1")).toBeInTheDocument();
    expect(screen.queryByText(/Restricted vs\. unrestricted donor intent/)).toBeNull();
    expect(
      screen.getByText(/direct vs\. overhead expenses/),
    ).toBeInTheDocument();
  });

  it("hides the donations nonprofit-only line on step 4 for an LLC", () => {
    render(<WhatThisMeansInYourBooks step={4} entityType="llc_single" />);
    expect(screen.getByTestId("bookkeeping-sidebar-step-4")).toBeInTheDocument();
    expect(screen.queryByText(/Donations and grants/)).toBeNull();
  });

  it("keeps the donations line on step 4 for a nonprofit", () => {
    render(<WhatThisMeansInYourBooks step={4} entityType="nonprofit_501c3" />);
    expect(screen.getByText(/Donations and grants/)).toBeInTheDocument();
  });
});
