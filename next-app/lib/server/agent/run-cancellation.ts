import "server-only";

import { prisma } from "@/lib/server/prisma";
import { logServerWarn } from "@/lib/server/logging";

export type ActiveRunExecutionCancellation = {
    signal: AbortSignal;
    abort: () => void;
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
        abort: () => {
            if (!controller.signal.aborted) {
                controller.abort();
            }
        },
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

export interface DurableRunCancellationMonitor {
    stop(): void;
}

type IntervalHandle = ReturnType<typeof setInterval>;
type RunCancellationMonitorScheduler = (
    callback: () => void | Promise<void>,
    intervalMs: number,
) => IntervalHandle;
type RunCancellationMonitorCancel = (timer: IntervalHandle) => void;

async function pollDurableRunStatus(runId: string): Promise<string | null> {
    const run = await prisma.agentRun.findUnique({
        where: { id: runId },
        select: { status: true },
    });
    return typeof run?.status === "string" ? run.status : null;
}

export function startDurableRunCancellationMonitor(
    runId: string,
    options: {
        abort: () => void;
        intervalMs?: number;
        onError?: (error: unknown) => void;
        pollStatus?: (runId: string) => Promise<string | null>;
        schedule?: RunCancellationMonitorScheduler;
        cancel?: RunCancellationMonitorCancel;
    },
): DurableRunCancellationMonitor {
    const intervalMs = options.intervalMs ?? 1_500;
    const schedule = options.schedule ?? setInterval;
    const cancel = options.cancel ?? clearInterval;
    const pollStatus = options.pollStatus ?? pollDurableRunStatus;
    let stopped = false;
    let inFlight = false;

    const stop = (timer: IntervalHandle) => {
        if (stopped) return;
        stopped = true;
        cancel(timer);
    };

    const timer = schedule(async () => {
        if (stopped || inFlight) return;
        inFlight = true;
        try {
            const status = await pollStatus(runId);
            if (status !== "running") {
                options.abort();
                stop(timer);
            }
        } catch (error) {
            if (options.onError) {
                options.onError(error);
            } else {
                logServerWarn("run-cancellation", "durable cancellation monitor failed", {
                    runId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        } finally {
            inFlight = false;
        }
    }, intervalMs);

    if (typeof (timer as { unref?: () => void }).unref === "function") {
        (timer as { unref: () => void }).unref();
    }

    return {
        stop() {
            stop(timer);
        },
    };
}
