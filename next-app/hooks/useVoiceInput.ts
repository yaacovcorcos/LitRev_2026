"use client";

import { useState, useRef, useCallback } from "react";

export type VoiceInputState = "idle" | "recording" | "transcribing";

export function useVoiceInput(onTranscription: (text: string) => void) {
    const [state, setState] = useState<VoiceInputState>("idle");
    const [error, setError] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    const stopMediaTracks = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    const startRecording = useCallback(async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Pick a supported mimeType — browsers vary
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
                const recorderMime = mediaRecorder.mimeType || "audio/webm";
                const ext = recorderMime.includes("webm") ? "webm" : "mp4";
                const blob = new Blob(chunksRef.current, { type: recorderMime });
                chunksRef.current = [];

                if (blob.size < 1000) {
                    setState("idle");
                    return;
                }

                setState("transcribing");

                try {
                    const formData = new FormData();
                    formData.append("audio", blob, `recording.${ext}`);
                    formData.append("language", "en");

                    const response = await fetch("/api/ai/transcribe", {
                        method: "POST",
                        body: formData,
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
                    const msg = err instanceof Error ? err.message : "Transcription failed";
                    setError(msg);
                    console.error("Transcription error:", err);
                } finally {
                    setState("idle");
                }
            };

            mediaRecorder.start(1000);
            setState("recording");
        } catch (err) {
            stopMediaTracks();
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                setError("Microphone access denied. Please allow mic access in browser settings.");
            } else {
                setError("Could not access microphone.");
            }
            console.error("getUserMedia error:", err);
        }
    }, [onTranscription, stopMediaTracks]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    }, []);

    const toggleRecording = useCallback(() => {
        if (state === "recording") {
            stopRecording();
        } else if (state === "idle") {
            startRecording();
        }
    }, [state, startRecording, stopRecording]);

    const clearError = useCallback(() => setError(null), []);

    return { state, error, toggleRecording, clearError };
}
