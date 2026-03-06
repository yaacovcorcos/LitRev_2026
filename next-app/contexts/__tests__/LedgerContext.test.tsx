// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerProvider, useLedger } from "@/contexts/LedgerContext";

const mockListStudiesAction = vi.fn();

vi.mock("@/app/actions/ledger", () => ({
  listStudiesAction: (...args: unknown[]) => mockListStudiesAction(...args),
  upsertStudyAction: vi.fn(),
  deleteStudiesAction: vi.fn(),
  getStudyAction: vi.fn(),
  updateStudyAction: vi.fn(),
}));

function createWrapper({ children }: { children: ReactNode }) {
  return <LedgerProvider>{children}</LedgerProvider>;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("LedgerContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a project loaded only after studies resolve", async () => {
    const deferred = createDeferred<{ success: true; data: { id: string }[] }>();
    mockListStudiesAction.mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useLedger(), { wrapper: createWrapper });

    act(() => {
      result.current.ensureProjectLoaded("proj-1");
    });

    expect(result.current.isProjectLoaded("proj-1")).toBe(false);
    expect(result.current.getStudiesByProject("proj-1")).toEqual([]);

    await act(async () => {
      deferred.resolve({ success: true, data: [{ id: "s1" }] });
      await deferred.promise;
    });

    await waitFor(() => {
      expect(result.current.isProjectLoaded("proj-1")).toBe(true);
      expect(result.current.getStudiesByProject("proj-1")).toEqual([{ id: "s1" }]);
    });
  });

  it("allows a retry when the initial load fails", async () => {
    const failure = createDeferred<{ success: false; error: string }>();
    mockListStudiesAction.mockReturnValueOnce(failure.promise);
    mockListStudiesAction.mockResolvedValueOnce({ success: true, data: [{ id: "s2" }] });

    const { result } = renderHook(() => useLedger(), { wrapper: createWrapper });

    act(() => {
      result.current.ensureProjectLoaded("proj-2");
    });

    await act(async () => {
      failure.resolve({ success: false, error: "boom" });
      await failure.promise;
    });

    await waitFor(() => {
      expect(result.current.isProjectLoaded("proj-2")).toBe(false);
    });

    act(() => {
      result.current.ensureProjectLoaded("proj-2");
    });

    await waitFor(() => {
      expect(mockListStudiesAction).toHaveBeenCalledTimes(2);
      expect(result.current.isProjectLoaded("proj-2")).toBe(true);
    });
  });
});
