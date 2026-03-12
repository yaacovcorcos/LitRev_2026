import "server-only";

import type { RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";
import type { RuntimeThreadContext } from "@/lib/server/chat-runtime/thread";
import { emitEvent } from "@/lib/server/agent/events";

export async function persistRecoveryAuthoritativeRuntimeEvent(params: {
  event: RuntimeStreamEvent;
  thread: RuntimeThreadContext;
}): Promise<void> {
  const runId = params.thread.snapshot().runId;
  if (!runId) return;

  switch (params.event.type) {
    case "user_input_required":
      await emitEvent(runId, "user_input_required", params.event.userInputRequest);
      return;
    case "checkpoint":
      await emitEvent(runId, "checkpoint", {
        checkpointLabel: params.event.checkpointLabel,
      });
      return;
    case "artifact":
      if (!params.event.artifactId) return;
      await emitEvent(
        runId,
        "artifact_proposed",
        {
          artifactId: params.event.artifactId,
          artifactType: params.event.artifactType,
          artifactStatus: params.event.artifactStatus,
          artifactTitle: params.event.artifactTitle,
        },
        { artifactId: params.event.artifactId },
      );
      return;
    case "error":
      {
        const errorMeta = params.event.errorMeta
          ? { ...params.event.errorMeta, runId: params.event.errorMeta.runId ?? runId }
          : {
              kind: "runtime",
              code: "STREAM_ERROR",
              retryable: true,
              source: "runtime",
              message: params.event.error,
              runId,
            };
        await emitEvent(runId, "error", {
          error: params.event.error,
          errorMeta,
        }, {
          errorCode: params.event.errorMeta?.code,
        });
      }
      return;
    default:
      return;
  }
}
