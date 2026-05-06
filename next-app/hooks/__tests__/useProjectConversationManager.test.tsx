// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectConversationState } from "@/lib/project-conversation-storage";
import { createDefaultProjectConversationState } from "@/lib/project-conversation-storage";
import { useProjectConversationManager } from "../useProjectConversationManager";

const mocks = vi.hoisted(() => ({
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    getConversationMessages: vi.fn(),
    createConversation: vi.fn(),
    archiveConversation: vi.fn(),
    branchConversation: vi.fn(),
    updateConversationTitle: vi.fn(),
    summarizeConversationAction: vi.fn(),
    requestAgentRunCancellation: vi.fn(),
}));

vi.mock("@/app/actions/conversations", () => ({
    listConversations: mocks.listConversations,
    getConversation: mocks.getConversation,
    getConversationMessages: mocks.getConversationMessages,
    createConversation: mocks.createConversation,
    archiveConversation: mocks.archiveConversation,
    branchConversation: mocks.branchConversation,
    updateConversationTitle: mocks.updateConversationTitle,
}));

vi.mock("@/app/actions/summarize-conversation", () => ({
    summarizeConversationAction: mocks.summarizeConversationAction,
}));

vi.mock("@/lib/ai/run-cancel-client", () => ({
    requestAgentRunCancellation: mocks.requestAgentRunCancellation,
}));

vi.mock("@/lib/project-entry-restore", () => ({
    isProjectEntryRestoreEnabled: () => false,
    markConversationActive: vi.fn(),
    decideConversationRestore: vi.fn(() => ({ shouldRestore: false, reason: "no_state" })),
    readProjectEntryState: vi.fn(() => null),
}));

describe("useProjectConversationManager", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listConversations.mockResolvedValue({ success: true, data: [] });
    });

    it("does not reload or clear state when selecting the already-active conversation", async () => {
        const initialState = createDefaultProjectConversationState();
        const stateRef = { current: initialState };
        const updateState = vi.fn((updater: (prev: ProjectConversationState) => ProjectConversationState) => {
            stateRef.current = updater(stateRef.current);
        });

        const { result } = renderHook(() => useProjectConversationManager({
            projectId: "project-1",
            routeConversationId: "conv-active",
            updateState,
            setState: vi.fn(),
            stateRef,
            artifacts: new Map(),
            setArtifacts: vi.fn(),
            streamGenRef: { current: 0 },
            abortControllerRef: { current: null },
            setIsLoading: vi.fn(),
            setCurrentRunId: vi.fn(),
            currentRunId: null,
            setPendingChoices: vi.fn(),
            setPendingUserInput: vi.fn(),
        }));

        await waitFor(() => {
            expect(mocks.listConversations).toHaveBeenCalled();
        });
        vi.clearAllMocks();

        act(() => {
            result.current.setCurrentConversationId("conv-active");
        });

        const selected = await result.current.selectConversation("conv-active");

        expect(selected).toBe(true);
        expect(mocks.getConversation).not.toHaveBeenCalled();
        expect(mocks.requestAgentRunCancellation).not.toHaveBeenCalled();
        expect(updateState).not.toHaveBeenCalled();
    });
});
