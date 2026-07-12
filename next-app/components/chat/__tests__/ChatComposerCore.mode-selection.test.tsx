// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

async function openModeMenu() {
    fireEvent.pointerDown(screen.getByRole("button", { name: "Change agent mode" }));
}

describe("ChatComposerCore mode selection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("reserves the mode pill row before the first prompt text appears", () => {
        const { container } = render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                showVoice={false}
            />,
        );

        const slot = container.querySelector('[data-mode-pill-slot="true"]');
        expect(slot?.getAttribute("data-mode-pill-visible")).toBe("false");

        fireEvent.change(screen.getByLabelText("Copilot prompt"), {
            target: { value: "Find studies about diabetes" },
        });

        expect(slot?.getAttribute("data-mode-pill-visible")).toBe("true");
        expect(screen.getByText("General (auto)")).toBeTruthy();
    });

    it("restores input and releases its send lock when async bootstrap reports failure", async () => {
        let resolveFailure!: (value: false) => void;
        const failedSend = new Promise<false>((resolve) => {
            resolveFailure = resolve;
        });
        const sendMessage = vi.fn()
            .mockReturnValueOnce(failedSend)
            .mockResolvedValueOnce(undefined);
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

        const input = screen.getByLabelText("Copilot prompt") as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: "Recover this request" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(input.value).toBe("");

        resolveFailure(false);
        await waitFor(() => expect(input.value).toBe("Recover this request"));

        fireEvent.keyDown(input, { key: "Enter" });
        await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    });

    it("keeps manual mode visible and sticky across sends", async () => {
        const sendMessage = vi.fn();
        const { rerender } = render(
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
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={true}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
            />,
        );
        rerender(
            <ChatComposerCore
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
