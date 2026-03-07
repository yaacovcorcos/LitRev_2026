// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
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
        onEscapeKeyDown: _onEscapeKeyDown,
        onInteractOutside: _onInteractOutside,
        ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
        onEscapeKeyDown?: unknown;
        onInteractOutside?: unknown;
    }) => <div {...props}>{children}</div>,
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
            expect(screen.getByText("The response timed out. Please retry.")).toBeTruthy();
        });

        expect(screen.getByText("Retry recommended")).toBeTruthy();
        expect(screen.getAllByText("The response timed out. Please retry.")).toHaveLength(1);
    });
});
