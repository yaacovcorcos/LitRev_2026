"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type VoiceInputState = "idle" | "recording" | "transcribing";

const EMPTY_WAVEFORM = Array.from({ length: 24 }, () => 0.12);

type WaveformRuntime = {
    audioContext: AudioContext;
    analyser: AnalyserNode;
    source: MediaStreamAudioSourceNode;
    frameId: number | null;
    startedAt: number;
    data: Uint8Array;
};

function chunkValues(values: ArrayLike<number>, buckets: number): number[] {
    if (buckets <= 0) return [];
    const result: number[] = [];
    const bucketSize = Math.max(1, Math.floor(values.length / buckets));

    for (let index = 0; index < buckets; index += 1) {
        const start = index * bucketSize;
        const end = index === buckets - 1 ? values.length : Math.min(values.length, start + bucketSize);
        let sum = 0;
        for (let cursor = start; cursor < end; cursor += 1) {
            sum += values[cursor] ?? 0;
        }
        const average = end > start ? sum / (end - start) : 0;
        const normalized = Math.min(1, Math.max(0.08, average / 255));
        result.push(Number(normalized.toFixed(3)));
    }

    return result;
}

export function useVoiceInput(onTranscription: (text: string) => void) {
    const [state, setState] = useState<VoiceInputState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [waveformBars, setWaveformBars] = useState<number[]>(EMPTY_WAVEFORM);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const waveformRuntimeRef = useRef<WaveformRuntime | null>(null);
    const transcriptionAbortRef = useRef<AbortController | null>(null);

    const resetWaveformState = useCallback(() => {
        setElapsedMs(0);
        setWaveformBars(EMPTY_WAVEFORM);
    }, []);

    const stopWaveformRuntime = useCallback(async () => {
        const runtime = waveformRuntimeRef.current;
        waveformRuntimeRef.current = null;
        if (!runtime) return;
        if (runtime.frameId !== null) {
            window.cancelAnimationFrame(runtime.frameId);
        }
        runtime.source.disconnect();
        await runtime.audioContext.close().catch(() => undefined);
    }, []);

    const stopMediaTracks = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    const startWaveformSampling = useCallback((stream: MediaStream) => {
        const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        const runtime: WaveformRuntime = {
            audioContext,
            analyser,
            source,
            frameId: null,
            startedAt: performance.now(),
            data,
        };

        const sample = () => {
            runtime.analyser.getByteFrequencyData(runtime.data as Uint8Array<ArrayBuffer>);
            setWaveformBars(chunkValues(runtime.data, EMPTY_WAVEFORM.length));
            setElapsedMs(Math.max(0, Math.round(performance.now() - runtime.startedAt)));
            runtime.frameId = window.requestAnimationFrame(sample);
        };

        waveformRuntimeRef.current = runtime;
        sample();
    }, []);

    const startRecording = useCallback(async () => {
        setError(null);
        resetWaveformState();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            startWaveformSampling(stream);

            const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""].find(
                (t) => t === "" || MediaRecorder.isTypeSupported(t)
            )!;

            const mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stopMediaTracks();
                await stopWaveformRuntime();
                const recorderMime = mediaRecorder.mimeType || "audio/webm";
                const ext = recorderMime.includes("webm") ? "webm" : "mp4";
                const blob = new Blob(chunksRef.current, { type: recorderMime });
                chunksRef.current = [];

                if (blob.size < 1000) {
                    setState("idle");
                    resetWaveformState();
                    return;
                }

                setState("transcribing");

                try {
                    const formData = new FormData();
                    formData.append("audio", blob, `recording.${ext}`);
                    formData.append("language", "en");
                    const controller = new AbortController();
                    transcriptionAbortRef.current = controller;

                    const response = await fetch("/api/ai/transcribe", {
                        method: "POST",
                        body: formData,
                        signal: controller.signal,
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || "Transcription failed");
                    }

                    const { text } = await response.json();
                    if (text && text.trim()) {
                        onTranscription(text.trim());
                    }
                } catch (err) {
                    if (err instanceof DOMException && err.name === "AbortError") {
                        return;
                    }
                    const msg = err instanceof Error ? err.message : "Transcription failed";
                    setError(msg);
                    console.error("Transcription error:", err);
                } finally {
                    transcriptionAbortRef.current = null;
                    setState("idle");
                    resetWaveformState();
                }
            };

            mediaRecorder.start(1000);
            setState("recording");
        } catch (err) {
            stopMediaTracks();
            await stopWaveformRuntime();
            resetWaveformState();
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                setError("Microphone access denied. Please allow mic access in browser settings.");
            } else {
                setError("Could not access microphone.");
            }
            console.error("getUserMedia error:", err);
        }
    }, [onTranscription, resetWaveformState, startWaveformSampling, stopMediaTracks, stopWaveformRuntime]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            return;
        }
        transcriptionAbortRef.current?.abort();
    }, []);

    const toggleRecording = useCallback(() => {
        if (state === "recording") {
            stopRecording();
        } else if (state === "idle") {
            void startRecording();
        }
    }, [state, startRecording, stopRecording]);

    const clearError = useCallback(() => setError(null), []);

    useEffect(() => {
        return () => {
            transcriptionAbortRef.current?.abort();
            stopMediaTracks();
            void stopWaveformRuntime();
        };
    }, [stopMediaTracks, stopWaveformRuntime]);

    return { state, error, elapsedMs, waveformBars, toggleRecording, stopRecording, clearError };
}
