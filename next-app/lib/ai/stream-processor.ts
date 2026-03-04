import type { AIStreamChunk } from "@/types/ai";
import { parseNDJSONStream } from "@/lib/ai/stream-parser";
import {
    createLifecycleSnapshot,
    finalizeLifecycle,
    terminalReasonFromErrorChunk,
    terminalReasonFromRunEnd,
    type StreamTerminalReason,
} from "@/lib/ai/stream-lifecycle";

export type StreamRunSummary = {
    runStatus: string | null;
    stopReason: string | null;
    errorMessage: string | null;
    conversationId: string | null;
    actualModel: string | null;
    actualModelSource: "provider" | "requested" | "unknown";
    terminalReason: StreamTerminalReason | null;
};

type ProcessAIStreamParams = {
    reader: ReadableStreamDefaultReader<Uint8Array>;
    signal?: AbortSignal;
    shouldContinue?: () => boolean;
    onChunk: (chunk: AIStreamChunk) => void | Promise<void>;
    throwOnErrorChunk?: boolean;
};

/**
 * Shared stream processor used by both copilot surfaces and /ai.
 * It centralizes stream parsing + run lifecycle extraction while letting each
 * caller own how timeline/UI state is updated per chunk.
 */
export async function processAIStream({
    reader,
    signal,
    shouldContinue,
    onChunk,
    throwOnErrorChunk = false,
}: ProcessAIStreamParams): Promise<StreamRunSummary> {
    let runStatus: string | null = null;
    let stopReason: string | null = null;
    let errorMessage: string | null = null;
    let conversationId: string | null = null;
    let actualModel: string | null = null;
    let actualModelSource: "provider" | "requested" | "unknown" = "unknown";
    const lifecycle = createLifecycleSnapshot(`attempt-${Date.now()}`);
    let lifecycleState = lifecycle;

    for await (const chunk of parseNDJSONStream(reader, signal)) {
        if (shouldContinue && !shouldContinue()) break;

        if (chunk.type === "run_start" && chunk.conversationId) {
            conversationId = chunk.conversationId;
        } else if (chunk.type === "run_end") {
            runStatus = chunk.runStatus ?? null;
            stopReason = chunk.stopReason ?? null;
            actualModel = chunk.actualModel ?? null;
            actualModelSource = chunk.actualModelSource ?? "unknown";
            if (chunk.conversationId) conversationId = chunk.conversationId;
            lifecycleState = finalizeLifecycle(
                lifecycleState,
                terminalReasonFromRunEnd({
                    runStatus: chunk.runStatus,
                    stopReason: chunk.stopReason,
                }),
            ).snapshot;
        } else if (chunk.type === "error") {
            errorMessage = chunk.error ?? "AI stream error";
            lifecycleState = finalizeLifecycle(
                lifecycleState,
                terminalReasonFromErrorChunk(chunk),
            ).snapshot;
        }

        await onChunk(chunk);

        if (chunk.type === "error" && throwOnErrorChunk) {
            throw new Error(chunk.error ?? "AI stream error");
        }
    }

    if (lifecycleState.terminalReason === null) {
        lifecycleState = finalizeLifecycle(lifecycleState, "failed_network").snapshot;
    }

    return {
        runStatus,
        stopReason,
        errorMessage,
        conversationId,
        actualModel,
        actualModelSource,
        terminalReason: lifecycleState.terminalReason,
    };
}
