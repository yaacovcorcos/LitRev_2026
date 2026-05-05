import "server-only";

type ActiveRunExecutionCancellation = {
    signal: AbortSignal;
    dispose: () => void;
};

// Best-effort same-process fast path. Durable database cancellation remains the
// cross-instance authority when a cancel request lands on a different worker.
const activeRunControllers = new Map<string, AbortController>();

export function registerActiveRunExecutionCancellation(runId: string): ActiveRunExecutionCancellation {
    const controller = new AbortController();
    activeRunControllers.set(runId, controller);

    return {
        signal: controller.signal,
        dispose: () => {
            if (activeRunControllers.get(runId) === controller) {
                activeRunControllers.delete(runId);
            }
        },
    };
}

export function abortActiveRunExecution(runId: string): boolean {
    const controller = activeRunControllers.get(runId);
    if (!controller) return false;
    if (!controller.signal.aborted) {
        controller.abort();
    }
    return true;
}
