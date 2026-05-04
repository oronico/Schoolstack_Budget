import { describe, expect, it, vi } from "vitest";
import { renderHook, act, render, screen, fireEvent } from "@testing-library/react";
import { ConflictReloadBanner, useConflictBanner } from "../ConflictReloadBanner";

class FakeApiError extends Error {
  readonly name = "ApiError";
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

describe("ConflictReloadBanner", () => {
  it("renders the plain-language conflict message and a reload button", () => {
    const onReload = vi.fn();
    render(<ConflictReloadBanner onReload={onReload} />);
    expect(screen.getByTestId("conflict-reload-banner")).toBeTruthy();
    expect(screen.getByText(/Your other tab made changes/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("conflict-reload-button"));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("hides the dismiss button when no onDismiss is provided", () => {
    render(<ConflictReloadBanner onReload={() => {}} />);
    expect(screen.queryByTestId("conflict-reload-dismiss")).toBeNull();
  });

  it("shows a dismiss control when onDismiss is provided", () => {
    const onDismiss = vi.fn();
    render(<ConflictReloadBanner onDismiss={onDismiss} onReload={() => {}} />);
    fireEvent.click(screen.getByTestId("conflict-reload-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("useConflictBanner", () => {
  it("opens the banner on a 409 ApiError and reports handled", () => {
    const { result } = renderHook(() => useConflictBanner());
    expect(result.current.open).toBe(false);
    let handled = false;
    act(() => {
      handled = result.current.handleMutationError(new FakeApiError(409));
    });
    expect(handled).toBe(true);
    expect(result.current.open).toBe(true);
  });

  it("ignores non-conflict errors so existing toast/error flows still fire", () => {
    const { result } = renderHook(() => useConflictBanner());
    let handled = true;
    act(() => {
      handled = result.current.handleMutationError(new FakeApiError(500));
    });
    expect(handled).toBe(false);
    expect(result.current.open).toBe(false);

    act(() => {
      handled = result.current.handleMutationError(new Error("boom"));
    });
    expect(handled).toBe(false);
    expect(result.current.open).toBe(false);
  });

  it("dismiss() closes the banner", () => {
    const { result } = renderHook(() => useConflictBanner());
    act(() => {
      result.current.handleMutationError(new FakeApiError(409));
    });
    expect(result.current.open).toBe(true);
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.open).toBe(false);
  });
});
