import { describe, expect, it, vi } from "vitest";

import type { ToolResult } from "@/types/ai";
import { executeToolReliably } from "@/lib/server/ai/tool-executor";
import type { ToolExecutionRequest } from "@/lib/server/ai/tool-middleware";
import type { ToolReliabilityPolicy } from "@/lib/server/ai/tool-execution-policy";

const request: ToolExecutionRequest = {
    name: "search_pubmed",
    args: { query: "statins" },
    callId: "call-1",
};

const retryPolicy: ToolReliabilityPolicy = {
    attemptTimeoutMs: 1_000,
    maxAttempts: 3,
    minDelayMs: 100,
    maxDelayMs: 2_000,
    jitter: 0,
};

function retryableFailure(headers?: Record<string, string>): ToolResult {
    return {
        callId: request.callId,
        result: null,
        error: "Upstream unavailable",
        errorMeta: {
            kind: "tool_execution",
            code: "TOOL_UPSTREAM_TIMEOUT",
            retryable: true,
            source: "tool_upstream",
            message: "Upstream unavailable",
            headers,
        },
    };
}

describe("reliable tool executor", () => {
    it("retries a retryable read failure and returns the successful attempt", async () => {
        const executor = vi.fn()
            .mockResolvedValueOnce(retryableFailure())
            .mockResolvedValueOnce({ callId: request.callId, result: { ok: true } });
        const sleep = vi.fn(async () => {});
        const onRetry = vi.fn();

        const result = await executeToolReliably(request, executor, {
            policy: retryPolicy,
            random: () => 0.5,
            sleep,
            onRetry,
        });

        expect(result).toMatchObject({ result: { ok: true } });
        expect(executor).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(100, undefined);
        expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
            completedAttempt: 1,
            nextAttempt: 2,
            delayMs: 100,
        }));
    });

    it("honors bounded retry-after timing", async () => {
        const executor = vi.fn()
            .mockResolvedValueOnce(retryableFailure({ "retry-after-ms": "750" }))
            .mockResolvedValueOnce({ callId: request.callId, result: "ok" });
        const sleep = vi.fn(async () => {});

        await executeToolReliably(request, executor, { policy: retryPolicy, sleep });

        expect(sleep).toHaveBeenCalledWith(750, undefined);
    });

    it("does not violate an upstream retry-after longer than its bounded wait", async () => {
        const failure = retryableFailure({ "retry-after-ms": "30000" });
        const executor = vi.fn().mockResolvedValue(failure);
        const sleep = vi.fn(async () => {});

        await expect(executeToolReliably(request, executor, {
            policy: retryPolicy,
            sleep,
        })).resolves.toBe(failure);

        expect(executor).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it("does not retry non-retryable failures", async () => {
        const failure: ToolResult = {
            callId: request.callId,
            result: null,
            error: "Invalid input",
            errorMeta: {
                kind: "tool_schema_validation",
                code: "TOOL_INPUT_VALIDATION_FAILED",
                retryable: false,
                source: "tool_validator",
                message: "Invalid input",
            },
        };
        const executor = vi.fn().mockResolvedValue(failure);

        await expect(executeToolReliably(request, executor, {
            policy: retryPolicy,
        })).resolves.toBe(failure);

        expect(executor).toHaveBeenCalledTimes(1);
    });

    it("never automatically retries mutation tools", async () => {
        const executor = vi.fn().mockResolvedValue(retryableFailure());

        await executeToolReliably({ ...request, name: "update_protocol" }, executor);

        expect(executor).toHaveBeenCalledTimes(1);
    });

    it("returns a typed timeout and aborts cooperative read work", async () => {
        const executor = vi.fn(async (attemptRequest: ToolExecutionRequest) => new Promise<ToolResult>((_resolve, reject) => {
            attemptRequest.context?.signal?.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
            }, { once: true });
        }));

        const result = await executeToolReliably(request, executor, {
            policy: { ...retryPolicy, attemptTimeoutMs: 10, maxAttempts: 1 },
        });

        expect(result.errorMeta).toMatchObject({
            code: "TOOL_EXECUTION_TIMEOUT",
            retryable: true,
            source: "tool_executor",
            status: 408,
        });
        expect(executor.mock.calls[0]?.[0].context?.signal?.aborted).toBe(true);
    });

    it("propagates parent cancellation instead of converting it into a retry", async () => {
        const controller = new AbortController();
        const executor = vi.fn(async () => {
            controller.abort();
            throw new DOMException("Aborted", "AbortError");
        });

        await expect(executeToolReliably({
            ...request,
            context: { signal: controller.signal },
        }, executor, { policy: retryPolicy })).rejects.toMatchObject({ name: "AbortError" });

        expect(executor).toHaveBeenCalledTimes(1);
    });

    it("returns the final typed error after exhausting bounded attempts", async () => {
        const failure = retryableFailure();
        const executor = vi.fn().mockResolvedValue(failure);

        await expect(executeToolReliably(request, executor, {
            policy: { ...retryPolicy, maxAttempts: 2 },
            sleep: vi.fn(async () => {}),
        })).resolves.toBe(failure);

        expect(executor).toHaveBeenCalledTimes(2);
    });
});
