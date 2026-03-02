/**
 * Tests for Langfuse Observability Adapter (Phase 9)
 * Covers no-op behavior, arg summarization, and span interface.
 */

import { describe, it, expect } from "vitest";

// tracing.ts uses "server-only" which is mocked globally in vitest.setup.ts
import {
    NOOP_SPAN,
    isTracingEnabled,
    summarizeArgs,
    startRunTrace,
    startLLMGeneration,
    startToolSpan,
    startContextSpan,
    flushTracing,
} from "@/lib/server/ai/tracing";

describe("Langfuse tracing adapter", () => {
    // ── No-op behavior (env vars not set) ─────────────────────────────────

    describe("when tracing is disabled (no env vars)", () => {
        it("isTracingEnabled() returns false", () => {
            expect(isTracingEnabled()).toBe(false);
        });

        it("startRunTrace returns a no-op span", () => {
            const span = startRunTrace("run-1", {
                projectId: "proj-1",
                agentMode: "general",
                model: "gpt-5.2",
                userId: "user-1",
                conversationId: "conv-1",
            });
            expect(span).toBeDefined();
            expect(span.end).toBeInstanceOf(Function);
            expect(span.update).toBeInstanceOf(Function);
        });

        it("startLLMGeneration returns a no-op span", () => {
            const span = startLLMGeneration(NOOP_SPAN, "llm-call-0", {
                model: "gpt-5.2",
                inputMessageCount: 5,
                toolCount: 3,
            });
            expect(span).toBeDefined();
            expect(span.end).toBeInstanceOf(Function);
        });

        it("startToolSpan returns a no-op span", () => {
            const span = startToolSpan(NOOP_SPAN, "search_pubmed", { query: "test" });
            expect(span).toBeDefined();
            expect(span.end).toBeInstanceOf(Function);
        });

        it("startContextSpan returns a no-op span", () => {
            const span = startContextSpan(NOOP_SPAN, "context-assembly");
            expect(span).toBeDefined();
            expect(span.end).toBeInstanceOf(Function);
        });

        it("flushTracing resolves without error", async () => {
            await expect(flushTracing()).resolves.toBeUndefined();
        });
    });

    // ── No-op span chaining ───────────────────────────────────────────────

    describe("no-op span chaining", () => {
        it("update() returns the same span (chainable)", () => {
            const result = NOOP_SPAN.update({ foo: "bar" });
            expect(result).toBe(NOOP_SPAN);
        });

        it("chained calls work without error", () => {
            expect(() => {
                NOOP_SPAN.update({ a: 1 }).update({ b: 2 }).end();
            }).not.toThrow();
        });

        it("startObservation returns a no-op span", () => {
            const child = NOOP_SPAN.startObservation("child", { data: true });
            expect(child).toBe(NOOP_SPAN);
        });

        it("updateTrace returns a no-op span", () => {
            const result = NOOP_SPAN.updateTrace({ userId: "u1" });
            expect(result).toBe(NOOP_SPAN);
        });
    });

    // ── Arg summarization ─────────────────────────────────────────────────

    describe("summarizeArgs", () => {
        it("returns key names only by default", () => {
            const result = summarizeArgs({ query: "test", maxResults: 10, filters: { year: 2025 } });
            expect(result).toEqual({ argKeys: ["query", "maxResults", "filters"] });
        });

        it("does not include raw values by default", () => {
            const result = summarizeArgs({ secret: "password123", query: "test" });
            expect(result).toEqual({ argKeys: ["secret", "query"] });
            expect(result).not.toHaveProperty("secret");
            expect(result).not.toHaveProperty("query", "test");
        });

        it("returns full args when LANGFUSE_VERBOSE=1", () => {
            const original = process.env.LANGFUSE_VERBOSE;
            process.env.LANGFUSE_VERBOSE = "1";
            try {
                const args = { query: "cancer", maxResults: 10 };
                const result = summarizeArgs(args);
                expect(result).toEqual(args);
            } finally {
                if (original === undefined) {
                    delete process.env.LANGFUSE_VERBOSE;
                } else {
                    process.env.LANGFUSE_VERBOSE = original;
                }
            }
        });

        it("returns only keys when LANGFUSE_VERBOSE is not 1", () => {
            const original = process.env.LANGFUSE_VERBOSE;
            process.env.LANGFUSE_VERBOSE = "0";
            try {
                const result = summarizeArgs({ query: "test" });
                expect(result).toEqual({ argKeys: ["query"] });
            } finally {
                if (original === undefined) {
                    delete process.env.LANGFUSE_VERBOSE;
                } else {
                    process.env.LANGFUSE_VERBOSE = original;
                }
            }
        });

        it("handles empty args", () => {
            const result = summarizeArgs({});
            expect(result).toEqual({ argKeys: [] });
        });
    });

    // ── TracingSpan interface conformance ──────────────────────────────────

    describe("TracingSpan interface", () => {
        it("all helpers return objects with update, end, startObservation, updateTrace", () => {
            const spans = [
                startRunTrace("r1", { projectId: "p1", agentMode: "general", userId: "u1", conversationId: "c1" }),
                startLLMGeneration(NOOP_SPAN, "gen", { inputMessageCount: 1, toolCount: 0 }),
                startToolSpan(NOOP_SPAN, "tool", {}),
                startContextSpan(NOOP_SPAN, "ctx"),
            ];

            for (const span of spans) {
                expect(span.update).toBeInstanceOf(Function);
                expect(span.end).toBeInstanceOf(Function);
                expect(span.startObservation).toBeInstanceOf(Function);
                expect(span.updateTrace).toBeInstanceOf(Function);
            }
        });

        it("nested startObservation returns TracingSpan", () => {
            const parent = startRunTrace("r1", { projectId: "p1", agentMode: "general", userId: "u1", conversationId: "c1" });
            const child = parent.startObservation("child-span", { data: true });
            expect(child.update).toBeInstanceOf(Function);
            expect(child.end).toBeInstanceOf(Function);
            expect(child.startObservation).toBeInstanceOf(Function);
        });
    });
});
