import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunRecoveryResponse } from "@/types/ai";
import {
    getRunRecoveryPollDelayMs,
    pollRunRecovery,
    RUN_RECOVERY_ABSOLUTE_TIMEOUT_MS,
    RUN_RECOVERY_INACTIVITY_TIMEOUT_MS,
} from "@/lib/ai/run-recovery-client";

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

    it("allows the server's missed-heartbeat reconciliation window before timing out", () => {
        expect(RUN_RECOVERY_INACTIVITY_TIMEOUT_MS).toBe(60_000);
        expect(RUN_RECOVERY_ABSOLUTE_TIMEOUT_MS).toBe(180_000);
    });

    it("backs off after the initial rapid reconnect window", () => {
        expect(getRunRecoveryPollDelayMs(1)).toBe(1_000);
        expect(getRunRecoveryPollDelayMs(5)).toBe(1_000);
        expect(getRunRecoveryPollDelayMs(6)).toBe(2_000);
        expect(getRunRecoveryPollDelayMs(15)).toBe(2_000);
        expect(getRunRecoveryPollDelayMs(16)).toBe(5_000);
        expect(getRunRecoveryPollDelayMs(100)).toBe(5_000);
    });

    it("uses the progressive schedule while polling", async () => {
        const sleeps: number[] = [];
        let fetchCount = 0;
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
            fetchCount += 1;
            const terminal = fetchCount === 17;
            return Promise.resolve(new Response(JSON.stringify({
                ...reconnectResponse(),
                ...(terminal ? {
                    runStatus: "completed",
                    isActive: false,
                    recoveryRecommendation: "terminal",
                    terminalEvent: {
                        chunk: { type: "run_end", runId: "run-1", runStatus: "completed" },
                    },
                } : {}),
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }));
        }));

        await expect(pollRunRecovery({
            conversationId: "conv-1",
            runId: "run-1",
            inactivityTimeoutMs: 60_000,
            absoluteTimeoutMs: 180_000,
            sleep: async (ms) => {
                sleeps.push(ms);
            },
            onReplay: vi.fn(),
            onTerminal: vi.fn(),
        })).resolves.toMatchObject({ outcome: "recovered" });

        expect(sleeps).toEqual([
            1_000, 1_000, 1_000, 1_000, 1_000,
            2_000, 2_000, 2_000, 2_000, 2_000,
            2_000, 2_000, 2_000, 2_000, 2_000,
            5_000,
        ]);
    });

    it("uses the bounded 60-second inactivity window by default", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
        let settled = false;
        const resultPromise = pollRunRecovery({
            conversationId: "conv-1",
            runId: "run-1",
            onReplay: vi.fn(),
            onTerminal: vi.fn(),
        }).then((result) => {
            settled = true;
            return result;
        });

        await vi.advanceTimersByTimeAsync(45_000);
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(15_000);
        await expect(resultPromise).resolves.toMatchObject({ outcome: "timeout" });
    });

    it("keeps polling beyond 60 seconds while server heartbeats advance", async () => {
        vi.useFakeTimers();
        const baseMs = new Date("2026-07-13T10:00:00.000Z").getTime();
        vi.setSystemTime(baseMs);
        const onTerminal = vi.fn();
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
            const elapsedMs = Date.now() - baseMs;
            const lastActivityAt = new Date(
                baseMs + Math.floor(elapsedMs / 15_000) * 15_000,
            ).toISOString();
            const terminal = elapsedMs >= 75_000;
            return Promise.resolve(new Response(JSON.stringify({
                ...reconnectResponse(),
                lastActivityAt,
                ...(terminal ? {
                    runStatus: "completed",
                    isActive: false,
                    recoveryRecommendation: "terminal",
                    terminalEvent: {
                        chunk: {
                            type: "run_end",
                            runId: "run-1",
                            runStatus: "completed",
                        },
                    },
                } : {}),
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }));
        }));

        const resultPromise = pollRunRecovery({
            conversationId: "conv-1",
            runId: "run-1",
            onReplay: vi.fn(),
            onTerminal,
        });

        await vi.advanceTimersByTimeAsync(80_000);
        await expect(resultPromise).resolves.toMatchObject({ outcome: "recovered" });
        expect(onTerminal).toHaveBeenCalledTimes(1);
    });

    it("enforces an absolute cap even when activity advances continuously", async () => {
        vi.useFakeTimers();
        const baseMs = new Date("2026-07-13T10:00:00.000Z").getTime();
        vi.setSystemTime(baseMs);
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(
            new Response(JSON.stringify({
                ...reconnectResponse(),
                lastActivityAt: new Date(Date.now()).toISOString(),
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        )));

        const resultPromise = pollRunRecovery({
            conversationId: "conv-1",
            runId: "run-1",
            inactivityTimeoutMs: 100,
            absoluteTimeoutMs: 250,
            sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 10)),
            onReplay: vi.fn(),
            onTerminal: vi.fn(),
        });

        await vi.advanceTimersByTimeAsync(250);
        await expect(resultPromise).resolves.toMatchObject({ outcome: "timeout" });
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

    it("preserves a safe continuation recommendation even if a terminal event is also present", async () => {
        const onTerminal = vi.fn();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            ...reconnectResponse(),
            runStatus: "failed",
            isActive: false,
            recoveryRecommendation: "continue_from_durable_state",
            terminalEvent: {
                chunk: {
                    type: "run_end",
                    runId: "run-1",
                    runStatus: "failed",
                },
            },
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })));

        const result = await pollRunRecovery({
            conversationId: "conv-1",
            runId: "run-1",
            timeoutMs: 1_000,
            onReplay: vi.fn(),
            onTerminal,
        });

        expect(result.outcome).toBe("needs_user_action");
        expect(result.response?.recoveryRecommendation).toBe("continue_from_durable_state");
        expect(onTerminal).not.toHaveBeenCalled();
    });

    it("times out a hung replay callback", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            ...reconnectResponse(),
            lastSequence: 1,
            replayableEvents: [{
                sequence: 1,
                chunk: { type: "content", content: "Recovered content" },
            }],
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })));

        const resultPromise = pollRunRecovery({
            conversationId: "conv-1",
            runId: "run-1",
            timeoutMs: 100,
            onReplay: () => new Promise<void>(() => {}),
            onTerminal: vi.fn(),
        });

        await vi.advanceTimersByTimeAsync(100);
        await expect(resultPromise).resolves.toMatchObject({
            outcome: "timeout",
            lastAppliedSequence: -1,
        });
    });

    it("times out a hung terminal callback", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            ...reconnectResponse(),
            runStatus: "completed",
            isActive: false,
            recoveryRecommendation: "terminal",
            terminalEvent: {
                chunk: { type: "run_end", runId: "run-1", runStatus: "completed" },
            },
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })));

        const resultPromise = pollRunRecovery({
            conversationId: "conv-1",
            runId: "run-1",
            timeoutMs: 100,
            onReplay: vi.fn(),
            onTerminal: () => new Promise<void>(() => {}),
        });

        await vi.advanceTimersByTimeAsync(100);
        await expect(resultPromise).resolves.toMatchObject({ outcome: "timeout" });
    });
});
