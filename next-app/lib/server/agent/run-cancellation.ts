import "server-only";

const runCancellationControllers = new Map<string, AbortController>();

export function registerRunCancellationController(
    runId: string,
    controller: AbortController,
): () => void {
    runCancellationControllers.set(runId, controller);
    return () => {
        if (runCancellationControllers.get(runId) === controller) {
            runCancellationControllers.delete(runId);
        }
    };
}

export function abortRegisteredRun(runId: string): boolean {
    const controller = runCancellationControllers.get(runId);
    if (!controller) return false;
    if (!controller.signal.aborted) controller.abort();
    return true;
}
