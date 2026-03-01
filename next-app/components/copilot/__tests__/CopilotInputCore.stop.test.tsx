// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CopilotInputCore } from "../CopilotInputCore";

const stopRecordingMock = vi.fn();

vi.mock("@/hooks/useVoiceInput", () => ({
    useVoiceInput: () => ({
        state: "idle",
        error: null,
        toggleRecording: vi.fn(),
        stopRecording: stopRecordingMock,
        clearError: vi.fn(),
    }),
}));

vi.mock("@/app/actions/files", () => ({
    listProjectFilesAction: vi.fn(async () => ({ success: true, data: [] })),
}));

describe("CopilotInputCore stop controls", () => {
    it("keeps stop button available while loading even when input has text", () => {
        const cancelStream = vi.fn();
        const sendMessage = vi.fn();
        render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={true}
                sendMessage={sendMessage}
                cancelStream={cancelStream}
                showVoice={false}
            />,
        );

        fireEvent.change(screen.getByLabelText("Copilot prompt"), { target: { value: "follow-up question" } });
        fireEvent.click(screen.getByRole("button", { name: /stop generating/i }));

        expect(cancelStream).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledTimes(0);
    });

    it("stops an active run on Escape", () => {
        const cancelStream = vi.fn();
        render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={true}
                sendMessage={vi.fn()}
                cancelStream={cancelStream}
                showVoice={false}
            />,
        );

        fireEvent.keyDown(screen.getByLabelText("Copilot prompt"), { key: "Escape" });
        expect(cancelStream).toHaveBeenCalledTimes(1);
    });

    it("does not stop when Escape is pressed while idle", () => {
        const cancelStream = vi.fn();
        render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={cancelStream}
                showVoice={false}
            />,
        );

        fireEvent.keyDown(screen.getByLabelText("Copilot prompt"), { key: "Escape" });
        expect(cancelStream).toHaveBeenCalledTimes(0);
        expect(stopRecordingMock).toHaveBeenCalledTimes(0);
    });

    it("allows multiple sends while loading so messages can be queued", async () => {
        const sendMessage = vi.fn();
        render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={true}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
            />,
        );

        const input = screen.getByLabelText("Copilot prompt");

        fireEvent.change(input, { target: { value: "first follow-up" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await Promise.resolve();

        fireEvent.change(input, { target: { value: "second follow-up" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(sendMessage).toHaveBeenCalledTimes(2);
        expect(sendMessage.mock.calls[0][0]).toBe("first follow-up");
        expect(sendMessage.mock.calls[1][0]).toBe("second follow-up");
    });
});
