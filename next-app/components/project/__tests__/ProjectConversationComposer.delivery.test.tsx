// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectConversationComposer } from "../ProjectConversationComposer";

const {
    mockQueueQueuedFollowUp,
    mockConversation,
} = vi.hoisted(() => {
    const queueQueuedFollowUp = vi.fn();
    return {
        mockQueueQueuedFollowUp: queueQueuedFollowUp,
        mockConversation: {
            isLoading: true,
            sendMessage: vi.fn(),
            cancelStream: vi.fn(),
            pendingAttachment: null,
            isAttaching: false,
            attachFile: vi.fn(),
            attachExistingFile: vi.fn(),
            clearAttachment: vi.fn(),
            projectId: "project-1",
            attachedContextTargets: [],
            recentContextHistory: [],
            removeAttachedContextTarget: vi.fn(),
            clearAttachedContextTargets: vi.fn(),
            addAttachedContextTargets: vi.fn(),
            autonomyPreset: "assisted",
            updateAutonomyPreset: vi.fn(),
            setShowAutonomySettings: vi.fn(),
            pendingChoices: [],
            clearChoices: vi.fn(),
            pendingUserInput: null,
            answerUserInput: vi.fn(),
            summarizeAndRefresh: vi.fn(),
            shouldOfferSummary: false,
            isSummarizing: false,
            selectedModel: "gpt-5.6-luna",
            setSelectedModel: vi.fn(),
            reasoningEffort: "medium",
            setReasoningEffort: vi.fn(),
            deliveryMode: "priority",
            deliveryRequestActive: true,
            actualDeliveryMode: "standard",
            setDeliveryMode: vi.fn(),
            modelAvailability: undefined,
            modelAvailabilityStatus: undefined,
            retryModelAvailability: undefined,
            currentConversationId: "conv-1",
            queuedFollowUp: null,
            queueQueuedFollowUp,
        },
    };
});

vi.mock("@/contexts/ProjectConversationContext", () => ({
    useProjectConversation: () => mockConversation,
}));

vi.mock("@/hooks/useProjectState", () => ({
    useProjectState: () => ({ hasProtocolForRouting: true }),
}));

vi.mock("@/components/chat/ChatComposerCoreClient", () => ({
    ChatComposerCoreClient: (props: {
        deliveryMode?: string;
        deliveryRequestActive?: boolean;
        actualDeliveryMode?: string | null;
        onQueueFollowUp?: (payload: {
            text: string;
            page: "overview";
        }) => void;
    }) => (
        <div
            data-testid="project-composer"
            data-delivery-mode={props.deliveryMode}
            data-delivery-request-active={props.deliveryRequestActive ? "yes" : "no"}
            data-actual-delivery-mode={props.actualDeliveryMode ?? "none"}
        >
            <button
                type="button"
                onClick={() => props.onQueueFollowUp?.({ text: "Queue next", page: "overview" })}
            >
                queue next
            </button>
        </div>
    ),
}));

describe("ProjectConversationComposer delivery state", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("forwards active and provider-confirmed delivery truth to main chat and side copilot composers", () => {
        render(
            <ProjectConversationComposer
                page="overview"
                inputPlaceholder="Ask about this project"
            />,
        );

        const composer = screen.getByTestId("project-composer");
        expect(composer.getAttribute("data-delivery-mode")).toBe("priority");
        expect(composer.getAttribute("data-delivery-request-active")).toBe("yes");
        expect(composer.getAttribute("data-actual-delivery-mode")).toBe("standard");

        fireEvent.click(screen.getByRole("button", { name: "queue next" }));
        expect(mockQueueQueuedFollowUp).toHaveBeenCalledWith(expect.objectContaining({
            text: "Queue next",
            deliveryMode: "standard",
        }));
    });
});
