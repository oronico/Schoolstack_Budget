import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mutateAsync = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useUpdateModel: () => ({
    mutate: vi.fn(),
    mutateAsync,
    isPending: false,
  }),
}));

import {
  UndoLastAppliedDecisionBanner,
  isUndoRecordFresh,
} from "../UndoLastAppliedDecisionBanner";
import type { AppliedDecisionUndo } from "@/pages/model-wizard/schema";

beforeEach(() => {
  mutateAsync.mockReset();
  // jsdom's confirm always returns false by default; opt into "OK" for the
  // tests that exercise the undo path.
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildUndoRecord(
  overrides: Partial<AppliedDecisionUndo> = {},
): AppliedDecisionUndo {
  return {
    decisionType: "evaluate_site",
    scenarioName: "Maple St. lease",
    appliedAt: new Date().toISOString(),
    snapshot: {
      schoolProfile: { schoolName: "Future Academy" },
      enrollment: { year1: 50 },
    },
    changes: [
      { label: "Monthly rent", before: "$10,000", after: "$15,000", kind: "modified" },
    ],
    ...overrides,
  };
}

describe("UndoLastAppliedDecisionBanner", () => {
  it("renders nothing when no undo record exists", () => {
    const { container } = render(
      <UndoLastAppliedDecisionBanner modelId={1} data={{}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the undo record is older than 24 hours", () => {
    const oldRecord = buildUndoRecord({
      appliedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    const { container } = render(
      <UndoLastAppliedDecisionBanner
        modelId={1}
        data={{ appliedDecisionUndo: oldRecord }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("surfaces the undo control with the scenario name when a fresh record exists", () => {
    const record = buildUndoRecord({ scenarioName: "Add Pre-K" });
    render(
      <UndoLastAppliedDecisionBanner
        modelId={1}
        data={{ appliedDecisionUndo: record }}
      />,
    );
    expect(screen.getByTestId("undo-last-applied-decision-banner")).toBeTruthy();
    expect(screen.getByText(/Add Pre-K/)).toBeTruthy();
    expect(screen.getByTestId("undo-last-applied-decision-button")).toBeTruthy();
  });

  it("clicking undo restores the snapshot and notifies the caller", async () => {
    const onUndone = vi.fn();
    const record = buildUndoRecord();
    mutateAsync.mockResolvedValue({});
    render(
      <UndoLastAppliedDecisionBanner
        modelId={42}
        data={{ appliedDecisionUndo: record }}
        onUndone={onUndone}
      />,
    );
    fireEvent.click(screen.getByTestId("undo-last-applied-decision-button"));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });
    // The mutation must restore the persisted snapshot verbatim — not the
    // current data — so the founder lands back on their pre-apply state.
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 42,
      data: { data: record.snapshot },
    });
    await waitFor(() => {
      expect(onUndone).toHaveBeenCalled();
    });
  });

  it("clicking dismiss clears the persisted record without restoring the snapshot", async () => {
    const record = buildUndoRecord();
    mutateAsync.mockResolvedValue({});
    const data = {
      appliedDecisionUndo: record,
      schoolProfile: { schoolName: "After-apply" },
    };
    render(
      <UndoLastAppliedDecisionBanner modelId={7} data={data} />,
    );
    fireEvent.click(screen.getByTestId("undo-last-applied-decision-dismiss"));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mutateAsync.mock.calls[0][0] as {
      id: number;
      data: { data: Record<string, unknown> };
    };
    expect(call.id).toBe(7);
    // The post-apply data is preserved (schoolProfile etc.) — only the undo
    // record is dropped, so the founder isn't rolled back, but the banner
    // also won't keep nagging them on the next page load.
    expect(call.data.data.appliedDecisionUndo).toBeUndefined();
    expect(call.data.data.schoolProfile).toEqual({ schoolName: "After-apply" });
  });

  it("aborts the undo when the user cancels the confirm prompt", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const record = buildUndoRecord();
    render(
      <UndoLastAppliedDecisionBanner
        modelId={1}
        data={{ appliedDecisionUndo: record }}
      />,
    );
    fireEvent.click(screen.getByTestId("undo-last-applied-decision-button"));
    // No mutation should fire — the founder backed out of the rollback.
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("isUndoRecordFresh", () => {
  it("treats records inside the 24h window as fresh", () => {
    const ts = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    expect(isUndoRecordFresh(ts)).toBe(true);
  });

  it("treats records outside the 24h window as stale", () => {
    const ts = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isUndoRecordFresh(ts)).toBe(false);
  });

  it("treats unparseable timestamps as stale", () => {
    expect(isUndoRecordFresh("not-a-date")).toBe(false);
  });
});
