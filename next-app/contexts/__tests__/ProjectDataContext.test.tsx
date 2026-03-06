// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ProjectDataProvider } from "../ProjectDataContext";
import { useProjectData } from "@/hooks/useProjectData";
import { createDefaultProtocolData } from "@/types/protocol";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetProtocol = vi.fn();
const mockSaveProtocol = vi.fn();
const mockListStudies = vi.fn();
const mockGetDraft = vi.fn();
const mockListNotesIndex = vi.fn();
const mockGetProjectMemories = vi.fn();
let projectDataChangedListener: ((detail: {
    projectId: string;
    domains: string[];
    source?: string;
    protocolPatch?: unknown;
}) => void) | null = null;

vi.mock("@/app/actions/protocols", () => ({
    getProtocolAction: (...args: unknown[]) => mockGetProtocol(...args),
    saveProtocolAction: (...args: unknown[]) => mockSaveProtocol(...args),
}));
vi.mock("@/app/actions/ledger", () => ({
    listStudiesAction: (...args: unknown[]) => mockListStudies(...args),
}));
vi.mock("@/app/actions/drafts", () => ({
    getDraftAction: (...args: unknown[]) => mockGetDraft(...args),
}));
vi.mock("@/app/actions/notes", () => ({
    listNotesIndexAction: (...args: unknown[]) => mockListNotesIndex(...args),
}));
vi.mock("@/app/actions/memory", () => ({
    getProjectMemoriesAction: (...args: unknown[]) => mockGetProjectMemories(...args),
}));
vi.mock("@/lib/network-aware", () => ({
    shouldSkipPreload: vi.fn(() => false),
}));
vi.mock("@/lib/project-data-events", () => ({
    addProjectDataChangedListener: vi.fn((listener: typeof projectDataChangedListener) => {
        projectDataChangedListener = listener;
        return () => {
            if (projectDataChangedListener === listener) {
                projectDataChangedListener = null;
            }
        };
    }),
}));
const mockSeedProject = vi.fn();
vi.mock("@/contexts/LedgerContext", () => ({
    useLedger: () => ({
        seedProject: mockSeedProject,
        ensureProjectLoaded: vi.fn(),
    }),
}));

