// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceLevelVisualizer, getBarGeometry, shouldAdvanceHistory } from "../VoiceLevelVisualizer";

type FakeContext = {
    setTransform: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
    scale: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
    roundRect: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    strokeStyle: string;
    fillStyle: string;
    lineWidth: number;
};

function makeFakeAnalyser(): AnalyserNode {
    return {
        fftSize: 256,
        getByteTimeDomainData: (buffer: Uint8Array) => {
            for (let index = 0; index < buffer.length; index += 1) {
                buffer[index] = index % 3 === 0 ? 148 : 132;
            }
        },
    } as unknown as AnalyserNode;
}

describe("VoiceLevelVisualizer", () => {
    let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
    let cancelAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
    let fakeContext: FakeContext;

    beforeEach(() => {
        fakeContext = {
            setTransform: vi.fn(),
            clearRect: vi.fn(),
            scale: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            roundRect: vi.fn(),
            fill: vi.fn(),
            strokeStyle: "",
            fillStyle: "",
            lineWidth: 1,
        };

        Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
            configurable: true,
            value: vi.fn(() => fakeContext),
        });
        Object.defineProperty(HTMLCanvasElement.prototype, "getBoundingClientRect", {
            configurable: true,
            value: vi.fn(() => ({ width: 260, height: 30 })),
        });

        requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
        cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

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

    afterEach(() => {
        requestAnimationFrameSpy.mockRestore();
        cancelAnimationFrameSpy.mockRestore();
    });

    it("advances visible history on a slower cadence than the draw loop", () => {
        expect(shouldAdvanceHistory(49, 0)).toBe(false);
        expect(shouldAdvanceHistory(50, 0)).toBe(true);
    });

    it("caps bar width and centers the denser strip geometry", () => {
        const geometry = getBarGeometry(260, 88);

        expect(geometry.barWidth).toBeLessThanOrEqual(1.6);
        expect(geometry.barWidth).toBeGreaterThanOrEqual(1);
        expect(geometry.offsetX).toBeGreaterThanOrEqual(0);
        expect(geometry.gap).toBe(1.5);
        expect(geometry.visibleCount).toBe(88);
    });

    it("keeps the newest samples visible on narrow canvases", () => {
        const geometry = getBarGeometry(120, 88);

        expect(geometry.visibleCount).toBeLessThan(88);
        expect(geometry.barWidth).toBeGreaterThanOrEqual(1);
        expect(geometry.offsetX).toBeGreaterThanOrEqual(0);
    });

    it("renders a canvas visualizer and drives drawing with requestAnimationFrame in normal mode", () => {
        render(<VoiceLevelVisualizer analyser={makeFakeAnalyser()} isRecording={true} />);

        expect(screen.getByTestId("voice-level-visualizer")).toBeTruthy();
        expect(fakeContext.roundRect).toHaveBeenCalled();
        expect(fakeContext.lineTo).not.toHaveBeenCalled();
        expect(fakeContext.stroke).not.toHaveBeenCalled();
        expect(requestAnimationFrameSpy).toHaveBeenCalled();
    });

    it("avoids requestAnimationFrame in reduced-motion mode", () => {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: query === "(prefers-reduced-motion: reduce)",
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        });

        render(<VoiceLevelVisualizer analyser={makeFakeAnalyser()} isRecording={true} />);

        expect(screen.getByTestId("voice-level-visualizer")).toBeTruthy();
        expect(fakeContext.roundRect).toHaveBeenCalled();
        expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    });
});
