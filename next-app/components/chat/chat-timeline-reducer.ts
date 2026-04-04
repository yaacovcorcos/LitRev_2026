/**
 * Stream Reducer
 * Pure function: accumulates SSE events into TimelineItem[]
 * Handles content, error, artifact, progress, and checkpoint events.
 * (planC Phase 0.6 + Phase 1)
 */

import type { TimelineItem } from "@/types/timeline";
import type { ProjectConversationMessage } from "@/lib/project-conversation-storage";
import type { AIStreamChunk, ConversationContextAttachment, ConversationMessageAttachment } from "@/types/ai";
import type { ArtifactType, ArtifactStatus } from "@/types/artifacts";
import { buildClientErrorState, extractLegacyRecoveryError } from "@/lib/ai/stream-error-ui";

function buildReducerItemId(prefix: string, seed: string | number): string {
    return `${prefix}-${seed}`;
}

function isContextAttachment(
    attachment: ConversationMessageAttachment,
): attachment is ConversationContextAttachment {
    return "type" in attachment && attachment.type === "context_capture";
}

/**
 * Convert legacy ProjectConversationMessage[] to TimelineItem[]
 * Bridge between old message format and new timeline format
 */
export function messagesToTimeline(messages: ProjectConversationMessage[]): TimelineItem[] {
    return messages.map((msg) => {
        if (msg.progress) {
            return {
                type: "progress" as const,
                id: msg.id,
                message: msg.progress.message,
                current: msg.progress.current,
                total: msg.progress.total,
            };
        }

        if (msg.toolActivity) {
            return {
                type: "tool_activity" as const,
                id: msg.id,
                callId: msg.toolActivity.callId,
                toolName: msg.toolActivity.toolName,
                status: msg.toolActivity.status,
                displayLabel: msg.toolActivity.displayLabel,
                inputPreview: msg.toolActivity.inputPreview,
                outcomeSummary: msg.toolActivity.outcomeSummary,
                sourceBadge: msg.toolActivity.sourceBadge,
                detailItems: msg.toolActivity.detailItems,
                summary: msg.toolActivity.summary,
                queryPreview: msg.toolActivity.queryPreview,
                returnedCount: msg.toolActivity.returnedCount,
                totalResults: msg.toolActivity.totalResults,
                resultIdentifiers: msg.toolActivity.resultIdentifiers,
                errorMeta: msg.toolActivity.errorMeta,
                startedAt: msg.toolActivity.startedAt,
                updatedAt: msg.toolActivity.updatedAt,
                completedAt: msg.toolActivity.completedAt,
                createdAt: msg.createdAt,
            };
        }

        if (msg.checkpoint) {
            return {
                type: "checkpoint" as const,
                id: msg.id,
                label: msg.checkpoint.label,
                runId: msg.checkpoint.runId,
                checkpointKind: msg.checkpoint.checkpointKind,
                createdAt: msg.createdAt,
            };
        }

        if (msg.streamError) {
            return {
                type: "error" as const,
                id: `error-${msg.id}`,
                message: msg.text.trim() || msg.streamError.message,
                retryable: msg.streamError.retryable,
                errorMeta: msg.streamError,
                createdAt: msg.createdAt,
            };
        }

        if (msg.userInputRequest) {
            return {
                type: "user_input_request" as const,
                id: msg.id,
                callId: msg.userInputRequest.callId,
                sourceRunId: msg.userInputRequest.sourceRunId,
                page: msg.context?.page,
                section: msg.context?.section,
                question: msg.userInputRequest.question,
                questionType: msg.userInputRequest.questionType,
                options: msg.userInputRequest.options,
                header: msg.userInputRequest.header,
                context: msg.userInputRequest.context,
                decisionBoundaryKey: msg.userInputRequest.decisionBoundaryKey,
                recommendedAnswer: msg.userInputRequest.recommendedAnswer,
                recommendedReason: msg.userInputRequest.recommendedReason,
                answered: Boolean(msg.userInputRequest.answered),
                answer: msg.userInputRequest.answer,
                resolution: msg.userInputRequest.resolution,
                createdAt: msg.createdAt,
            };
        }

        if (msg.sender === "user") {
            return {
                type: "user_message" as const,
                id: msg.id,
                content: msg.text,
                attachments: msg.attachments?.map((att) => (
                    isContextAttachment(att)
                        ? att
                        : {
                            fileAssetId: att.fileAssetId,
                            filename: att.filename,
                            mimeType: att.mimeType,
                            size: att.size,
                        }
                )),
                createdAt: msg.createdAt,
            };
        }
        // Artifact messages → TimelineArtifact
        if (msg.artifact) {
            return {
                type: "artifact" as const,
                id: msg.id,
                artifactId: msg.artifact.id,
                artifactType: msg.artifact.type as ArtifactType,
                status: (msg.artifact.status ?? "proposed") as ArtifactStatus,
                title: msg.artifact.title,
                payload: msg.artifact.payload ?? {},
                version: msg.artifact.version ?? 1,
                createdAt: msg.createdAt,
            };
        }
        const recoveryError = extractLegacyRecoveryError(msg.text);
        if (recoveryError) {
            return {
                type: "error" as const,
                id: `error-${msg.id}`,
                message: recoveryError.message,
                retryable: recoveryError.retryable,
                errorMeta: undefined,
                createdAt: msg.createdAt,
            };
        }
        return {
            type: "assistant_message" as const,
            id: msg.id,
            content: msg.text,
            deliveryState: msg.deliveryState,
            reasoning: msg.reasoning,
            createdAt: msg.createdAt,
        };
    });
}

