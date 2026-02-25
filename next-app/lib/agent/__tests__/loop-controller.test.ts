import { describe, it, expect, vi } from "vitest";
import { LoopState, hashToolCall, DEFAULT_LOOP_BUDGET, DOOM_LOOP_THRESHOLD } from "../loop-controller";

describe("hashToolCall", () => {
    it("produces the same hash for identical calls", () => {
        const h1 = hashToolCall("search_pubmed", { query: "RCTs", maxResults: 10 });
        const h2 = hashToolCall("search_pubmed", { query: "RCTs", maxResults: 10 });
        expect(h1).toBe(h2);
    });

    it("produces the same hash regardless of key order", () => {
        const h1 = hashToolCall("search_pubmed", { query: "RCTs", maxResults: 10 });
        const h2 = hashToolCall("search_pubmed", { maxResults: 10, query: "RCTs" });
        expect(h1).toBe(h2);
    });

    it("produces different hashes for different args", () => {
        const h1 = hashToolCall("search_pubmed", { query: "RCTs" });
        const h2 = hashToolCall("search_pubmed", { query: "cohort" });
        expect(h1).not.toBe(h2);
    });

    it("produces different hashes for different tool names", () => {
        const h1 = hashToolCall("search_pubmed", { query: "RCTs" });
        const h2 = hashToolCall("add_to_ledger", { query: "RCTs" });
        expect(h1).not.toBe(h2);
    });

    it("handles nested objects with stable ordering", () => {
        const h1 = hashToolCall("tool", { a: { z: 1, a: 2 } });
        const h2 = hashToolCall("tool", { a: { a: 2, z: 1 } });
        expect(h1).toBe(h2);
    });

    it("handles arrays deterministically", () => {
        const h1 = hashToolCall("tool", { ids: [1, 2, 3] });
        const h2 = hashToolCall("tool", { ids: [1, 2, 3] });
        expect(h1).toBe(h2);
    });

    it("handles null and undefined args", () => {
        const h1 = hashToolCall("tool", { a: null, b: undefined });
        const h2 = hashToolCall("tool", { b: undefined, a: null });
        expect(h1).toBe(h2);
    });
});

describe("LoopState", () => {
    it("uses default budget when none provided", () => {
        const state = new LoopState();
        expect(state.budget).toEqual(DEFAULT_LOOP_BUDGET);
    });

    it("allows iteration within budget", () => {
        const state = new LoopState({ maxIterations: 3, maxToolCalls: 100 });
        expect(state.shouldContinue()).toEqual({ continue: true });
        expect(state.shouldContinue()).toEqual({ continue: true });
        expect(state.shouldContinue()).toEqual({ continue: true });
        expect(state.shouldContinue()).toEqual({ continue: false, stopReason: "max_iterations" });
    });

    it("stops on tool call budget", () => {
        const state = new LoopState({ maxIterations: 100, maxToolCalls: 2 });
        state.shouldContinue(); // iteration 1
        state.recordToolCalls([
            { name: "a", arguments: { x: 1 } },
            { name: "b", arguments: { x: 2 } },
        ]);
        // 2 tool calls recorded, budget is 2 → next shouldContinue stops
        expect(state.shouldContinue()).toEqual({ continue: false, stopReason: "max_tool_calls" });
    });

    it("detects doom loop after threshold consecutive identical calls", () => {
        const state = new LoopState();
        state.shouldContinue(); // iteration 1
        const repeated1 = state.recordToolCalls([
            { name: "search_pubmed", arguments: { query: "RCTs" } },
        ]);
        expect(repeated1).toBe(false);

        state.shouldContinue(); // iteration 2
        const repeated2 = state.recordToolCalls([
            { name: "search_pubmed", arguments: { query: "RCTs" } },
        ]);
        expect(repeated2).toBe(false);

        for (let i = 3; i <= DOOM_LOOP_THRESHOLD; i += 1) {
            state.shouldContinue();
            const repeated = state.recordToolCalls([
                { name: "search_pubmed", arguments: { query: "RCTs" } },
            ]);
            if (i < DOOM_LOOP_THRESHOLD) {
                expect(repeated).toBe(false);
            } else {
                expect(repeated).toBe(true);
            }
        }

        // Next shouldContinue should stop with repeat_detected
        expect(state.shouldContinue()).toEqual({ continue: false, stopReason: "repeat_detected" });
    });

    it("resets consecutive counter when tool call changes", () => {
        const state = new LoopState();
        state.shouldContinue();
        state.recordToolCalls([{ name: "search_pubmed", arguments: { query: "RCTs" } }]);
        state.shouldContinue();
        state.recordToolCalls([{ name: "search_pubmed", arguments: { query: "cohort studies" } }]);

        for (let i = 0; i < DOOM_LOOP_THRESHOLD - 1; i += 1) {
            state.shouldContinue();
            const repeated = state.recordToolCalls([{ name: "search_pubmed", arguments: { query: "RCTs" } }]);
            expect(repeated).toBe(false);
        }

        expect(state.shouldContinue()).toEqual({ continue: true });
    });

    it("respects AbortSignal", () => {
        const controller = new AbortController();
        const state = new LoopState();
        expect(state.shouldContinue(controller.signal)).toEqual({ continue: true });
        controller.abort();
        expect(state.shouldContinue(controller.signal)).toEqual({ continue: false, stopReason: "cancelled" });
    });

    it("respects wall time budget", () => {
        vi.useFakeTimers();
        try {
            const state = new LoopState({ maxWallTimeMs: 5000, maxIterations: 100, maxToolCalls: 100 });
            expect(state.shouldContinue()).toEqual({ continue: true });
            vi.advanceTimersByTime(6000);
            expect(state.shouldContinue()).toEqual({ continue: false, stopReason: "wall_time" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("markStopped sets the stop reason", () => {
        const state = new LoopState();
        state.markStopped("natural");
        expect(state.stopReason).toBe("natural");
        expect(state.shouldContinue()).toEqual({ continue: false, stopReason: "natural" });
    });

    it("first stop reason wins (cannot be overwritten)", () => {
        const state = new LoopState();
        state.markStopped("natural");
        state.markStopped("error");
        expect(state.stopReason).toBe("natural");
    });

    it("tracks iteration and tool call counts", () => {
        const state = new LoopState();
        state.shouldContinue();
        state.recordToolCalls([{ name: "a", arguments: {} }]);
        state.shouldContinue();
        state.recordToolCalls([{ name: "b", arguments: {} }, { name: "c", arguments: {} }]);
        expect(state.iterations).toBe(2);
        expect(state.totalToolCalls).toBe(3);
    });

    it("stopReason is null initially", () => {
        const state = new LoopState();
        expect(state.stopReason).toBeNull();
    });
});
