// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopilotInputCore } from "../CopilotInputCore";

const mockVoiceState = {
    state: "idle" as "idle" | "recording" | "transcribing",
    error: null as string | null,
    elapsedMs: 0,
    visualizerAnalyser: null as AnalyserNode | null,
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
        mockVoiceState.visualizerAnalyser = null;
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

    it("keeps model and voice outside the secondary actions flow", () => {
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

        expect(screen.getByRole("button", { name: /voice input/i })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /attach file/i })).toBeNull();
        expect(screen.getByText(/gpt-5.2/i)).toBeTruthy();
    });

    it("renders waveform recording state and disables send while recording", () => {
        mockVoiceState.state = "recording";
        mockVoiceState.elapsedMs = 11_000;
        mockVoiceState.visualizerAnalyser = {
            fftSize: 256,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(138),
        } as unknown as AnalyserNode;

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

        expect(screen.getByRole("button", { name: /stop recording/i })).toBeTruthy();
        expect(screen.getByText("0:11")).toBeTruthy();
        expect(screen.getByTestId("voice-level-visualizer")).toBeTruthy();
        expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(true);
    });

    it("keeps the frozen recorded duration visible during transcribing without a live visualizer", () => {
        mockVoiceState.state = "transcribing";
        mockVoiceState.elapsedMs = 7_000;

        render(
            <CopilotInputCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
            />,
        );

        expect(screen.getByText(/transcribing audio/i)).toBeTruthy();
        expect(screen.getByText("0:07")).toBeTruthy();
        expect(screen.queryByTestId("voice-level-visualizer")).toBeNull();
    });
});