/**
 * Reduce an SSE chunk into the current timeline.
 * Returns the updated timeline (immutable — new array).
 */
export function reduceStreamChunk(
    timeline: TimelineItem[],
    chunk: AIStreamChunk,
    currentAssistantId: string
): TimelineItem[] {
    switch (chunk.type) {
        case "content": {
            const last = timeline[timeline.length - 1];
            if (last && last.type === "assistant_message" && last.id === currentAssistantId) {
                // Append to existing assistant message
                return [
                    ...timeline.slice(0, -1),
                    { ...last, content: last.content + (chunk.content ?? "") },
                ];
            }
            // Start new assistant message
            return [
                ...timeline,
                {
                    type: "assistant_message",
                    id: currentAssistantId,
                    content: chunk.content ?? "",
                    createdAt: new Date().toISOString(),
                },
            ];
        }

        case "reasoning_start": {
            const last = timeline[timeline.length - 1];
            if (last && last.type === "assistant_message" && last.id === currentAssistantId) {
                return [
                    ...timeline.slice(0, -1),
                    {
                        ...last,
                        reasoning: {
                            text: last.reasoning?.text ?? "",
                            state: "streaming",
                            truncated: last.reasoning?.truncated,
                        },
                    },
                ];
            }
            return [
                ...timeline,
                {
                    type: "assistant_message",
                    id: currentAssistantId,
                    content: "",
                    reasoning: { text: "", state: "streaming" },
                    createdAt: new Date().toISOString(),
                },
            ];
        }

        case "reasoning_delta": {
            const last = timeline[timeline.length - 1];
            if (last && last.type === "assistant_message" && last.id === currentAssistantId) {
                return [
                    ...timeline.slice(0, -1),
                    {
                        ...last,
                        reasoning: {
                            text: `${last.reasoning?.text ?? ""}${chunk.reasoningText ?? ""}`,
                            state: "streaming",
                            truncated: last.reasoning?.truncated,
                        },
                    },
                ];
            }
            return [
                ...timeline,
                {
                    type: "assistant_message",
                    id: currentAssistantId,
                    content: "",
                    reasoning: { text: chunk.reasoningText ?? "", state: "streaming" },
                    createdAt: new Date().toISOString(),
                },
            ];
        }

        case "reasoning_end": {
            const last = timeline[timeline.length - 1];
            if (last && last.type === "assistant_message" && last.id === currentAssistantId) {
                return [
                    ...timeline.slice(0, -1),
                    {
                        ...last,
                        reasoning: {
                            text: last.reasoning?.text ?? "",
                            state: "done",
                            truncated: last.reasoning?.truncated,
                        },
                    },
                ];
            }
            return timeline;
        }

        case "artifact": {
            return [
                ...timeline,
                {
                    type: "artifact",
                    id: buildReducerItemId("artifact", chunk.artifactId ?? `${Date.now()}-${timeline.length}`),
                    artifactId: chunk.artifactId ?? "",
                    artifactType: (chunk.artifactType ?? "plan") as ArtifactType,
                    status: (chunk.artifactStatus ?? "proposed") as ArtifactStatus,
                    title: chunk.artifactTitle ?? "Artifact",
                    payload: chunk.artifactPayload ?? {},
                    version: chunk.artifactVersion ?? 1,
                    createdAt: new Date().toISOString(),
                },
            ];
        }

        case "progress": {
            // Replace the last progress item if one exists, otherwise append
            const lastIdx = timeline.length - 1;
            const last = timeline[lastIdx];
            if (last && last.type === "progress") {
                return [
                    ...timeline.slice(0, -1),
                    {
                        type: "progress",
                        id: last.id,
                        message: chunk.progressMessage ?? last.message,
                        current: chunk.progressCurrent,
                        total: chunk.progressTotal,
                    },
                ];
            }
            return [
                ...timeline,
                {
                    type: "progress",
                    id: buildReducerItemId("progress", `${Date.now()}-${timeline.length}`),
                    message: chunk.progressMessage ?? "Working...",
                    current: chunk.progressCurrent,
                    total: chunk.progressTotal,
                },
            ];
        }

        case "checkpoint": {
            return [
                ...timeline,
                {
                    type: "checkpoint",
                    id: buildReducerItemId("checkpoint", `${Date.now()}-${timeline.length}`),
                    label: chunk.checkpointLabel ?? "Checkpoint",
                    createdAt: new Date().toISOString(),
                },
            ];
        }

        case "error": {
            const errorState = buildClientErrorState(chunk.errorMeta ?? chunk.error ?? "Unknown error");
            return [
                ...timeline,
                {
                    type: "error",
                    id: buildReducerItemId("error", `${Date.now()}-${timeline.length}`),
                    message: errorState.message,
                    retryable: errorState.retryable,
                    errorMeta: errorState.errorMeta,
                    createdAt: new Date().toISOString(),
                },
            ];
        }

        case "tool_call": {
            if (!chunk.toolCall?.name) return timeline;
            const callId = chunk.toolCall.id || buildReducerItemId("tool", `${Date.now()}-${timeline.length}`);
            const createdAt = new Date().toISOString();
            return [
                ...timeline,
                {
                    type: "tool_activity",
                    id: `tool-${callId}`,
                    callId,
                    toolName: chunk.toolCall.name,
                    status: "running",
                    startedAt: createdAt,
                    updatedAt: createdAt,
                    createdAt,
                },
            ];
        }

        case "tool_result": {
            const callId = chunk.toolResult?.callId;
            const now = new Date().toISOString();
            let fallbackIndex = -1;
            for (let index = timeline.length - 1; index >= 0; index -= 1) {
                const item = timeline[index];
                if (item?.type === "tool_activity" && item.status === "running") {
                    fallbackIndex = index;
                    break;
                }
            }
            const updateIndex = callId
                ? timeline.findIndex((item) => item.type === "tool_activity" && item.callId === callId)
                : fallbackIndex;
            if (updateIndex < 0) return timeline;

            const next = [...timeline];
            const target = next[updateIndex];
            if (!target || target.type !== "tool_activity") return timeline;
            next[updateIndex] = {
                ...target,
                status: chunk.toolResult?.error ? "failed" : "done",
                summary: chunk.toolResult?.error ?? undefined,
                errorMeta: chunk.toolResult?.errorMeta,
                updatedAt: now,
                completedAt: now,
            };
            return next;
        }

        case "user_input_required": {
            if (!chunk.userInputRequest) return timeline;
            const req = chunk.userInputRequest;
            return [
                ...timeline,
                {
                    type: "user_input_request" as const,
                    id: `user-input-${req.callId}`,
                    callId: req.callId,
                    question: req.question,
                    questionType: req.questionType,
                    options: req.options,
                    header: req.header,
                    context: req.context,
                    answered: false,
                    createdAt: new Date().toISOString(),
                },
            ];
        }

        // run_start, run_end — handled at context level, not in timeline
        case "run_start":
        case "run_end":
            return timeline;

        // done — pass through
        default:
            return timeline;
    }
}
