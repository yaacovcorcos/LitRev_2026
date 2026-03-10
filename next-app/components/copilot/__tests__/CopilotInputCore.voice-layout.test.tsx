// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopilotInputCore } from "../CopilotInputCore";

const mockVoiceState = {
    state: "idle" as "idle" | "recording" | "transcribing",
    error: null as string | null,
    elapsedMs: 0,
    waveformBars: [] as number[],
    toggleRecording: vi.fn(),
    stopRecording: vi.fn(),
    clearError: vi.fn(),
};

vi.mock("@/hooks/useVoiceInput", () => ({
    useVoiceInput: () => mockVoiceState,
}));

vi.mock("@/app/actions/files", () => ({
    listProjectFilesAction: vi.fn(async () => ({ success: true, data: [] })),
}));

describe("CopilotInputCore composer refresh", () => {
    beforeEach(() => {
        mockVoiceState.state = "idle";
        mockVoiceState.error = null;
        mockVoiceState.elapsedMs = 0;
        mockVoiceState.waveformBars = [];
        vi.clearAllMocks();
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        });
    });

    it("shows the secondary-actions trigger while keeping model and voice outside the menu", async () => {
        render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                projectId="proj_1"
                attachFile={vi.fn()}
                attachExistingFile={vi.fn()}
                clearAttachment={vi.fn()}
                onCompress={vi.fn()}
                canCompress={true}
            />,
        );

        expect(await screen.findByRole("button", { name: /more actions/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /voice input/i })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /attach file/i })).toBeNull();
        expect(screen.getByText(/gpt-5.2/i)).toBeTruthy();
    });

    it("renders waveform recording state and disables send while recording", async () => {
        mockVoiceState.state = "recording";
        mockVoiceState.elapsedMs = 11_000;
        mockVoiceState.waveformBars = [0.2, 0.6, 0.4, 0.8];

        render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                projectId="proj_1"
                attachFile={vi.fn()}
                attachExistingFile={vi.fn()}
                clearAttachment={vi.fn()}
            />,
        );

        expect(await screen.findByRole("button", { name: /more actions/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /stop recording/i })).toBeTruthy();
        expect(screen.getByText("0:11")).toBeTruthy();
        expect(document.querySelectorAll('[class*=\"waveformBar\"]').length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(true);
    });
});