// Polyfill requestIdleCallback for jsdom
if (typeof globalThis.requestIdleCallback === "undefined") {
    globalThis.requestIdleCallback = ((cb: () => void) => setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
}

const PROJECT_ID = "proj_123";
const FULL_PROTOCOL = {
    ...createDefaultProtocolData(),
    researchQuestion: "RQ1",
};

function wrapper({ children }: { children: ReactNode }) {
    return <ProjectDataProvider projectId={PROJECT_ID}>{children}</ProjectDataProvider>;
}

function setupSuccessMocks() {
    mockGetProtocol.mockResolvedValue({ success: true, data: FULL_PROTOCOL });
    mockSaveProtocol.mockResolvedValue({ success: true, data: FULL_PROTOCOL });
    mockListStudies.mockResolvedValue({ success: true, data: [{ id: "s1", title: "Study 1" }] });
    mockGetDraft.mockResolvedValue({ success: true, data: { sections: [] } });
    mockListNotesIndex.mockResolvedValue({ success: true, data: [{ id: "n1", title: "Note 1" }] });
    mockGetProjectMemories.mockResolvedValue({ success: true, data: [{ id: "m1", statement: "Memory 1" }] });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ProjectDataContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        projectDataChangedListener = null;
        window.localStorage.clear();
        setupSuccessMocks();
    });

    it("fetches protocol first, then studies after it settles", async () => {
        const callOrder: string[] = [];
        mockGetProtocol.mockImplementation(async () => {
            callOrder.push("protocol");
            return { success: true, data: FULL_PROTOCOL };
        });
        mockListStudies.mockImplementation(async () => {
            callOrder.push("studies");
            return { success: true, data: [] };
        });

        renderHook(() => useProjectData(), { wrapper });

        await waitFor(() => {
            expect(callOrder).toContain("protocol");
            expect(callOrder).toContain("studies");
        });

        const protocolIdx = callOrder.indexOf("protocol");
        const studiesIdx = callOrder.indexOf("studies");
        expect(protocolIdx).toBeLessThan(studiesIdx);
    });

    it("sets protocol state to ready after successful fetch", async () => {
        const { result } = renderHook(() => useProjectData(), { wrapper });

        await waitFor(() => {
            expect(result.current.protocol.state).toBe("ready");
        });
        expect(result.current.protocol.data).toEqual(FULL_PROTOCOL);
    });

    it("warmDomain is a no-op when state is ready", async () => {
        const { result } = renderHook(() => useProjectData(), { wrapper });

        await waitFor(() => {
            expect(result.current.protocol.state).toBe("ready");
        });

        const callCount = mockGetProtocol.mock.calls.length;
        act(() => {
            result.current.warmDomain("protocol");
        });
        // Should not have triggered another fetch
        expect(mockGetProtocol.mock.calls.length).toBe(callCount);
    });

    it("warmDomain triggers fetch when state is idle", async () => {
        // Only let protocol auto-load; keep notes idle by making network "slow"
        const { shouldSkipPreload } = await import("@/lib/network-aware");
        vi.mocked(shouldSkipPreload).mockReturnValue(true);

        const { result } = renderHook(() => useProjectData(), { wrapper });

        // Wait for protocol to load (always loads even with skip)
        await waitFor(() => {
            expect(result.current.protocol.state).toBe("ready");
        });

        // Notes should still be idle (skipped due to slow network)
        expect(result.current.notesList.state).toBe("idle");

        // Manually warm notes
        act(() => {
            result.current.warmDomain("notes");
        });

        await waitFor(() => {
            expect(result.current.notesList.state).toBe("ready");
        });
        expect(mockListNotesIndex).toHaveBeenCalledWith(PROJECT_ID);
    });

    it("invalidateDomain forces a re-fetch even when ready", async () => {
        const { result } = renderHook(() => useProjectData(), { wrapper });

        await waitFor(() => {
            expect(result.current.protocol.state).toBe("ready");
        });

        const callCount = mockGetProtocol.mock.calls.length;
        await act(async () => {
            result.current.invalidateDomain("protocol");
        });
        await waitFor(() => {
            expect(mockGetProtocol.mock.calls.length).toBe(callCount + 1);
            expect(result.current.protocol.state).toBe("ready");
        });
    });

    it("handles fetch errors gracefully", async () => {
        mockGetProtocol.mockResolvedValue({ success: false, error: "Not found" });

        const { result } = renderHook(() => useProjectData(), { wrapper });

        await waitFor(() => {
            expect(result.current.protocol.state).toBe("error");
        });
        expect(result.current.protocol.error).toBe("Not found");
    });

    it("applies accepted protocol patches immediately without a refetch", async () => {
        const { result } = renderHook(() => useProjectData(), { wrapper });

        await waitFor(() => {
            expect(result.current.protocol.state).toBe("ready");
        });

        const beforeCalls = mockGetProtocol.mock.calls.length;

        act(() => {
            projectDataChangedListener?.({
                projectId: PROJECT_ID,
                domains: ["protocol"],
                source: "artifact_review",
                protocolPatch: {
                    type: "protocol_suggestion",
                    fieldPath: "researchQuestion",
                    fieldLabel: "Research Question",
                    value: "Updated from copilot",
                    sourceLabel: "Copilot protocol update",
                    affectedPaths: ["researchQuestion"],
                },
            });
        });

        expect(result.current.protocol.data).toEqual({
            ...FULL_PROTOCOL,
            researchQuestion: "Updated from copilot",
        });
        expect(result.current.protocol.saveState).toBe("saved");
        expect(mockGetProtocol.mock.calls.length).toBe(beforeCalls);
    });
});
