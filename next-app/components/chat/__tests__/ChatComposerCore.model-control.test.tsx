// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatComposerCore } from "../ChatComposerCore";

vi.mock("@/hooks/useVoiceInput", () => ({
    useVoiceInput: () => ({
        state: "idle",
        error: null,
        elapsedMs: 0,
        visualizerAnalyser: null,
        toggleRecording: vi.fn(),
        stopRecording: vi.fn(),
        clearError: vi.fn(),
    }),
}));

vi.mock("@/app/actions/files", () => ({
    listProjectFilesAction: vi.fn(async () => ({ success: true, data: [] })),
}));

describe("ChatComposerCore model control", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("signals readiness once the textarea is mounted", () => {
        const onReady = vi.fn();
        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                showVoice={false}
                onReady={onReady}
            />,
        );

        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it("sends using the externally controlled selected model", () => {
        const sendMessage = vi.fn();
        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                selectedModel="grok-4.5"
                onModelChange={vi.fn()}
                showVoice={false}
            />,
        );

        const input = screen.getByLabelText("Copilot prompt");
        fireEvent.change(input, { target: { value: "Test message" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(sendMessage).toHaveBeenCalledWith(
            "Test message",
            "overview",
            undefined,
            "grok-4.5",
            "general",
            undefined,
            undefined,
            undefined,
        );
    });

    it("does not revive deprecated localStorage model persistence when uncontrolled", () => {
        window.localStorage.setItem("litrev_ai_model", "grok-4.1-fast");
        const sendMessage = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
            />,
        );

        const input = screen.getByLabelText("Copilot prompt");
        fireEvent.change(input, { target: { value: "Test message" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(sendMessage).toHaveBeenCalledWith(
            "Test message",
            "overview",
            undefined,
            "gpt-5.6-luna",
            "general",
            undefined,
            undefined,
            undefined,
        );
    });

    it("exposes controlled reasoning effort and faster delivery independently", async () => {
        const onReasoningEffortChange = vi.fn();
        const onDeliveryModeChange = vi.fn();
        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                selectedModel="gpt-5.6-luna"
                onModelChange={vi.fn()}
                reasoningEffort="medium"
                onReasoningEffortChange={onReasoningEffortChange}
                deliveryMode="standard"
                onDeliveryModeChange={onDeliveryModeChange}
                showVoice={false}
            />,
        );

        fireEvent.pointerDown(screen.getByRole("button", { name: "Reasoning effort: Medium" }));
        fireEvent.click(await screen.findByText("High"));
        expect(onReasoningEffortChange).toHaveBeenCalledWith("high");

        fireEvent.click(screen.getByRole("switch", { name: /faster delivery: off/i }));
        expect(onDeliveryModeChange).toHaveBeenCalledWith("priority");
    });

    it("shows unreadable attachment status and blocks send while the failed PDF is attached", () => {
        const sendMessage = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
                pendingAttachment={{
                    fileAssetId: "file-1",
                    filename: "unreadable.pdf",
                    size: 1024,
                    mimeType: "application/pdf",
                    isExisting: false,
                    extraction: {
                        status: "failed",
                        reason: "pdf_parse_failed",
                        message: "LitRev uploaded the PDF, but could not read usable text from it. Remove it or attach a different PDF.",
                    },
                }}
                clearAttachment={vi.fn()}
            />,
        );

        const input = screen.getByLabelText("Copilot prompt");
        fireEvent.change(input, { target: { value: "Please summarize this" } });
        fireEvent.keyDown(input, { key: "Enter" });

        const sendButton = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
        expect(sendButton.disabled).toBe(true);
        expect(sendMessage).not.toHaveBeenCalled();
        expect(screen.getByText(/could not read usable text from it/i)).toBeTruthy();
    });

    it("keeps an incompatible image attached and blocks non-vision models before send", () => {
        const sendMessage = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                selectedModel="deepseek-v4-flash"
                onModelChange={vi.fn()}
                showVoice={false}
                pendingAttachment={{
                    fileAssetId: "image-1",
                    filename: "figure.png",
                    size: 2048,
                    mimeType: "image/png",
                    isExisting: false,
                    extraction: {
                        status: "ready",
                        mediaKind: "image",
                        text: "",
                    },
                }}
                clearAttachment={vi.fn()}
            />,
        );

        const input = screen.getByLabelText("Copilot prompt");
        fireEvent.change(input, { target: { value: "Interpret this figure" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
        expect(sendMessage).not.toHaveBeenCalled();
        expect(screen.getByText(/cannot read images/i)).toBeTruthy();
        expect(screen.getByText("figure.png")).toBeTruthy();
    });

    it("allows sending after a readiness transport failure and still exposes retry", () => {
        const sendMessage = vi.fn();
        const onRetryModelAvailability = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                selectedModel="gpt-5.6-luna"
                onModelChange={vi.fn()}
                modelAvailability={{ "gpt-5.6-luna": true }}
                modelAvailabilityStatus="error"
                onRetryModelAvailability={onRetryModelAvailability}
                showVoice={false}
            />,
        );

        fireEvent.change(screen.getByLabelText("Copilot prompt"), { target: { value: "Test" } });
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(onRetryModelAvailability).toHaveBeenCalledTimes(1);
        expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);

        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it("keeps explicitly unavailable models blocked after a readiness error", () => {
        const sendMessage = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                selectedModel="gpt-5.6-luna"
                onModelChange={vi.fn()}
                modelAvailability={{ "gpt-5.6-luna": false }}
                modelAvailabilityStatus="error"
                showVoice={false}
            />,
        );

        fireEvent.change(screen.getByLabelText("Copilot prompt"), { target: { value: "Test" } });

        expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it("keeps ask-user overlay hidden by default to avoid duplicate rendering", () => {
        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                showVoice={false}
                pendingUserInput={{
                    callId: "ask-1",
                    question: "Do you want to continue?",
                    questionType: "yes_no",
                }}
            />,
        );

        expect(screen.queryByText("Do you want to continue?")).toBeNull();
    });

    it("can delegate mobile model selection to an external header", () => {
        const { container } = render(
            <ChatComposerCore
                page="ai"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                selectedModel="gpt-5.6-luna"
                onModelChange={vi.fn()}
                showVoice={false}
                hideModelControl
                compactMobileChrome
            />,
        );

        expect(screen.queryByRole("button", { name: /gpt/i })).toBeNull();
        expect(container.querySelector('form[data-mobile-chrome="minimal"]')).toBeTruthy();
    });

    it("focuses the textarea when the mobile composer surface is clicked", () => {
        const { container } = render(
            <ChatComposerCore
                page="ai"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                showVoice={false}
                compactMobileChrome
            />,
        );

        const textarea = screen.getByLabelText("Copilot prompt");
        const composer = container.querySelector('form[data-mobile-chrome="minimal"]');
        expect(composer).toBeTruthy();

        fireEvent.click(composer as HTMLFormElement);

        expect(document.activeElement).toBe(textarea);
    });
});
