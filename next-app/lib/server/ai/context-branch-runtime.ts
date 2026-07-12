import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
import { createAbortError } from "@/lib/abort";

export const DEFAULT_OPTIONAL_CONTEXT_BRANCH_TIMEOUT_MS = 5_000;
export const DEFAULT_CRITICAL_CONTEXT_BRANCH_TIMEOUT_MS = 10_000;

export async function withCriticalContextBranchDeadline<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
        branch?: string;
    },
): Promise<T> {
    const parentSignal = options?.signal;
    if (parentSignal?.aborted) {
        throw createAbortError();
    }

    const timeoutMs = Math.max(1, options?.timeoutMs ?? DEFAULT_CRITICAL_CONTEXT_BRANCH_TIMEOUT_MS);
    const branchController = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let removeAbortListener = () => {};

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
            reject(new AIErrorWithEnvelope({
                kind: "runtime",
                code: "CRITICAL_CONTEXT_BRANCH_TIMEOUT",
                retryable: true,
                source: "runtime",
                message: `Critical context branch "${options?.branch ?? "unknown"}" exceeded ${timeoutMs}ms.`,
            }));
            branchController.abort();
        }, timeoutMs);
        if (typeof (timeout as { unref?: () => void }).unref === "function") {
            (timeout as { unref: () => void }).unref();
        }
    });

    const abortPromise = parentSignal
        ? new Promise<never>((_resolve, reject) => {
            const onAbort = () => {
                reject(createAbortError());
                branchController.abort();
            };
            parentSignal.addEventListener("abort", onAbort, { once: true });
            removeAbortListener = () => parentSignal.removeEventListener("abort", onAbort);
        })
        : null;

    try {
        return await Promise.race([
            operation(branchController.signal),
            timeoutPromise,
            ...(abortPromise ? [abortPromise] : []),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
        removeAbortListener();
    }
}

export async function withOptionalContextBranchDeadline<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
        branch?: string;
    },
): Promise<T> {
    const parentSignal = options?.signal;
    if (parentSignal?.aborted) {
        throw createAbortError();
    }

    const timeoutMs = Math.max(1, options?.timeoutMs ?? DEFAULT_OPTIONAL_CONTEXT_BRANCH_TIMEOUT_MS);
    const branchController = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let removeAbortListener = () => {};

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
            const timeoutError = new AIErrorWithEnvelope({
                kind: "runtime",
                code: "CONTEXT_BRANCH_TIMEOUT",
                retryable: true,
                source: "runtime",
                message: `Optional context branch "${options?.branch ?? "unknown"}" exceeded ${timeoutMs}ms.`,
            });
            // Settle the public deadline with the typed timeout before aborting
            // the cooperative branch. This preserves the timeout classification
            // even when the operation rejects synchronously from its abort hook.
            reject(timeoutError);
            branchController.abort();
        }, timeoutMs);
        if (typeof (timeout as { unref?: () => void }).unref === "function") {
            (timeout as { unref: () => void }).unref();
        }
    });

    const abortPromise = parentSignal
        ? new Promise<never>((_resolve, reject) => {
            const onAbort = () => {
                reject(createAbortError());
                branchController.abort();
            };
            parentSignal.addEventListener("abort", onAbort, { once: true });
            removeAbortListener = () => parentSignal.removeEventListener("abort", onAbort);
        })
        : null;

    try {
        return await Promise.race([
            operation(branchController.signal),
            timeoutPromise,
            ...(abortPromise ? [abortPromise] : []),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
        removeAbortListener();
    }
}
