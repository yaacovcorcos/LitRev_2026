import { createTelemetryPostHandler } from "@/app/api/telemetry/handle-ingest";
import { ingestReliabilityMetric } from "@/lib/server/reliability-metrics";

export const runtime = "nodejs";

export const POST = createTelemetryPostHandler({
  authMode: "optional",
  logKey: "reliability",
  ingest: ingestReliabilityMetric,
  toAcceptedBody: (result) => ({
    success: true,
    deduped: result.deduped,
    id: result.id,
  }),
});
