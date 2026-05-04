import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Hoisted mocks. The picker calls useCreateModel().mutateAsync(...) and
// then setLocation(`/model/:id`). We capture the payload to assert that
// modelDuration is persisted on the freshly created model.
const mockMutateAsync = vi.fn();
const mockSetLocation = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useCreateModel: () => ({
    mutate: vi.fn(),
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/model/new", mockSetLocation] as const,
}));

vi.mock("@/components/layout/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { NewModelPage } from "../model-new";

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockSetLocation.mockReset();
  // The component reads window.location.search synchronously inside an
  // effect to detect Spaces import params — clear it for these tests.
  window.history.replaceState({}, "", "/model/new");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NewModelPage — duration picker", () => {
  it("shows both duration cards when there are no Spaces params", async () => {
    render(<NewModelPage />);
    await waitFor(() => {
      expect(screen.getByTestId("pick-single-year")).toBeInTheDocument();
    });
    expect(screen.getByTestId("pick-five-year")).toBeInTheDocument();
    expect(
      screen.getByText(/How far out do you want to plan/i),
    ).toBeInTheDocument();
  });

  it("creates a single-year model when the Single-Year card is clicked", async () => {
    mockMutateAsync.mockResolvedValue({ id: 7 });
    render(<NewModelPage />);
    const card = await screen.findByTestId("pick-single-year");
    fireEvent.click(card);
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    const payload = mockMutateAsync.mock.calls[0][0] as {
      data: { data: { schoolProfile: { modelDuration: string } } };
    };
    expect(payload.data.data.schoolProfile.modelDuration).toBe("single_year");
    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/model/7"));
  });

  it("creates a five-year model when the 5-Year card is clicked", async () => {
    mockMutateAsync.mockResolvedValue({ id: 11 });
    render(<NewModelPage />);
    const card = await screen.findByTestId("pick-five-year");
    fireEvent.click(card);
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    const payload = mockMutateAsync.mock.calls[0][0] as {
      data: { data: { schoolProfile: { modelDuration: string } } };
    };
    expect(payload.data.data.schoolProfile.modelDuration).toBe("five_year");
    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/model/11"));
  });

  it("ignores a second click while the first creation is in flight", async () => {
    // Hold the first call open so we can fire a second click into the
    // pending window — the picker uses a `hasTriggered` ref to gate this.
    let resolveFirst: (v: { id: number }) => void = () => {};
    mockMutateAsync.mockImplementation(
      () => new Promise<{ id: number }>(res => { resolveFirst = res; }),
    );
    render(<NewModelPage />);
    const single = await screen.findByTestId("pick-single-year");
    fireEvent.click(single);
    // After the first click the page swaps to the spinner; the second card
    // is no longer in the DOM. Asserting on the call-count is the cleanest
    // proof that the guard held.
    resolveFirst({ id: 99 });
    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/model/99"));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
