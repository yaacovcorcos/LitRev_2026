import type {
    AIErrorEnvelope,
    AIStreamChunk,
    RunRecoveryRecommendation,
    RunRecoveryResponse,
} from "@/types/ai";
import { createAbortError, createLinkedAbortController } from "@/lib/abort";

export const RUN_RECOVERY_RECONNECT_SUMMARY = "Run interrupted. Reconnecting to the active run…";
export const RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY = "Run interrupted while waiting for the run to finish.";
export const RUN_RECOVERY_TIMEOUT_MESSAGE = "Run interrupted and recovery timed out. Choose how to continue.";
export const RUN_RECOVERY_FAILED_MESSAGE = "Run interrupted and recovery failed. You can retry safely now.";
export const RUN_RECOVERY_STALLED_PROGRESS_MESSAGE = "The active run stopped making durable progress. Choose how to continue.";
export const RUN_RECOVERY_FINALIZATION_FAILED_MESSAGE = "The run could not finalize cleanly. Choose how to continue.";
export const RUN_RECOVERY_ACTIVE_RUN_HELD_MESSAGE = "The active run is still holding this conversation. Choose how to continue.";
export const RUN_RECOVERY_CONTINUE_FROM_CHECKPOINT_MESSAGE = "Saved progress is available. Continue from the latest checkpoint.";
export const RUN_RECOVERY_CONTINUE_FROM_DURABLE_STATE_MESSAGE = "Saved work is available. Continue from the latest durable state.";
export const RUN_RECOVERY_INACTIVITY_TIMEOUT_MS = 60_000;
export const RUN_RECOVERY_ABSOLUTE_TIMEOUT_MS = 180_000;

export function getRunRecoveryPollDelayMs(attempt: number): number {
    const normalizedAttempt = Math.max(1, Math.floor(attempt));
    if (normalizedAttempt <= 5) return 1_000;
    if (normalizedAttempt <= 15) return 2_000;
    return 5_000;
}

export async function fetchRunRecovery(params: {
    conversationId: string;
    runId: string;
    afterSequence: number;
    signal?: AbortSignal;
}): Promise<RunRecoveryResponse> {
    const response = await fetch("/api/ai/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            conversationId: params.conversationId,
            runId: params.runId,
            afterSequence: params.afterSequence,
        }),
        signal: params.signal,
    });
    if (!response.ok) {
        throw new Error(`Run recovery failed: ${response.statusText}`);
    }
    return response.json() as Promise<RunRecoveryResponse>;
}

export function createRecoveryErrorEnvelope(params: {
    code: string;
    message: string;
    runId?: string | null;
    activeRunId?: string | null;
    lastActivityAt?: string | null;
    recoveryRecommendation: RunRecoveryRecommendation;
    retryable: boolean;
    kind?: AIErrorEnvelope["kind"];
    source?: AIErrorEnvelope["source"];
}): AIErrorEnvelope {
    return {
        kind: params.kind ?? "runtime",
        code: params.code,
        retryable: params.retryable,
        source: params.source ?? "runtime",
        message: params.message,
        runId: params.runId ?? params.activeRunId ?? undefined,
        activeRunId: params.activeRunId ?? undefined,
        lastActivityAt: params.lastActivityAt ?? undefined,
        recoveryRecommendation: params.recoveryRecommendation,
    };
}

export function getRunRecoveryMessage(params: {
    outcome: "recovered" | "needs_user_action" | "retry" | "aborted" | "timeout";
    response?: RunRecoveryResponse | null;
    abnormalEndClassification?: RunRecoveryResponse["abnormalEndClassification"];
}): string {
    if (params.outcome === "timeout") {
        return RUN_RECOVERY_TIMEOUT_MESSAGE;
    }

    if (params.outcome === "needs_user_action") {
        if (params.response?.recoveryRecommendation === "continue_from_checkpoint") {
            return RUN_RECOVERY_CONTINUE_FROM_CHECKPOINT_MESSAGE;
        }
        if (params.response?.recoveryRecommendation === "continue_from_durable_state") {
            return RUN_RECOVERY_CONTINUE_FROM_DURABLE_STATE_MESSAGE;
        }
        const abnormalEndClassification =
            params.response?.abnormalEndClassification ?? params.abnormalEndClassification ?? null;
        if (abnormalEndClassification === "no_forward_durable_progress") {
            return RUN_RECOVERY_STALLED_PROGRESS_MESSAGE;
        }
        if (abnormalEndClassification === "finalization_failed") {
            return RUN_RECOVERY_FINALIZATION_FAILED_MESSAGE;
        }
        return RUN_RECOVERY_ACTIVE_RUN_HELD_MESSAGE;
    }

    return RUN_RECOVERY_FAILED_MESSAGE;
}

