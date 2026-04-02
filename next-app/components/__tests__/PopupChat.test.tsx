// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
import type { PopupChatContext } from "@/types/popup-chat";
import { PopupChat } from "../PopupChat";

const { mockUsePopupChat, mockUseProjectCopilot, mockProcessAIStream } = vi.hoisted(() => ({
    mockUsePopupChat: vi.fn(),
    mockUseProjectCopilot: vi.fn(),
    mockProcessAIStream: vi.fn(),
}));

vi.mock("@/contexts/PopupChatContext", () => ({
    usePopupChat: mockUsePopupChat,
}));

vi.mock("@/contexts/ProjectCopilotContext", () => ({
    useProjectCopilot: mockUseProjectCopilot,
}));

vi.mock("@/app/actions/notes", () => ({
    createNoteAction: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/app/actions/conversations", () => ({
    createConversation: vi.fn(async () => ({ success: true, data: { id: "conv-1" } })),
    addMessage: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/hooks/useStableChatScroll", () => ({
    useStableChatScroll: () => ({
        containerRef: { current: null },
        bottomRef: { current: null },
        onScroll: vi.fn(),
        notifyContentChanged: vi.fn(),
    }),
}));

vi.mock("@/lib/ai/stream-processor", () => ({
    processAIStream: mockProcessAIStream,
}));

vi.mock("@/lib/ai/reliability-telemetry", () => ({
    recordReliabilityMetric: vi.fn(),
}));

vi.mock("@/lib/mobile/feature-flags", () => ({
    isMobilePopupV2Enabled: () => false,
}));

vi.mock("@/lib/mobile/telemetry", () => ({
    isMobileTelemetryContext: () => false,
    recordMobileMetric: vi.fn(),
}));

