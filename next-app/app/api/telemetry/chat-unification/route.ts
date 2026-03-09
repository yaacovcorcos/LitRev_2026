import { createTelemetryPostHandler } from "@/app/api/telemetry/handle-ingest";
import { ingestChatUnificationMetric } from "@/lib/server/chat-unification-metrics";

export const runtime = "nodejs";

export const POST = createTelemetryPostHandler({
  logKey: "chat-unification",
  ingest: ingestChatUnificationMetric,
  toAcceptedBody: (result) => ({
    success: true,
    deduped: result.deduped,
    id: result.id,
  }),
});
