import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunRecoveryResponse } from "@/types/ai";
import { pollRunRecovery } from "@/lib/ai/run-recovery-client";

function reconnectResponse(): RunRecoveryResponse {
    return {
        conversationId: "conv-1",
        runId: "run-1",
        runStatus: "running",
        isActive: true,
        lastActivityAt: "2026-07-12T10:00:00.000Z",
        lastSequence: null,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "reconnect",
    };
}

function poll(overrides: {
    signal?: AbortSignal;
    sleep?: (ms: number) => Promise<void>;
} = {}) {
    return pollRunRecovery({
        conversationId: "conv-1",
        runId: "run-1",
        timeoutMs: 1_000,
        onReplay: vi.fn(),
        onTerminal: vi.fn(),
        ...overrides,
    });
}

describe("pollRunRecovery deadlines", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("times out even when fetch ignores the abort signal", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
        vi.stubGlobal("fetch", fetchMock);

        const resultPromise = poll();
        await vi.advanceTimersByTimeAsync(1_000);

        await expect(resultPromise).resolves.toEqual({
            outcome: "timeout",
            response: null,
            lastAppliedSequence: -1,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("times out even when the injected poll sleep never resolves", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(reconnectResponse()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }));
        vi.stubGlobal("fetch", fetchMock);

        const resultPromise = poll({ sleep: () => new Promise<void>(() => {}) });
        await vi.advanceTimersByTimeAsync(1_000);

        const result = await resultPromise;
        expect(result.outcome).toBe("timeout");
        expect(result.response).toEqual(reconnectResponse());
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("distinguishes caller cancellation from its own deadline", async () => {
        const controller = new AbortController();
        vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

        const resultPromise = poll({ signal: controller.signal });
        controller.abort();

        await expect(resultPromise).resolves.toEqual({
            outcome: "aborted",
            response: null,
            lastAppliedSequence: -1,
        });
    });

    it("classifies offline recovery fetches as retryable instead of rejecting", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

        await expect(poll()).resolves.toEqual({
            outcome: "retry",
            response: null,
            lastAppliedSequence: -1,
        });
    });
});
