import "server-only";

import type { RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";
import {
  recordRunEvent,
  type RunEventFailureMode,
} from "@/lib/server/agent/run-event-recorder";

export async function persistRecoveryAuthoritativeRuntimeEvent(params: {
  runId: string;
  event: RuntimeStreamEvent;
  failureMode?: RunEventFailureMode;
}): Promise<void> {
    switch (params.event.type) {
        case "user_input_required":
            await recordRunEvent({
                runId: params.runId,
                type: "user_input_required",
        payload: params.event.userInputRequest,
        failureMode: params.failureMode ?? "strict",
        degradationReason: "user_input_required_persistence_failed",
                logContext: "user_input_required",
            });
            return;
        case "user_input_resolved":
            await recordRunEvent({
                runId: params.runId,
                type: "user_input_resolved",
                payload: params.event.userInputResolution,
                failureMode: params.failureMode ?? "strict",
                degradationReason: "user_input_resolved_persistence_failed",
                logContext: "user_input_resolved",
            });
            return;
        case "checkpoint":
            await recordRunEvent({
                runId: params.runId,
        type: "checkpoint",
        payload: {
          checkpointLabel: params.event.checkpointLabel,
        },
        failureMode: params.failureMode ?? "degrade",
        degradationReason: "checkpoint_persistence_failed",
        logContext: "checkpoint",
      });
      return;
    case "error":
      {
        const errorMeta = params.event.errorMeta
          ? { ...params.event.errorMeta, runId: params.event.errorMeta.runId ?? params.runId }
          : {
              kind: "runtime",
              code: "STREAM_ERROR",
              retryable: true,
              source: "runtime",
              message: params.event.error,
              runId: params.runId,
            };
        await recordRunEvent({
          runId: params.runId,
          type: "error",
          payload: {
          error: params.event.error,
          errorMeta,
          },
          extras: {
            errorCode: params.event.errorMeta?.code,
          },
          failureMode: params.failureMode ?? "degrade",
          degradationReason: "error_persistence_failed",
          logContext: "terminal_error",
        });
      }
      return;
    default:
      return;
  }
}
