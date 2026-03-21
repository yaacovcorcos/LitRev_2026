import type {
    AIErrorEnvelope,
    AIStreamChunk,
    RunRecoveryRecommendation,
    RunRecoveryResponse,
} from "@/types/ai";

export const RUN_RECOVERY_RECONNECT_SUMMARY = "Run interrupted. Reconnecting to the active run…";
export const RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY = "Run interrupted while waiting for the run to finish.";
export const RUN_RECOVERY_TIMEOUT_MESSAGE = "Run interrupted and recovery timed out. Choose how to continue.";
export const RUN_RECOVERY_FAILED_MESSAGE = "Run interrupted and recovery failed. You can retry safely now.";
export const RUN_RECOVERY_STALLED_PROGRESS_MESSAGE = "The active run stopped making durable progress. Choose how to continue.";
export const RUN_RECOVERY_FINALIZATION_FAILED_MESSAGE = "The run could not finalize cleanly. Choose how to continue.";
export const RUN_RECOVERY_ACTIVE_RUN_HELD_MESSAGE = "The active run is still holding this conversation. Choose how to continue.";
export const RUN_RECOVERY_CONTINUE_FROM_CHECKPOINT_MESSAGE = "Saved progress is available. Continue from the latest checkpoint.";
export const RUN_RECOVERY_CONTINUE_FROM_DURABLE_STATE_MESSAGE = "Saved work is available. Continue from the latest durable state.";

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

export async function pollRunRecovery(params: {
    conversationId: string;
    runId: string;
    afterSequence?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
    onReplay: (chunk: AIStreamChunk, sequence: number) => void | Promise<void>;
    onTerminal: (chunk: AIStreamChunk) => void | Promise<void>;
    sleep?: (ms: number) => Promise<void>;
}): Promise<{
    outcome: "recovered" | "needs_user_action" | "retry" | "aborted" | "timeout";
    response: RunRecoveryResponse | null;
    lastAppliedSequence: number;
}> {
    const timeoutMs = params.timeoutMs ?? 30_000;
    const sleep = params.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const startedAt = Date.now();
    let lastAppliedSequence = params.afterSequence ?? -1;
    let attempt = 0;
    let lastResponse: RunRecoveryResponse | null = null;

    while (true) {
        if (params.signal?.aborted) {
            return { outcome: "aborted", response: lastResponse, lastAppliedSequence };
        }

        const response = await fetchRunRecovery({
            conversationId: params.conversationId,
            runId: params.runId,
            afterSequence: lastAppliedSequence,
            signal: params.signal,
        });
        lastResponse = response;

        for (const replayableEvent of response.replayableEvents) {
            if (replayableEvent.sequence <= lastAppliedSequence) continue;
            await params.onReplay(replayableEvent.chunk, replayableEvent.sequence);
            lastAppliedSequence = replayableEvent.sequence;
        }

        if (response.terminalEvent?.chunk) {
            await params.onTerminal(response.terminalEvent.chunk);
            return { outcome: "recovered", response, lastAppliedSequence };
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

        if (Date.now() - startedAt >= timeoutMs) {
            return { outcome: "timeout", response, lastAppliedSequence };
        }

        attempt += 1;
        await sleep(attempt < 10 ? 1_000 : 2_000);
    }
}
