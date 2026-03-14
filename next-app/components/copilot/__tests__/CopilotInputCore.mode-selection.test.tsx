// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopilotInputCore } from "../CopilotInputCore";

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

async function openModeMenu() {
    fireEvent.pointerDown(screen.getByRole("button", { name: "Change agent mode" }));
}

describe("CopilotInputCore mode selection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("keeps manual mode visible and sticky across sends", async () => {
        const sendMessage = vi.fn();
        const { rerender } = render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
            />,
        );

        const input = screen.getByLabelText("Copilot prompt");
        fireEvent.change(input, { target: { value: "Find studies about diabetes" } });
        await openModeMenu();
        fireEvent.click(await screen.findByText("Protocol"));
        fireEvent.keyDown(input, { key: "Enter" });

        expect(sendMessage).toHaveBeenNthCalledWith(
            1,
            "Find studies about diabetes",
            "overview",
            undefined,
            "gpt-5.2",
            "protocol",
            undefined,
            undefined,
            undefined,
        );
        expect(screen.getByText("Protocol (manual)")).toBeTruthy();

        rerender(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={true}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
            />,
        );
        rerender(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
            />,
        );

        const refreshedInput = screen.getByLabelText("Copilot prompt");
        fireEvent.change(refreshedInput, { target: { value: "Second message" } });
        fireEvent.keyDown(refreshedInput, { key: "Enter" });

        expect(sendMessage).toHaveBeenNthCalledWith(
            2,
            "Second message",
            "overview",
            undefined,
            "gpt-5.2",
            "protocol",
            undefined,
            undefined,
            undefined,
        );
    });

    it("returns to router-driven behavior when Auto is selected", async () => {
        const sendMessage = vi.fn();
        render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
            />,
        );

        const input = screen.getByLabelText("Copilot prompt");
        fireEvent.change(input, { target: { value: "Find studies about diabetes" } });
        await openModeMenu();
        fireEvent.click(await screen.findByText("Protocol"));
        await openModeMenu();
        fireEvent.click(await screen.findByText("Auto"));
        fireEvent.keyDown(input, { key: "Enter" });

        expect(sendMessage).toHaveBeenCalledWith(
            "Find studies about diabetes",
            "overview",
            undefined,
            "gpt-5.2",
            "search",
            undefined,
            undefined,
            undefined,
        );
        expect(screen.queryByText("Protocol (manual)")).toBeNull();
    });
});
