"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type VoiceInputState = "idle" | "requesting_permission" | "recording" | "transcribing";
export type VoiceTranscriptionSettlement =
    | { status: "success"; text: string | null }
    | { status: "too_short" }
    | { status: "error"; message: string }
    | { status: "aborted" };

type AudioRuntime = {
    audioContext: AudioContext;
    analyser: AnalyserNode;
    source: MediaStreamAudioSourceNode;
};

const ELAPSED_UPDATE_MS = 250;

export function useVoiceInput(
    onTranscription: (text: string) => void,
    onTranscriptionSettled?: (result: VoiceTranscriptionSettlement) => void,
) {
    const [state, setState] = useState<VoiceInputState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [visualizerAnalyser, setVisualizerAnalyser] = useState<AnalyserNode | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const audioRuntimeRef = useRef<AudioRuntime | null>(null);
    const transcriptionAbortRef = useRef<AbortController | null>(null);
    const elapsedIntervalRef = useRef<number | null>(null);
    const recordingStartedAtRef = useRef<number | null>(null);
    const frozenElapsedRef = useRef(0);

    const stopElapsedTracking = useCallback(() => {
        if (elapsedIntervalRef.current !== null) {
            window.clearInterval(elapsedIntervalRef.current);
            elapsedIntervalRef.current = null;
        }
    }, []);

    const resetElapsedTracking = useCallback(() => {
        stopElapsedTracking();
        recordingStartedAtRef.current = null;
        frozenElapsedRef.current = 0;
        setElapsedMs(0);
    }, [stopElapsedTracking]);

    const startElapsedTracking = useCallback(() => {
        recordingStartedAtRef.current = Date.now();
        frozenElapsedRef.current = 0;
        setElapsedMs(0);
        stopElapsedTracking();
        elapsedIntervalRef.current = window.setInterval(() => {
            if (recordingStartedAtRef.current === null) return;
            setElapsedMs(Math.max(0, Date.now() - recordingStartedAtRef.current));
        }, ELAPSED_UPDATE_MS);
    }, [stopElapsedTracking]);

    const freezeElapsedTracking = useCallback(() => {
        if (recordingStartedAtRef.current !== null) {
            frozenElapsedRef.current = Math.max(0, Date.now() - recordingStartedAtRef.current);
            setElapsedMs(frozenElapsedRef.current);
        }
        stopElapsedTracking();
        recordingStartedAtRef.current = null;
    }, [stopElapsedTracking]);

    const stopAudioRuntime = useCallback(async (skipStateReset = false) => {
        const runtime = audioRuntimeRef.current;
        audioRuntimeRef.current = null;
        if (!skipStateReset) {
            setVisualizerAnalyser(null);
        }
        if (!runtime) return;
        runtime.source.disconnect();
        try {
            await runtime.audioContext.close();
        } catch {
            // Ignore close failures during teardown.
        }
    }, []);

    const stopMediaTracks = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    const startAudioRuntime = useCallback((stream: MediaStream) => {
        const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) {
            setVisualizerAnalyser(null);
            return;
        }
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        audioRuntimeRef.current = { audioContext, analyser, source };
        setVisualizerAnalyser(analyser);
    }, []);

    const finalizeRecording = useCallback(async (mediaRecorder: MediaRecorder) => {
        stopMediaTracks();
        await stopAudioRuntime();
        freezeElapsedTracking();

        const recorderMime = mediaRecorder.mimeType || "audio/webm";
        const ext = recorderMime.includes("webm") ? "webm" : "mp4";
        const blob = new Blob(chunksRef.current, { type: recorderMime });
        chunksRef.current = [];

        if (blob.size < 1000) {
            setError("Recording was too short. Try speaking a little longer.");
            onTranscriptionSettled?.({ status: "too_short" });
            setState("idle");
            resetElapsedTracking();
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
            const trimmedText = typeof text === "string" ? text.trim() : "";
            if (trimmedText) {
                onTranscription(trimmedText);
            }
            onTranscriptionSettled?.({ status: "success", text: trimmedText || null });
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                onTranscriptionSettled?.({ status: "aborted" });
                return;
            }
            const msg = err instanceof Error ? err.message : "Transcription failed";
            setError(msg);
            onTranscriptionSettled?.({ status: "error", message: msg });
            console.error("Transcription error:", err);
        } finally {
            transcriptionAbortRef.current = null;
            setState("idle");
            resetElapsedTracking();
        }
    }, [
        freezeElapsedTracking,
        onTranscription,
        onTranscriptionSettled,
        resetElapsedTracking,
        stopAudioRuntime,
        stopMediaTracks,
    ]);

    const startRecording = useCallback(async () => {
        setError(null);
        resetElapsedTracking();
        setState("requesting_permission");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            startAudioRuntime(stream);

            const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""].find(
                (t) => t === "" || MediaRecorder.isTypeSupported(t),
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

            mediaRecorder.onstop = () => {
                void finalizeRecording(mediaRecorder);
            };

            mediaRecorder.start(1000);
            startElapsedTracking();
            setState("recording");
        } catch (err) {
            stopMediaTracks();
            await stopAudioRuntime();
            resetElapsedTracking();
            setState("idle");
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                setError("Microphone access denied. Please allow mic access in browser settings.");
            } else {
                setError("Could not access microphone.");
            }
            console.error("getUserMedia error:", err);
        }
    }, [finalizeRecording, resetElapsedTracking, startAudioRuntime, startElapsedTracking, stopAudioRuntime, stopMediaTracks]);

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
            stopElapsedTracking();
            stopMediaTracks();
            void stopAudioRuntime(true);
        };
    }, [stopAudioRuntime, stopElapsedTracking, stopMediaTracks]);

    return { state, error, elapsedMs, visualizerAnalyser, toggleRecording, stopRecording, clearError };
}
