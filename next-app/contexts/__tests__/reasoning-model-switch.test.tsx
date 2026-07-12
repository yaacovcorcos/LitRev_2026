// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { ProjectConversationProvider, useProjectConversation } from "../ProjectConversationContext";

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
    }),
}));

vi.mock("@/lib/project-conversation-storage", () => ({
    loadProjectConversationState: () => ({
        messages: [],
        panel: { collapsed: false, width: 400 },
    }),
    saveProjectConversationState: vi.fn(),
    createDefaultProjectConversationState: () => ({
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

vi.mock("@/hooks/useModelAvailability", () => ({
    useModelAvailability: () => undefined,
}));

vi.mock("@/hooks/useProjectConversationManager", () => ({
    useProjectConversationManager: () => ({
        conversations: [],
        currentConversationId: null,
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
    }),
}));

vi.mock("@/hooks/useProjectConversationStreamActions", () => ({
    useProjectConversationStreamActions: () => ({
        sendMessage: vi.fn(),
        cancelStream: vi.fn(),
        handleReviewArtifact: vi.fn(),
        handleUndoArtifact: vi.fn(),
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
        <ProjectConversationProvider projectId="test-project">
            {children}
        </ProjectConversationProvider>
    );
}

describe("project generation preferences", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("separates compute effort from unsupported visible reasoning", async () => {
        const { result } = renderHook(() => useProjectConversation(), { wrapper });

        expect(result.current.selectedModel).toBe("gpt-5.6-luna");
        expect(result.current.reasoningSupport).toBe("explicit");
        expect(result.current.reasoningVisibilitySupport).toBe("none");

        await act(async () => {
            result.current.setReasoningMode("summary");
            result.current.setSelectedModel("deepseek-v4-pro");
        });

        expect(result.current.selectedModel).toBe("deepseek-v4-pro");
        expect(result.current.reasoningSupport).toBe("explicit");
        expect(result.current.reasoningVisibilitySupport).toBe("none");
        expect(result.current.reasoningMode).toBe("off");
    });

    it("restores a separate saved reasoning effort for each model", async () => {
        const { result } = renderHook(() => useProjectConversation(), { wrapper });

        act(() => result.current.setReasoningEffort("low"));
        act(() => result.current.setSelectedModel("deepseek-v4-pro"));
        expect(result.current.reasoningEffort).toBe("high");

        act(() => result.current.setReasoningEffort("max"));
        act(() => result.current.setSelectedModel("gpt-5.6-luna"));
        expect(result.current.reasoningEffort).toBe("low");

        act(() => result.current.setSelectedModel("deepseek-v4-pro"));
        expect(result.current.reasoningEffort).toBe("max");
    });

    it("overwrites a retired saved model and resets priority delivery", async () => {
        window.localStorage.setItem("litrev_copilot_model", "gpt-5.2");
        const { result } = renderHook(() => useProjectConversation(), { wrapper });

        await waitFor(() => {
            expect(window.localStorage.getItem("litrev_copilot_model")).toBe("gpt-5.6-luna");
        });
        expect(result.current.selectedModel).toBe("gpt-5.6-luna");

        act(() => result.current.setDeliveryMode("priority"));
        expect(result.current.deliveryMode).toBe("priority");
        act(() => result.current.setSelectedModel("gpt-5.6-terra"));
        expect(result.current.deliveryMode).toBe("standard");
    });
});
