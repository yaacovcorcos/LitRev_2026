// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectCopilotProvider, useProjectCopilot } from "../ProjectCopilotContext";
import { createQueuedFollowUp } from "@/lib/ai/queued-followup";

const {
    mockCurrentConversationIdRef,
    mockSendMessage,
} = vi.hoisted(() => ({
    mockCurrentConversationIdRef: { current: "conv-1" as string | null },
    mockSendMessage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
    }),
}));

vi.mock("@/lib/projectCopilotStorage", () => ({
    loadProjectCopilotState: () => ({
        messages: [],
        panel: { collapsed: false, width: 400 },
    }),
    saveProjectCopilotState: vi.fn(),
    createDefaultProjectCopilotState: () => ({
        messages: [],
        panel: { collapsed: false, width: 400 },
    }),
}));

vi.mock("@/app/actions/files", () => ({
    uploadChatAttachmentAction: vi.fn(),
    extractTextFromExistingFileAction: vi.fn(),
}));

vi.mock("@/app/actions/agent", () => ({
    getAutonomyConfigAction: vi.fn(async () => ({
        success: true,
        config: { preset: "assisted", toolOverrides: {} },
    })),
    updateAutonomyAction: vi.fn(),
}));

vi.mock("@/hooks/useCopilotConversations", () => ({
    useCopilotConversations: () => ({
        conversations: [],
        currentConversationId: mockCurrentConversationIdRef.current,
        isLoadingConversations: false,
        showConversationList: false,
        toggleConversationList: vi.fn(),
        selectConversation: vi.fn(),
        newConversation: vi.fn(),
        renameConversation: vi.fn(),
        deleteConversation: vi.fn(),
        branchConversation: vi.fn(),
        loadConversations: vi.fn(),
        setStudyFilter: vi.fn(),
        setCurrentConversationId: vi.fn(),
        summarizeAndRefresh: vi.fn(),
        isSummarizing: false,
        isConversationLoading: false,
        hasMore: false,
        isLoadingOlder: false,
        loadOlderMessages: vi.fn(),
        currentConversationIdRef: mockCurrentConversationIdRef,
    }),
}));

vi.mock("@/hooks/useCopilotStreamActions", () => ({
    useCopilotStreamActions: () => ({
        sendMessage: mockSendMessage,
        cancelStream: vi.fn(),
        handleReviewArtifact: vi.fn(),
        approveArtifactsBatch: vi.fn(),
        executePlan: vi.fn(),
        reconnectRun: vi.fn(),
    }),
}));

vi.mock("@/lib/ai/reasoning-visibility", () => ({
    getReasoningModePreference: () => "full",
    setReasoningModePreference: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
    return (
        <ProjectCopilotProvider projectId="test-project">
            {children}
        </ProjectCopilotProvider>
    );
}

function QueueProbe() {
    const projectCopilot = useProjectCopilot();

    return (
        <div>
            <button
                type="button"
                onClick={() => {
                    projectCopilot.queueQueuedFollowUp(createQueuedFollowUp({
                        text: "Persist until the project changes",
                        conversationId: "conv-2",
                        page: "overview",
                        source: "draft",
                    }));
                }}
            >
                queue scoped follow-up
            </button>
            <span data-testid="queued-text">{projectCopilot.queuedFollowUp?.text ?? ""}</span>
        </div>
    );
}

describe("ProjectCopilot queued follow-up behavior", () => {
    beforeEach(() => {
        window.localStorage.clear();
        mockCurrentConversationIdRef.current = "conv-1";
        mockSendMessage.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("auto-dispatches a queued follow-up once the host is already idle and sendable", async () => {
        const { result } = renderHook(() => useProjectCopilot(), { wrapper });

        await act(async () => {
            result.current.queueQueuedFollowUp(createQueuedFollowUp({
                text: "Find one more trial",
                conversationId: "conv-1",
                page: "overview",
                section: "results",
                model: "gpt-5.2",
                source: "draft",
            }));
        });

        await waitFor(() => {
            expect(mockSendMessage).toHaveBeenCalledWith(
                "Find one more trial",
                "overview",
                "results",
                "gpt-5.2",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
            );
        });

        expect(result.current.queuedFollowUp).toBeNull();
    });

    it("stores and clears queued follow-up state explicitly", async () => {
        const { result } = renderHook(() => useProjectCopilot(), { wrapper });

        await act(async () => {
            result.current.queueQueuedFollowUp(createQueuedFollowUp({
                text: "Clear on switch",
                conversationId: "conv-1",
                page: "overview",
                source: "draft",
            }));
        });

        await waitFor(() => {
            expect(mockSendMessage).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            result.current.queueQueuedFollowUp(createQueuedFollowUp({
                text: "Keep me visible until cleared",
                conversationId: "conv-2",
                page: "overview",
                source: "draft",
            }));
        });

        expect(result.current.queuedFollowUp?.text).toBe("Keep me visible until cleared");

        await act(async () => {
            result.current.clearQueuedFollowUp();
        });

        expect(result.current.queuedFollowUp).toBeNull();
    });

    it("binds an unscoped queued follow-up after the first conversation resolves and dispatches it once idle", async () => {
        mockCurrentConversationIdRef.current = null;
        const { result, rerender } = renderHook(() => useProjectCopilot(), { wrapper });

        await act(async () => {
            result.current.queueQueuedFollowUp(createQueuedFollowUp({
                text: "Queue before the first conversation exists",
                conversationId: null,
                page: "overview",
                source: "draft",
            }));
        });

        expect(result.current.queuedFollowUp?.conversationId).toBeNull();
        expect(mockSendMessage).not.toHaveBeenCalled();

        mockCurrentConversationIdRef.current = "conv-1";
        rerender();

        await waitFor(() => {
            expect(mockSendMessage).toHaveBeenCalledWith(
                "Queue before the first conversation exists",
                "overview",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
            );
        });

        expect(result.current.queuedFollowUp).toBeNull();
    });

    it("clears project-scoped queued follow-up state when the provider project changes", async () => {
        const { rerender } = render(
            <ProjectCopilotProvider projectId="project-a">
                <QueueProbe />
            </ProjectCopilotProvider>
        );

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "queue scoped follow-up" }));
        });
        expect(screen.getByTestId("queued-text").textContent).toBe("Persist until the project changes");

        await act(async () => {
            rerender(
                <ProjectCopilotProvider projectId="project-b">
                    <QueueProbe />
                </ProjectCopilotProvider>
            );
        });

        expect(screen.getByTestId("queued-text").textContent).toBe("");
    });
});
