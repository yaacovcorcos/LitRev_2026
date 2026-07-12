// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceTranscriptionSettlement } from "@/hooks/useVoiceInput";
import { ChatComposerCore } from "../ChatComposerCore";
import type { CopilotPage } from "@/types/ai";

const mockVoiceState = {
    state: "idle" as "idle" | "requesting_permission" | "recording" | "transcribing",
    error: null as string | null,
    elapsedMs: 0,
    visualizerAnalyser: null as AnalyserNode | null,
    toggleRecording: vi.fn(),
    stopRecording: vi.fn(),
    clearError: vi.fn(),
};
let transcriptionHandler: ((text: string) => void) | null = null;
let transcriptionSettledHandler: ((result: VoiceTranscriptionSettlement) => void) | null = null;
let transcriptionAttribution: { page?: CopilotPage; projectId?: string } | undefined;

vi.mock("@/hooks/useVoiceInput", () => ({
    useVoiceInput: (
        onTranscription: (text: string) => void,
        onTranscriptionSettled?: (result: VoiceTranscriptionSettlement) => void,
        attribution?: { page?: CopilotPage; projectId?: string },
    ) => {
        transcriptionHandler = onTranscription;
        transcriptionSettledHandler = onTranscriptionSettled ?? null;
        transcriptionAttribution = attribution;
        return mockVoiceState;
    },
}));

vi.mock("@/app/actions/files", () => ({
    listProjectFilesAction: vi.fn(async () => ({ success: true, data: [] })),
}));

describe("ChatComposerCore composer refresh", () => {
    beforeEach(() => {
        mockVoiceState.state = "idle";
        mockVoiceState.error = null;
        mockVoiceState.elapsedMs = 0;
        mockVoiceState.visualizerAnalyser = null;
        transcriptionHandler = null;
        transcriptionSettledHandler = null;
        transcriptionAttribution = undefined;
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
            <ChatComposerCore
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
        expect(screen.getByText(/gpt-5.6 luna/i)).toBeTruthy();
        expect(transcriptionAttribution).toEqual({
            page: "overview",
            projectId: "proj_1",
        });
    });

    it("renders waveform recording state with separate stop and transcribe/send actions", () => {
        mockVoiceState.state = "recording";
        mockVoiceState.elapsedMs = 11_000;
        mockVoiceState.visualizerAnalyser = {
            fftSize: 256,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(138),
        } as unknown as AnalyserNode;

        render(
            <ChatComposerCore
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

        expect(screen.getByRole("button", { name: /stop dictation/i })).toBeTruthy();
        expect(screen.getByText("0:11")).toBeTruthy();
        expect(screen.getByTestId("voice-level-visualizer")).toBeTruthy();
        expect(screen.getByRole("button", { name: /transcribe and send/i }).hasAttribute("disabled")).toBe(false);
    });

    it("renders a permission-pending state without a waveform", () => {
        mockVoiceState.state = "requesting_permission";

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
            />,
        );

        expect(screen.getAllByText(/waiting for microphone permission/i).length).toBeGreaterThan(0);
        expect(screen.queryByTestId("voice-level-visualizer")).toBeNull();
        expect(screen.getByRole("button", { name: /waiting for microphone permission/i }).hasAttribute("disabled")).toBe(true);
        expect(screen.getByRole("button", { name: /^send$/i }).hasAttribute("disabled")).toBe(true);
    });

    it("keeps the frozen recorded duration visible during transcribing without a live visualizer", () => {
        mockVoiceState.state = "transcribing";
        mockVoiceState.elapsedMs = 7_000;

        const { container } = render(
            <ChatComposerCore
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
        expect(container.querySelectorAll('[class*="transcribingDot"]:not([class*="transcribingDots"])').length).toBe(3);
    });

    it("stops dictation without auto-sending when the recording button is clicked", () => {
        mockVoiceState.state = "recording";
        mockVoiceState.visualizerAnalyser = {
            fftSize: 256,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(138),
        } as unknown as AnalyserNode;
        const sendMessage = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /stop dictation/i }));

        expect(mockVoiceState.stopRecording).toHaveBeenCalledTimes(1);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it("queues auto-send while recording and sends the appended transcript when it settles", async () => {
        mockVoiceState.state = "recording";
        mockVoiceState.visualizerAnalyser = {
            fftSize: 256,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(138),
        } as unknown as AnalyserNode;
        const sendMessage = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByRole("textbox", { name: /copilot prompt/i }), {
            target: { value: "Existing draft" },
        });
        fireEvent.click(screen.getByRole("button", { name: /transcribe and send/i }));

        expect(mockVoiceState.stopRecording).toHaveBeenCalledTimes(1);
        expect(sendMessage).not.toHaveBeenCalled();

        await act(async () => {
            transcriptionHandler?.("new transcript");
        });

        expect(sendMessage).toHaveBeenCalledWith(
            "Existing draft new transcript",
            "overview",
            undefined,
            "gpt-5.6-luna",
            "drafting",
            undefined,
            undefined,
            undefined,
        );
    });

    it("sends the existing draft on an empty successful transcript when auto-send was queued", async () => {
        mockVoiceState.state = "recording";
        mockVoiceState.visualizerAnalyser = {
            fftSize: 256,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(138),
        } as unknown as AnalyserNode;
        const sendMessage = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByRole("textbox", { name: /copilot prompt/i }), {
            target: { value: "Existing draft" },
        });
        fireEvent.click(screen.getByRole("button", { name: /transcribe and send/i }));

        await act(async () => {
            transcriptionSettledHandler?.({ status: "success", text: null });
        });

        expect(sendMessage).toHaveBeenCalledWith(
            "Existing draft",
            "overview",
            undefined,
            "gpt-5.6-luna",
            "drafting",
            undefined,
            undefined,
            undefined,
        );
    });

    it("does not auto-send after a failed recording settlement", async () => {
        mockVoiceState.state = "recording";
        mockVoiceState.visualizerAnalyser = {
            fftSize: 256,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(138),
        } as unknown as AnalyserNode;
        const sendMessage = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /transcribe and send/i }));

        await act(async () => {
            transcriptionSettledHandler?.({ status: "error", message: "Transcription failed" });
        });

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it("shows transcribing-and-sending copy once queued send reaches the transcribing state", () => {
        const sendMessage = vi.fn();
        const view = render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
            />,
        );

        mockVoiceState.state = "recording";
        mockVoiceState.visualizerAnalyser = {
            fftSize: 256,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(138),
        } as unknown as AnalyserNode;
        view.rerender(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /transcribe and send/i }));

        mockVoiceState.state = "transcribing";
        mockVoiceState.elapsedMs = 7_000;
        mockVoiceState.visualizerAnalyser = null;
        view.rerender(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
            />,
        );

        expect(screen.getAllByText(/transcribing and sending/i).length).toBeGreaterThan(0);
        expect(screen.getByText("0:07")).toBeTruthy();
    });

    it("shows local recording hints for the stop and send controls", () => {
        mockVoiceState.state = "recording";
        mockVoiceState.visualizerAnalyser = {
            fftSize: 256,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(138),
        } as unknown as AnalyserNode;

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
            />,
        );

        fireEvent.mouseEnter(screen.getByRole("button", { name: /stop dictation/i }));
        expect(screen.getByRole("tooltip").textContent).toContain("Stop dictation");

        fireEvent.mouseEnter(screen.getByRole("button", { name: /transcribe and send/i }));
        expect(screen.getByRole("tooltip").textContent).toContain("Transcribe and send");
    });
});
