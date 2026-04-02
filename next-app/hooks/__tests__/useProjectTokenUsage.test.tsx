// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProjectTokenUsage } from "@/hooks/useProjectTokenUsage";

const getTokenUsageTodayAction = vi.fn();

vi.mock("@/app/actions/usage", () => ({
  getTokenUsageTodayAction: (...args: unknown[]) => getTokenUsageTodayAction(...args),
}));

describe("useProjectTokenUsage", () => {
  it("returns null for empty projects and resets to null until a new project's usage loads", async () => {
    getTokenUsageTodayAction
      .mockResolvedValueOnce({ success: true, data: { totalTokens: 42 } })
      .mockResolvedValueOnce({ success: true, data: { totalTokens: 7 } });

    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectTokenUsage(projectId, { pollMs: 60_000 }),
      { initialProps: { projectId: "proj-1" } },
    );

    await waitFor(() => {
      expect(result.current).toBe(42);
    });

    rerender({ projectId: "" });
    expect(result.current).toBeNull();

    rerender({ projectId: "proj-2" });
    expect(result.current).toBeNull();

    await waitFor(() => {
      expect(result.current).toBe(7);
    });
  });
});
