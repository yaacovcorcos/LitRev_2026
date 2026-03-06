// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectState } from "@/hooks/useProjectState";
import { createDefaultProtocolData } from "@/types/protocol";

const mockEnsureProjectLoaded = vi.fn();
const mockGetStudiesByProject = vi.fn();
const mockIsProjectLoaded = vi.fn();
const mockWarmDomain = vi.fn();
const mockGetProjectById = vi.fn();

let protocolSlice: {
  data: ReturnType<typeof createDefaultProtocolData> | null;
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

vi.mock("@/contexts/LedgerContext", () => ({
  useLedger: () => ({
    getStudiesByProject: mockGetStudiesByProject,
    isProjectLoaded: mockIsProjectLoaded,
    ensureProjectLoaded: mockEnsureProjectLoaded,
  }),
}));

vi.mock("@/hooks/useProjectData", () => ({
  useProjectData: () => ({
    protocol: protocolSlice,
    warmDomain: mockWarmDomain,
  }),
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: () => ({
    getProjectById: mockGetProjectById,
  }),
}));

describe("useProjectState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    protocolSlice = {
      data: null,
      state: "idle",
      error: null,
    };
    mockGetStudiesByProject.mockReturnValue([]);
    mockIsProjectLoaded.mockReturnValue(false);
    mockGetProjectById.mockReturnValue({
      id: "proj-1",
      papers: 3,
      progress: { phase: "screening", percent: 25, papers: 3 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns lightweight fallback state until ledger and protocol are settled", () => {
    const { result } = renderHook(() => useProjectState("proj-1"));

    expect(result.current.snapshot.studyCount).toBe(3);
    expect(result.current.snapshot.hasProtocol).toBe(false);
    expect(result.current.hasProtocolForRouting).toBeUndefined();
    expect(result.current.isReady).toBe(false);
  });

  it("bootstraps ledger and protocol lazily when requested", () => {
    renderHook(() => useProjectState("proj-1", { bootstrap: true }));

    expect(mockEnsureProjectLoaded).not.toHaveBeenCalled();
    expect(mockWarmDomain).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(mockEnsureProjectLoaded).toHaveBeenCalledWith("proj-1");
    expect(mockWarmDomain).toHaveBeenCalledWith("protocol");
  });

  it("uses loaded ledger counts and settled protocol state when available", () => {
    const protocol = createDefaultProtocolData();
    protocol.researchQuestion = "What changes initial project-entry cost?";
    protocolSlice = {
      data: protocol,
      state: "ready",
      error: null,
    };
    mockIsProjectLoaded.mockReturnValue(true);
    mockGetStudiesByProject.mockReturnValue([
      { id: "s1", details: {} },
      { id: "s2", details: { triageDecision: "keep" } },
      { id: "s3", details: { triageDecision: "maybe" } },
    ]);

    const { result } = renderHook(() => useProjectState("proj-1"));

    expect(result.current.snapshot).toEqual({
      hasProtocol: true,
      studyCount: 3,
      unscreenedCount: 1,
      includedCount: 1,
      excludedCount: 0,
      maybeCount: 1,
    });
    expect(result.current.hasProtocolForRouting).toBe(true);
    expect(result.current.isReady).toBe(true);
  });
});
