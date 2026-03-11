"use client";

import { useEffect, useMemo, useRef } from "react";
import styles from "./CopilotInput.module.css";

type VoiceLevelVisualizerProps = {
    analyser: AnalyserNode | null;
    isRecording: boolean;
};

const HISTORY_LENGTH = 88;
const HISTORY_ADVANCE_MS = 50;
const REDUCED_FRAME_MS = 1000 / 8;
const SILENCE_DEAD_ZONE = 0.012;
const SILENCE_FLOOR = 0.045;
const ATTACK_FACTOR = 0.38;
const RELEASE_FACTOR = 0.18;
const NORMALIZATION_CEILING = 0.26;
const BAR_GAP = 1.5;
const MIN_BAR_WIDTH = 1;
const MAX_BAR_WIDTH = 1.6;
const QUIET_BAR_THRESHOLD = 0.08;
const QUIET_BAR_AMPLITUDE = 0.7;

export function shouldAdvanceHistory(now: number, lastAdvanceAt: number) {
    return now - lastAdvanceAt >= HISTORY_ADVANCE_MS;
}

function getTargetLevel(buffer: Uint8Array): number {
    if (buffer.length === 0) return SILENCE_FLOOR;
    let sumSquares = 0;
    for (let index = 0; index < buffer.length; index += 1) {
        const centered = (buffer[index] - 128) / 128;
        sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    if (!Number.isFinite(rms) || rms <= SILENCE_DEAD_ZONE) {
        return SILENCE_FLOOR;
    }
    const normalized = Math.min(1, (rms - SILENCE_DEAD_ZONE) / (NORMALIZATION_CEILING - SILENCE_DEAD_ZONE));
    return Math.max(SILENCE_FLOOR, normalized);
}

function smoothLevel(previous: number, target: number): number {
    const factor = target > previous ? ATTACK_FACTOR : RELEASE_FACTOR;
    return previous + (target - previous) * factor;
}

function getCanvasMetrics(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 260));
    const height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 30));
    const dpr = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }

    return { width, height, dpr };
}

function getChannelValue(name: string, fallback: string) {
    if (typeof window === "undefined") return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

export function getBarGeometry(width: number, barCount: number) {
    const requestedCount = Math.max(1, barCount);
    const maxVisibleCount = Math.max(1, Math.floor((width + BAR_GAP) / (MIN_BAR_WIDTH + BAR_GAP)));
    const visibleCount = Math.min(requestedCount, maxVisibleCount);
    const computedWidth = (width - BAR_GAP * (visibleCount - 1)) / visibleCount;
    const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(MIN_BAR_WIDTH, computedWidth));
    const contentWidth = barWidth * visibleCount + BAR_GAP * (visibleCount - 1);
    const offsetX = Math.max(0, (width - contentWidth) / 2);
    return { barWidth, gap: BAR_GAP, offsetX, visibleCount };
}

function drawBars(canvas: HTMLCanvasElement, history: number[], contrast: string) {
    const context = canvas.getContext("2d");
    if (!context) return;

    const { width, height, dpr } = getCanvasMetrics(canvas);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(dpr, dpr);

    const centerY = height / 2;
    const { barWidth, gap, offsetX, visibleCount } = getBarGeometry(width, history.length);
    const visibleHistory = history.slice(-visibleCount);
    const barCount = visibleHistory.length;
    const maxAmplitude = Math.max(6, height / 2 - 3);

    context.fillStyle = `rgba(${contrast}, 0.78)`;
    for (let index = 0; index < barCount; index += 1) {
        const value = visibleHistory[index] ?? SILENCE_FLOOR;
        const amplitude = value <= QUIET_BAR_THRESHOLD
            ? QUIET_BAR_AMPLITUDE
            : Math.max(1.25, value * maxAmplitude);
        const x = offsetX + index * (barWidth + gap);
        const y = centerY - amplitude;
        const barHeight = amplitude * 2;
        const radius = Math.min(barWidth / 2, 999);
        context.beginPath();
        context.roundRect(x, y, barWidth, barHeight, radius);
        context.fill();
    }
}

export function VoiceLevelVisualizer({ analyser, isRecording }: VoiceLevelVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const historyRef = useRef<number[]>(Array.from({ length: HISTORY_LENGTH }, () => SILENCE_FLOOR));
    const reducedMotionRef = useRef(false);
    const contrastRef = useRef("38, 38, 38");

    const sampleBuffer = useMemo(() => {
        if (!analyser) return null;
        return new Uint8Array(analyser.fftSize);
    }, [analyser]);

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const apply = () => {
            reducedMotionRef.current = mediaQuery.matches;
        };
        apply();
        mediaQuery.addEventListener?.("change", apply);
        return () => mediaQuery.removeEventListener?.("change", apply);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        contrastRef.current = getChannelValue("--rgb-ui-contrast", "38, 38, 38");
        if (
            !isRecording
            || !analyser
            || !sampleBuffer
            || typeof analyser.getByteTimeDomainData !== "function"
        ) {
            historyRef.current = Array.from({ length: HISTORY_LENGTH }, () => SILENCE_FLOOR);
            drawBars(canvas, historyRef.current, contrastRef.current);
            return;
        }

        let frameId: number | null = null;
        let timeoutId: number | null = null;
        let lastLevel = historyRef.current[historyRef.current.length - 1] ?? SILENCE_FLOOR;
        let lastAdvanceAt = typeof performance !== "undefined" ? performance.now() : Date.now();

        const tick = () => {
            analyser.getByteTimeDomainData(sampleBuffer);
            lastLevel = smoothLevel(lastLevel, getTargetLevel(sampleBuffer));
            historyRef.current[historyRef.current.length - 1] = lastLevel;
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            if (shouldAdvanceHistory(now, lastAdvanceAt)) {
                lastAdvanceAt = now;
                historyRef.current.shift();
                historyRef.current.push(lastLevel);
            }
            drawBars(canvas, historyRef.current, contrastRef.current);

            if (reducedMotionRef.current) {
                timeoutId = window.setTimeout(tick, REDUCED_FRAME_MS);
                return;
            }
            frameId = window.requestAnimationFrame(tick);
        };

        drawBars(canvas, historyRef.current, contrastRef.current);
        tick();

        return () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };
    }, [analyser, isRecording, sampleBuffer]);

    return (
        <div className={styles.visualizerShell} aria-hidden="true">
            <canvas ref={canvasRef} className={styles.visualizerCanvas} data-testid="voice-level-visualizer" />
        </div>
    );
}
