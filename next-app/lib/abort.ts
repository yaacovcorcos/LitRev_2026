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

export type DeadlineAbortController = LinkedAbortController & {
    timedOut(): boolean;
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

export function createDeadlineAbortController(
    timeoutMs: number,
    signals: Array<AbortSignal | undefined | null> = [],
): DeadlineAbortController {
    const linked = createLinkedAbortController(signals);
    const deadlineController = new AbortController();
    let timedOut = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const forwardLinkedAbort = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        deadlineController.abort();
    };
    if (linked.signal.aborted) {
        forwardLinkedAbort();
    } else {
        linked.signal.addEventListener("abort", forwardLinkedAbort, { once: true });
        timer = setTimeout(() => {
            if (deadlineController.signal.aborted) return;
            timedOut = true;
            deadlineController.abort();
        }, Math.max(1, timeoutMs));
        if (typeof (timer as { unref?: () => void }).unref === "function") {
            (timer as { unref: () => void }).unref();
        }
    }

    return {
        signal: deadlineController.signal,
        timedOut: () => timedOut,
        dispose: () => {
            if (disposed) return;
            disposed = true;
            if (timer) clearTimeout(timer);
            timer = null;
            linked.signal.removeEventListener("abort", forwardLinkedAbort);
            linked.dispose();
        },
    };
}
