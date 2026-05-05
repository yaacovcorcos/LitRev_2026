export function createAbortError(message = "Operation aborted"): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException(message, "AbortError");
    }
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

export function isAbortLikeError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const maybe = error as {
        name?: unknown;
        code?: unknown;
    };
    return maybe.name === "AbortError" || maybe.code === "ABORT_ERR";
}

export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw createAbortError();
    }
}

export type LinkedAbortController = {
    signal: AbortSignal;
    dispose: () => void;
};

export function createLinkedAbortController(signals: Array<AbortSignal | undefined | null>): LinkedAbortController {
    const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
    const controller = new AbortController();
    const cleanups: Array<() => void> = [];

    const abort = () => {
        if (!controller.signal.aborted) {
            controller.abort();
        }
    };

    for (const signal of activeSignals) {
        if (signal.aborted) {
            abort();
            continue;
        }
        const onAbort = () => abort();
        signal.addEventListener("abort", onAbort, { once: true });
        cleanups.push(() => signal.removeEventListener("abort", onAbort));
    }

    return {
        signal: controller.signal,
        dispose: () => {
            for (const cleanup of cleanups.splice(0)) {
                cleanup();
            }
        },
    };
}
