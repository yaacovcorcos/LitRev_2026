// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CopilotInputCore } from "../CopilotInputCore";

vi.mock("@/hooks/useVoiceInput", () => ({
    useVoiceInput: () => ({
        state: "idle",
        error: null,
        toggleRecording: vi.fn(),
        stopRecording: vi.fn(),
        clearError: vi.fn(),
    }),
}));

vi.mock("@/app/actions/files", () => ({
    listProjectFilesAction: vi.fn(async () => ({ success: true, data: [] })),
}));

describe("CopilotInputCore model control", () => {
    it("signals readiness once the textarea is mounted", () => {
        const onReady = vi.fn();
        render(
            <CopilotInputCore
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
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                selectedModel="grok-4-1-fast"
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
            "grok-4-1-fast",
            "general",
            undefined,
            undefined,
            undefined,
        );
    });

    it("keeps ask-user overlay hidden by default to avoid duplicate rendering", () => {
        render(
            <CopilotInputCore
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
});
