import { afterEach, describe, expect, it, vi } from "vitest";
import {
    withCriticalContextBranchDeadline,
    withOptionalContextBranchDeadline,
} from "@/lib/server/ai/context-branch-runtime";

describe("optional context branch deadline", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("bounds an operation that never settles", async () => {
        vi.useFakeTimers();
        const branchSignals: AbortSignal[] = [];
        const pending = withOptionalContextBranchDeadline(
            (signal) => {
                branchSignals.push(signal);
                return new Promise<never>((_resolve, reject) => {
                    signal.addEventListener("abort", () => {
                        reject(new DOMException("branch aborted", "AbortError"));
                    }, { once: true });
                });
            },
            { branch: "memories", timeoutMs: 25 },
        );
        const rejection = expect(pending).rejects.toMatchObject({
            errorCode: "CONTEXT_BRANCH_TIMEOUT",
        });

        await vi.advanceTimersByTimeAsync(25);

        await rejection;
        expect(branchSignals).toHaveLength(1);
        expect(branchSignals[0]?.aborted).toBe(true);
    });

    it("does not start optional work for a pre-cancelled request", async () => {
        const controller = new AbortController();
        controller.abort();
        const operation = vi.fn(async () => "unused");

        await expect(withOptionalContextBranchDeadline(operation, {
            signal: controller.signal,
            branch: "ledger",
        })).rejects.toMatchObject({ name: "AbortError" });

        expect(operation).not.toHaveBeenCalled();
    });

    it("propagates caller cancellation into the branch-owned signal", async () => {
        const controller = new AbortController();
        const branchSignals: AbortSignal[] = [];
        const pending = withOptionalContextBranchDeadline(
            (signal) => {
                branchSignals.push(signal);
                return new Promise<never>((_resolve, reject) => {
                    signal.addEventListener("abort", () => {
                        reject(new DOMException("branch aborted", "AbortError"));
                    }, { once: true });
                });
            },
            { signal: controller.signal, branch: "ledger", timeoutMs: 1_000 },
        );

        controller.abort();

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(branchSignals).toHaveLength(1);
        expect(branchSignals[0]?.aborted).toBe(true);
    });

    it("returns a successful result and clears its deadline", async () => {
        vi.useFakeTimers();

        await expect(withOptionalContextBranchDeadline(
            async () => "ready",
            { branch: "project", timeoutMs: 25 },
        )).resolves.toBe("ready");

        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("critical read context branch deadline", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("fails closed with a typed error when a read never settles", async () => {
        vi.useFakeTimers();
        const branchSignals: AbortSignal[] = [];
        const pending = withCriticalContextBranchDeadline(
            (signal) => {
                branchSignals.push(signal);
                return new Promise<never>(() => {});
            },
            { branch: "conversation", timeoutMs: 25 },
        );
        const rejection = expect(pending).rejects.toMatchObject({
            errorCode: "CRITICAL_CONTEXT_BRANCH_TIMEOUT",
            errorMeta: expect.objectContaining({
                retryable: true,
                source: "runtime",
            }),
        });

        await vi.advanceTimersByTimeAsync(25);

        await rejection;
        expect(branchSignals).toHaveLength(1);
        expect(branchSignals[0]?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("propagates caller cancellation without reclassifying it as a timeout", async () => {
        const caller = new AbortController();
        let branchSignal: AbortSignal | undefined;
        const pending = withCriticalContextBranchDeadline(
            (signal) => {
                branchSignal = signal;
                return new Promise<never>(() => {});
            },
            { branch: "autonomy_config", signal: caller.signal, timeoutMs: 1_000 },
        );

        caller.abort();

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(branchSignal?.aborted).toBe(true);
    });
});
