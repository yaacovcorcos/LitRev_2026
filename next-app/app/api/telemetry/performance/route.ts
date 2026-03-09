import { createTelemetryPostHandler } from "@/app/api/telemetry/handle-ingest";
import { ingestPerformanceMetric } from "@/lib/server/performance-metrics";

export const runtime = "nodejs";

export const POST = createTelemetryPostHandler({
  logKey: "performance",
  ingest: ingestPerformanceMetric,
  toAcceptedBody: (result) => ({
    success: true,
    deduped: result.deduped,
    id: result.id,
  }),
});