vi.mock("@radix-ui/react-dialog", () => ({
    Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
    Overlay: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    Content: ({
        children,
        ...props
    }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    Title: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
    Close: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function createMockReader(): ReadableStreamDefaultReader<Uint8Array> {
    return {
        read: vi.fn(async () => ({ done: true, value: undefined })),
        releaseLock: vi.fn(),
        cancel: vi.fn(async () => undefined),
        closed: Promise.resolve(undefined),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

describe("PopupChat failure handling", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUsePopupChat.mockReturnValue({
            isOpen: true,
            context: {
                type: "protocol_section",
                projectId: "project-1",
                section: "Eligibility",
                currentContent: "Current protocol text",
            },
            closePopupChat: vi.fn(),
        });
        mockUseProjectCopilot.mockReturnValue({
            selectConversation: vi.fn(),
            setCollapsed: vi.fn(),
            refreshConversations: vi.fn(),
        });
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            body: { getReader: () => createMockReader() },
        })));
        vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
    });

    it("annotates the same assistant turn when a deterministic error happens after partial content", async () => {
        mockProcessAIStream.mockImplementationOnce(async ({ onChunk }) => {
            await onChunk({ type: "content", content: "Partial answer" });
            await onChunk({
                type: "error",
                error: "Protocol update failed validation.",
                errorMeta: {
                    kind: "tool_schema_validation",
                    code: "PROTOCOL_MUTATION_VALIDATION_FAILED",
                    retryable: false,
                    source: "tool_validator",
                    message: "Protocol update failed validation.",
                },
            });
            throw new AIErrorWithEnvelope({
                kind: "tool_schema_validation",
                code: "PROTOCOL_MUTATION_VALIDATION_FAILED",
                retryable: false,
                source: "tool_validator",
                message: "Protocol update failed validation.",
            });
        });

        render(<PopupChat projectId="project-1" />);

        fireEvent.change(screen.getByPlaceholderText("Ask a question about Eligibility..."), {
            target: { value: "Update this protocol section" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));

        await waitFor(() => {
            expect(screen.getByText("Protocol update failed validation.")).toBeTruthy();
        });

        expect(screen.getByText("Partial answer")).toBeTruthy();
        expect(screen.getAllByText("Protocol update failed validation.")).toHaveLength(1);
        expect(screen.getByText("Request not completed")).toBeTruthy();
    });

    it("renders popup-supported progress, checkpoints, and blocking clarification from the shared reducer subset", async () => {
        mockProcessAIStream.mockImplementationOnce(async ({ onChunk }) => {
            await onChunk({
                type: "tool_call",
                toolCall: {
                    id: "pubmed-1",
                    name: "search_pubmed",
                    arguments: { query: "\"retrospective cohort\" disposition decision" },
                },
            });
            await onChunk({
                type: "tool_result",
                toolName: "search_pubmed",
                toolResult: {
                    callId: "pubmed-1",
                    result: { totalResults: 18, returnedCount: 6, results: [] },
                },
            });
            await onChunk({
                type: "user_input_required",
                userInputRequest: {
                    callId: "ask-1",
                    question: "Which of these results should I inspect first?",
                    questionType: "single_choice",
                },
            });
            return {
                runStatus: "paused",
                stopReason: "paused_for_input",
                errorMessage: null,
                errorMeta: null,
                conversationId: "conv-1",
                actualModel: null,
                actualModelSource: "unknown",
                terminalReason: "paused_for_input",
            };
        });

        render(<PopupChat projectId="project-1" />);

        fireEvent.change(screen.getByPlaceholderText("Ask a question about Eligibility..."), {
            target: { value: "Search for matching studies" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));

        await waitFor(() => {
            expect(screen.getByText("Waiting for your answer")).toBeTruthy();
        });

        expect(screen.getByText("PubMed returned 18 results. Reviewing the strongest matches now.")).toBeTruthy();
        expect(screen.getByText("Which of these results should I inspect first?")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Continue in Copilot to answer" })).toBeTruthy();
        expect(screen.queryByText("The stream ended unexpectedly. Retry to continue.")).toBeNull();
    });

    it("renders one retryable terminal error message when the stream ends without assistant content", async () => {
        mockProcessAIStream.mockResolvedValueOnce({
            runStatus: "failed",
            stopReason: "error",
            errorMessage: null,
            errorMeta: null,
            conversationId: "conv-1",
            actualModel: null,
            actualModelSource: "unknown",
            terminalReason: "timed_out",
        });

        render(<PopupChat projectId="project-1" />);

        fireEvent.change(screen.getByPlaceholderText("Ask a question about Eligibility..."), {
            target: { value: "Try again" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));

        await waitFor(() => {
            expect(screen.getByText("The response timed out. Retry to continue.")).toBeTruthy();
        });

        expect(screen.getByText("Retry recommended")).toBeTruthy();
        expect(screen.getAllByText("The response timed out. Retry to continue.")).toHaveLength(1);
    });

    it("strips hidden assistant metadata from popup-visible assistant text", async () => {
        mockProcessAIStream.mockImplementationOnce(async ({ onChunk }) => {
            await onChunk({
                type: "content",
                content: 'Visible narrative\n\n<!-- MENTIONED_STUDIES: {"studies":[{"title":"Study","doi":"10.1000/x"}]} -->',
            });
            return {
                runStatus: "completed",
                stopReason: "done",
                errorMessage: null,
                errorMeta: null,
                conversationId: "conv-1",
                actualModel: null,
                actualModelSource: "unknown",
                terminalReason: "completed",
            };
        });

        render(<PopupChat projectId="project-1" />);

        fireEvent.change(screen.getByPlaceholderText("Ask a question about Eligibility..."), {
            target: { value: "Show me the studies" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));

        await waitFor(() => {
            expect(screen.getByText("Visible narrative")).toBeTruthy();
        });

        expect(screen.queryByText(/MENTIONED_STUDIES/i)).toBeNull();
    });

    it("resets popup-local draft input when the popup context identity changes", () => {
        let currentContext: PopupChatContext = {
            type: "protocol_section" as const,
            projectId: "project-1",
            section: "Eligibility",
            currentContent: "Current protocol text",
        };

        mockUsePopupChat.mockImplementation(() => ({
            isOpen: true,
            context: currentContext,
            closePopupChat: vi.fn(),
        }));

        const { rerender } = render(<PopupChat projectId="project-1" />);

        const initialInput = screen.getByPlaceholderText("Ask a question about Eligibility...") as HTMLTextAreaElement;
        fireEvent.change(initialInput, {
            target: { value: "This should be cleared on context switch" },
        });
        expect(initialInput.value).toBe("This should be cleared on context switch");

        currentContext = {
            type: "draft_selection",
            projectId: "project-1",
            section: "Results",
            selectedText: "Highlighted sentence",
        };

        rerender(<PopupChat projectId="project-1" />);

        const nextInput = screen.getByPlaceholderText("Ask a question about Results...") as HTMLTextAreaElement;
        expect(nextInput.value).toBe("");
    });
});
