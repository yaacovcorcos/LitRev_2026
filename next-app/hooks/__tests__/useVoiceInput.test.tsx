// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceInput } from "../useVoiceInput";

type TrackMock = { stop: ReturnType<typeof vi.fn> };

describe("useVoiceInput", () => {
    let track: TrackMock;
    let audioContextClose: ReturnType<typeof vi.fn>;
    let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
    let getUserMediaMock: ReturnType<typeof vi.fn>;
    let fetchMock: ReturnType<typeof vi.fn>;
    let recordingBlobSize = 1600;

    class MediaRecorderMock {
        static isTypeSupported = vi.fn(() => true);
        state = "inactive";
        mimeType = "audio/webm";
        ondataavailable: ((event: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
            this.state = "recording";
            this.ondataavailable?.({ data: new Blob(["a".repeat(recordingBlobSize)], { type: this.mimeType }) });
        }

        stop() {
            this.state = "inactive";
            this.onstop?.();
        }
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));
        recordingBlobSize = 1600;

        track = { stop: vi.fn() };
        getUserMediaMock = vi.fn(async () => ({ getTracks: () => [track] }));
        Object.defineProperty(globalThis.navigator, "mediaDevices", {
            configurable: true,
            value: { getUserMedia: getUserMediaMock },
        });

        audioContextClose = vi.fn(async () => undefined);
        class AudioContextMock {
            createAnalyser() {
                return {
                    fftSize: 256,
                    smoothingTimeConstant: 0,
                    getByteTimeDomainData: vi.fn(),
                };
            }
            createMediaStreamSource() {
                return { connect: vi.fn(), disconnect: vi.fn() };
            }
            close = audioContextClose;
        }
        Object.defineProperty(window, "AudioContext", {
            configurable: true,
            value: AudioContextMock,
        });

        Object.defineProperty(globalThis, "MediaRecorder", {
            configurable: true,
            value: MediaRecorderMock,
        });

        requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
        fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ text: "transcribed text" }),
        }));
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        requestAnimationFrameSpy.mockRestore();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("removes waveformBars from the contract, exposes analyser while recording, and does not use requestAnimationFrame", async () => {
        const onTranscription = vi.fn();
        const { result } = renderHook(() => useVoiceInput(onTranscription));

        await act(async () => {
            result.current.toggleRecording();
            await Promise.resolve();
        });

        expect("waveformBars" in result.current).toBe(false);
        expect(result.current.state).toBe("recording");
        expect(result.current.visualizerAnalyser).toBeTruthy();
        expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(249);
        });
        expect(result.current.elapsedMs).toBe(0);

        await act(async () => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current.elapsedMs).toBe(250);
    });

    it("shows requesting_permission before recording starts", async () => {
        let resolveStream: ((value: { getTracks: () => TrackMock[] }) => void) | null = null;
        getUserMediaMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveStream = resolve;
                }),
        );

        const { result } = renderHook(() => useVoiceInput(vi.fn()));

        await act(async () => {
            result.current.toggleRecording();
            await Promise.resolve();
        });

        expect(result.current.state).toBe("requesting_permission");
        expect(result.current.visualizerAnalyser).toBeNull();

        await act(async () => {
            resolveStream?.({ getTracks: () => [track] });
            await Promise.resolve();
        });

        expect(result.current.state).toBe("recording");
        expect(result.current.visualizerAnalyser).toBeTruthy();
    });

    it("returns to idle with an error when microphone permission is denied", async () => {
        getUserMediaMock.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));

        const { result } = renderHook(() => useVoiceInput(vi.fn()));

        await act(async () => {
            result.current.toggleRecording();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.state).toBe("idle");
        expect(result.current.error).toMatch(/microphone access denied/i);
    });

    it("freezes the recorded duration during transcribing and resets after completion", async () => {
        let resolveFetch: ((value: unknown) => void) | null = null;
        fetchMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveFetch = resolve;
                }),
        );

        const onTranscription = vi.fn();
        const onTranscriptionSettled = vi.fn();
        const { result } = renderHook(() => useVoiceInput(onTranscription, onTranscriptionSettled));

        await act(async () => {
            result.current.toggleRecording();
            await Promise.resolve();
        });

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.elapsedMs).toBe(1000);

        await act(async () => {
            result.current.stopRecording();
            await Promise.resolve();
        });

        expect(result.current.state).toBe("transcribing");
        expect(result.current.visualizerAnalyser).toBeNull();
        expect(result.current.elapsedMs).toBe(1000);

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.elapsedMs).toBe(1000);

        await act(async () => {
            resolveFetch?.({
                ok: true,
                json: async () => ({ text: "done" }),
            });
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.state).toBe("idle");
        expect(result.current.elapsedMs).toBe(0);
        expect(onTranscription).toHaveBeenCalledWith("done");
        expect(onTranscriptionSettled).toHaveBeenCalledWith({ status: "success", text: "done" });
        expect(onTranscription.mock.invocationCallOrder[0]).toBeLessThan(
            onTranscriptionSettled.mock.invocationCallOrder[0],
        );
    });

    it("shows a short-recording error and skips transcription for tiny blobs", async () => {
        recordingBlobSize = 10;
        const onTranscriptionSettled = vi.fn();
        const { result } = renderHook(() => useVoiceInput(vi.fn(), onTranscriptionSettled));

        await act(async () => {
            result.current.toggleRecording();
            await Promise.resolve();
        });

        await act(async () => {
            result.current.stopRecording();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.current.state).toBe("idle");
        expect(result.current.error).toMatch(/too short/i);
        expect(onTranscriptionSettled).toHaveBeenCalledWith({ status: "too_short" });
    });

    it("reports aborted transcription through the settlement callback", async () => {
        let abortSignal: AbortSignal | null = null;
        fetchMock.mockImplementation(async (_url, init) => {
            abortSignal = init?.signal ?? null;
            return new Promise((_resolve, reject) => {
                abortSignal?.addEventListener("abort", () => {
                    reject(new DOMException("aborted", "AbortError"));
                });
            });
        });

        const onTranscriptionSettled = vi.fn();
        const { result } = renderHook(() => useVoiceInput(vi.fn(), onTranscriptionSettled));

        await act(async () => {
            result.current.toggleRecording();
            await Promise.resolve();
        });

        await act(async () => {
            result.current.stopRecording();
            await Promise.resolve();
        });

        await act(async () => {
            result.current.stopRecording();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(onTranscriptionSettled).toHaveBeenCalledWith({ status: "aborted" });
        expect(result.current.state).toBe("idle");
    });

    it("releases media tracks and audio runtime on unmount", async () => {
        const { result, unmount } = renderHook(() => useVoiceInput(vi.fn()));

        await act(async () => {
            result.current.toggleRecording();
            await Promise.resolve();
        });

        unmount();

        expect(track.stop).toHaveBeenCalled();
        expect(audioContextClose).toHaveBeenCalled();
    });
});