function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        return Promise.reject(createAbortError());
    }

    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const cleanup = () => signal.removeEventListener("abort", onAbort);
        const onAbort = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(createAbortError());
        };

        signal.addEventListener("abort", onAbort, { once: true });
        operation.then(
            (value) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(value);
            },
            (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            },
        );
    });
}

export async function pollRunRecovery(params: {
    conversationId: string;
    runId: string;
    afterSequence?: number;
    signal?: AbortSignal;
    /** @deprecated Prefer inactivityTimeoutMs and absoluteTimeoutMs. */
    timeoutMs?: number;
    inactivityTimeoutMs?: number;
    absoluteTimeoutMs?: number;
    onReplay: (chunk: AIStreamChunk, sequence: number) => void | Promise<void>;
    onTerminal: (chunk: AIStreamChunk) => void | Promise<void>;
    sleep?: (ms: number) => Promise<void>;
}): Promise<{
    outcome: "recovered" | "needs_user_action" | "retry" | "aborted" | "timeout";
    response: RunRecoveryResponse | null;
    lastAppliedSequence: number;
}> {
    const legacyTimeoutMs = params.timeoutMs === undefined
        ? null
        : Math.max(0, params.timeoutMs);
    // The inactivity deadline outlives the server's 45-second missed-heartbeat
    // proof. A separate absolute cap exceeds the 150-second route lifetime, so
    // healthy heartbeat progress is not mistaken for a dead run while recovery
    // still remains bounded if every other signal is misleading.
    const inactivityTimeoutMs = Math.max(
        0,
        params.inactivityTimeoutMs ?? legacyTimeoutMs ?? RUN_RECOVERY_INACTIVITY_TIMEOUT_MS,
    );
    const absoluteTimeoutMs = Math.max(
        0,
        params.absoluteTimeoutMs ?? legacyTimeoutMs ?? RUN_RECOVERY_ABSOLUTE_TIMEOUT_MS,
    );
    const sleep = params.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const deadlineController = new AbortController();
    const linkedAbort = createLinkedAbortController([params.signal, deadlineController.signal]);
    let deadlineReason: "inactivity" | "absolute" | null = null;
    let inactivityHandle: ReturnType<typeof setTimeout> | null = null;
    const abortForDeadline = (reason: "inactivity" | "absolute") => {
        if (deadlineController.signal.aborted) return;
        deadlineReason = reason;
        deadlineController.abort();
    };
    const resetInactivityDeadline = () => {
        if (inactivityHandle) clearTimeout(inactivityHandle);
        if (inactivityTimeoutMs === 0) {
            abortForDeadline("inactivity");
            return;
        }
        inactivityHandle = setTimeout(
            () => abortForDeadline("inactivity"),
            inactivityTimeoutMs,
        );
    };
    const absoluteHandle = absoluteTimeoutMs === 0
        ? null
        : setTimeout(() => abortForDeadline("absolute"), absoluteTimeoutMs);
    if (absoluteTimeoutMs === 0) abortForDeadline("absolute");
    resetInactivityDeadline();
    let lastAppliedSequence = params.afterSequence ?? -1;
    let attempt = 0;
    let lastResponse: RunRecoveryResponse | null = null;
    let lastObservedActivityMs: number | null = null;
    let lastObservedSequence = lastAppliedSequence;

    const deadlineExpired = () => deadlineReason !== null || deadlineController.signal.aborted;
    const classifyAbort = () => params.signal?.aborted ? "aborted" as const : "timeout" as const;
    const noteResponseProgress = (response: RunRecoveryResponse) => {
        const activityMs = response.lastActivityAt ? Date.parse(response.lastActivityAt) : Number.NaN;
        const sequence = response.lastSequence ?? lastObservedSequence;
        const firstObservation = lastResponse === null;
        const activityAdvanced = Number.isFinite(activityMs)
            && (lastObservedActivityMs === null || activityMs > lastObservedActivityMs);
        const sequenceAdvanced = sequence > lastObservedSequence;

        if (Number.isFinite(activityMs)) {
            lastObservedActivityMs = Math.max(lastObservedActivityMs ?? activityMs, activityMs);
        }
        lastObservedSequence = Math.max(lastObservedSequence, sequence);
        if (firstObservation || activityAdvanced || sequenceAdvanced) {
            resetInactivityDeadline();
        }
    };

    const runCallbackWithDeadline = async (callback: () => void | Promise<void>) => {
        await awaitWithAbort(Promise.resolve().then(callback), linkedAbort.signal);
    };

    try {
        while (true) {
            if (params.signal?.aborted) {
                return { outcome: "aborted", response: lastResponse, lastAppliedSequence };
            }
            if (deadlineExpired()) {
                return { outcome: "timeout", response: lastResponse, lastAppliedSequence };
            }

            let response: RunRecoveryResponse;
            try {
                response = await awaitWithAbort(fetchRunRecovery({
                    conversationId: params.conversationId,
                    runId: params.runId,
                    afterSequence: lastAppliedSequence,
                    signal: linkedAbort.signal,
                }), linkedAbort.signal);
            } catch {
                if (params.signal?.aborted) {
                    return { outcome: "aborted", response: lastResponse, lastAppliedSequence };
                }
                if (deadlineExpired()) {
                    return { outcome: "timeout", response: lastResponse, lastAppliedSequence };
                }
                // Recovery is itself the fallback path. A transient/offline
                // fetch failure must become an explicit retry outcome rather
                // than escape as an unhandled rejection from the caller's
                // error handler.
                return { outcome: "retry", response: lastResponse, lastAppliedSequence };
            }
            noteResponseProgress(response);
            lastResponse = response;

            for (const replayableEvent of response.replayableEvents) {
                if (replayableEvent.sequence <= lastAppliedSequence) continue;
                try {
                    await runCallbackWithDeadline(() => params.onReplay(
                        replayableEvent.chunk,
                        replayableEvent.sequence,
                    ));
                } catch (error) {
                    if (params.signal?.aborted || deadlineExpired()) {
                        return {
                            outcome: classifyAbort(),
                            response: lastResponse,
                            lastAppliedSequence,
                        };
                    }
                    throw error;
                }
                lastAppliedSequence = replayableEvent.sequence;
                lastObservedSequence = Math.max(lastObservedSequence, lastAppliedSequence);
                resetInactivityDeadline();
            }

            if (response.recoveryRecommendation === "retry") {
                return { outcome: "retry", response, lastAppliedSequence };
            }

            if (response.recoveryRecommendation === "stop_and_retry") {
                return { outcome: "needs_user_action", response, lastAppliedSequence };
            }

            if (response.recoveryRecommendation === "continue_from_durable_state") {
                return { outcome: "needs_user_action", response, lastAppliedSequence };
            }

            if (response.recoveryRecommendation === "continue_from_checkpoint") {
                return { outcome: "needs_user_action", response, lastAppliedSequence };
            }

            if (response.terminalEvent?.chunk) {
                try {
                    await runCallbackWithDeadline(() => params.onTerminal(response.terminalEvent!.chunk));
                } catch (error) {
                    if (params.signal?.aborted || deadlineExpired()) {
                        return {
                            outcome: classifyAbort(),
                            response: lastResponse,
                            lastAppliedSequence,
                        };
                    }
                    throw error;
                }
                return { outcome: "recovered", response, lastAppliedSequence };
            }

            if (deadlineExpired()) {
                return { outcome: "timeout", response, lastAppliedSequence };
            }

            attempt += 1;
            try {
                await awaitWithAbort(sleep(getRunRecoveryPollDelayMs(attempt)), linkedAbort.signal);
            } catch (error) {
                if (params.signal?.aborted) {
                    return { outcome: "aborted", response: lastResponse, lastAppliedSequence };
                }
                if (deadlineExpired()) {
                    return { outcome: "timeout", response: lastResponse, lastAppliedSequence };
                }
                throw error;
            }
        }
    } finally {
        if (inactivityHandle) clearTimeout(inactivityHandle);
        if (absoluteHandle) clearTimeout(absoluteHandle);
        linkedAbort.dispose();
    }
}
