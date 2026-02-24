// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStableChatScroll } from "../useStableChatScroll";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a mock container element with controllable scroll geometry. */
function mockContainer(overrides: Partial<Pick<HTMLDivElement, "scrollHeight" | "scrollTop" | "clientHeight">> = {}) {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { value: overrides.scrollHeight ?? 1000, configurable: true });
    Object.defineProperty(el, "scrollTop", { value: overrides.scrollTop ?? 0, writable: true, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: overrides.clientHeight ?? 500, configurable: true });
    return el;
}

/** Flush all pending rAF callbacks (jsdom doesn't run them automatically). */
function flushRAF() {
    vi.advanceTimersByTime(16); // One frame at ~60fps
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useStableChatScroll", () => {
    it("is pinned by default", () => {
        const { result } = renderHook(() => useStableChatScroll());
        expect(result.current.isPinned).toBe(true);
    });

    it("notifyContentChanged schedules scroll when pinned", () => {
        const { result } = renderHook(() => useStableChatScroll());

        // Create a sentinel and wire it up
        const sentinel = document.createElement("div");
        const scrollIntoViewSpy = vi.fn();
        sentinel.scrollIntoView = scrollIntoViewSpy;

        // Access bottomRef and set it
        (result.current.bottomRef as React.MutableRefObject<HTMLDivElement | null>).current = sentinel;

        act(() => { result.current.notifyContentChanged(); });
        expect(scrollIntoViewSpy).not.toHaveBeenCalled(); // rAF not yet flushed

        act(() => { flushRAF(); });
        expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: "end", behavior: "auto" });
    });

    it("user scroll-up un-pins (distance > 24px)", () => {
        const { result } = renderHook(() => useStableChatScroll());

        // Wire up a container that is scrolled up
        const el = mockContainer({ scrollHeight: 1000, scrollTop: 0, clientHeight: 500 });
        act(() => { result.current.containerRef(el); });

        // Simulate scroll event
        act(() => { result.current.onScroll(); });
        expect(result.current.isPinned).toBe(false);
    });

    it("user scroll-to-bottom re-pins", () => {
        const { result } = renderHook(() => useStableChatScroll());

        // Wire up a container scrolled up
        const el = mockContainer({ scrollHeight: 1000, scrollTop: 0, clientHeight: 500 });
        act(() => { result.current.containerRef(el); });

        // Un-pin by scrolling up
        act(() => { result.current.onScroll(); });
        expect(result.current.isPinned).toBe(false);

        // Scroll to bottom
        Object.defineProperty(el, "scrollTop", { value: 500, writable: true, configurable: true });
        act(() => { result.current.onScroll(); });
        expect(result.current.isPinned).toBe(true);
    });

    it("notifyConversationChanged resets to pinned and is Strict Mode safe (same ID = no-op)", () => {
        const { result } = renderHook(() => useStableChatScroll());

        const sentinel = document.createElement("div");
        const scrollIntoViewSpy = vi.fn();
        sentinel.scrollIntoView = scrollIntoViewSpy;
        (result.current.bottomRef as React.MutableRefObject<HTMLDivElement | null>).current = sentinel;

        // First call: should fire
        act(() => { result.current.notifyConversationChanged("conv-1"); });
        act(() => { flushRAF(); });
        expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
        expect(result.current.isPinned).toBe(true);

        // Same ID again (Strict Mode double-fire): should be a no-op
        scrollIntoViewSpy.mockClear();
        act(() => { result.current.notifyConversationChanged("conv-1"); });
        act(() => { flushRAF(); });
        expect(scrollIntoViewSpy).not.toHaveBeenCalled();

        // Different ID: should fire
        act(() => { result.current.notifyConversationChanged("conv-2"); });
        act(() => { flushRAF(); });
        expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    });

    it("notifyStreamStart scrolls if already pinned, no-op if scrolled up", () => {
        const { result } = renderHook(() => useStableChatScroll());

        const sentinel = document.createElement("div");
        const scrollIntoViewSpy = vi.fn();
        sentinel.scrollIntoView = scrollIntoViewSpy;
        (result.current.bottomRef as React.MutableRefObject<HTMLDivElement | null>).current = sentinel;

        // Pinned: should schedule scroll
        act(() => { result.current.notifyStreamStart(); });
        act(() => { flushRAF(); });
        expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

        // Scroll up to un-pin
        const el = mockContainer({ scrollHeight: 1000, scrollTop: 0, clientHeight: 500 });
        act(() => { result.current.containerRef(el); });
        act(() => { result.current.onScroll(); });
        expect(result.current.isPinned).toBe(false);

        // Un-pinned: notifyStreamStart should NOT scroll
        scrollIntoViewSpy.mockClear();
        act(() => { result.current.notifyStreamStart(); });
        act(() => { flushRAF(); });
        expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    });

    it("rAF coalescing — multiple notifyContentChanged calls result in single scrollIntoView", () => {
        const { result } = renderHook(() => useStableChatScroll());

        const sentinel = document.createElement("div");
        const scrollIntoViewSpy = vi.fn();
        sentinel.scrollIntoView = scrollIntoViewSpy;
        (result.current.bottomRef as React.MutableRefObject<HTMLDivElement | null>).current = sentinel;

        // Fire multiple content changes before frame
        act(() => {
            result.current.notifyContentChanged();
            result.current.notifyContentChanged();
            result.current.notifyContentChanged();
        });

        act(() => { flushRAF(); });
        expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    });

    it("scrollToBottom re-pins and scrolls immediately", () => {
        const { result } = renderHook(() => useStableChatScroll());

        // Un-pin first
        const el = mockContainer({ scrollHeight: 1000, scrollTop: 0, clientHeight: 500 });
        act(() => { result.current.containerRef(el); });
        act(() => { result.current.onScroll(); });
        expect(result.current.isPinned).toBe(false);

        // scrollToBottom should re-pin
        const sentinel = document.createElement("div");
        const scrollIntoViewSpy = vi.fn();
        sentinel.scrollIntoView = scrollIntoViewSpy;
        (result.current.bottomRef as React.MutableRefObject<HTMLDivElement | null>).current = sentinel;

        act(() => { result.current.scrollToBottom(); });
        expect(result.current.isPinned).toBe(true);
        expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: "end", behavior: "auto" });
    });

    it("callback ref re-binds ResizeObserver on container swap", () => {
        // Track ResizeObserver instances
        const observedElements: Element[][] = [];
        const disconnectCalls: number[] = [];
        let instanceCount = 0;

        const OriginalRO = globalThis.ResizeObserver;
        globalThis.ResizeObserver = class MockRO {
            private idx: number;
            constructor(public cb: ResizeObserverCallback) {
                this.idx = instanceCount++;
                observedElements[this.idx] = [];
            }
            observe(el: Element) { observedElements[this.idx]?.push(el); }
            unobserve() {}
            disconnect() { disconnectCalls.push(this.idx); }
        } as unknown as typeof ResizeObserver;

        try {
            const { result } = renderHook(() => useStableChatScroll());

            // First container
            const el1 = document.createElement("div");
            const child1 = document.createElement("div");
            el1.appendChild(child1);
            act(() => { result.current.containerRef(el1); });

            const firstRoIdx = instanceCount - 1;
            expect(observedElements[firstRoIdx]).toContain(child1);

            // Swap container
            const el2 = document.createElement("div");
            const child2 = document.createElement("div");
            el2.appendChild(child2);
            act(() => { result.current.containerRef(el2); });

            // First observer should have been disconnected
            expect(disconnectCalls).toContain(firstRoIdx);
            // Second observer should observe child2
            const secondRoIdx = instanceCount - 1;
            expect(observedElements[secondRoIdx]).toContain(child2);
        } finally {
            globalThis.ResizeObserver = OriginalRO;
        }
    });

    it("notifyContentChanged does not recreate ResizeObserver when content root is unchanged", () => {
        let instanceCount = 0;
        const disconnectCalls: number[] = [];

        const OriginalRO = globalThis.ResizeObserver;
        globalThis.ResizeObserver = class MockRO {
            private idx: number;
            constructor() {
                this.idx = instanceCount++;
            }
            observe() {}
            unobserve() {}
            disconnect() { disconnectCalls.push(this.idx); }
        } as unknown as typeof ResizeObserver;

        try {
            const { result } = renderHook(() => useStableChatScroll());
            const container = document.createElement("div");
            container.appendChild(document.createElement("div"));

            act(() => { result.current.containerRef(container); });
            expect(instanceCount).toBe(1);

            act(() => { result.current.notifyContentChanged(); });
            act(() => { result.current.notifyContentChanged(); });
            expect(instanceCount).toBe(1);
            expect(disconnectCalls).toHaveLength(0);
        } finally {
            globalThis.ResizeObserver = OriginalRO;
        }
    });

    it("prepend-preserve: capturePrependAnchor + restorePrependAnchor maintains viewport offset", () => {
        const { result } = renderHook(() => useStableChatScroll());

        const el = document.createElement("div");
        const firstChild = document.createElement("div");
        el.appendChild(firstChild);

        // Make scrollTop writable
        let currentScrollTop = 100;
        Object.defineProperty(el, "scrollTop", {
            get: () => currentScrollTop,
            set: (v: number) => { currentScrollTop = v; },
            configurable: true,
        });

        act(() => { result.current.containerRef(el); });

        // Mock getBoundingClientRect for the anchor element
        const originalTop = 50;
        firstChild.getBoundingClientRect = () => ({ top: originalTop, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });

        act(() => { result.current.capturePrependAnchor(); });

        // Simulate prepend: anchor shifted down by 200px
        const newTop = 250;
        firstChild.getBoundingClientRect = () => ({ top: newTop, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });

        act(() => { result.current.restorePrependAnchor(); });

        // scrollTop should have been adjusted by the delta (250 - 50 = 200)
        expect(currentScrollTop).toBe(300); // 100 + 200
    });

    it("cleanup: rAF cancelled on unmount", () => {
        const cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame");

        const { result, unmount } = renderHook(() => useStableChatScroll());

        const sentinel = document.createElement("div");
        sentinel.scrollIntoView = vi.fn();
        (result.current.bottomRef as React.MutableRefObject<HTMLDivElement | null>).current = sentinel;

        // Schedule a scroll (rAF pending)
        act(() => { result.current.notifyContentChanged(); });

        // Unmount — should cancel pending rAF
        unmount();

        expect(cancelSpy).toHaveBeenCalled();
        cancelSpy.mockRestore();
    });
});
