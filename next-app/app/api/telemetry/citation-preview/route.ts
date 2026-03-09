import { createTelemetryPostHandler } from "@/app/api/telemetry/handle-ingest";
import { ingestCitationPreviewMetric } from "@/lib/server/citation-preview-metrics";

export const runtime = "nodejs";

export const POST = createTelemetryPostHandler({
  logKey: "citation-preview",
  ingest: ingestCitationPreviewMetric,
  toAcceptedBody: (result) => ({
    success: true,
    deduped: result.deduped,
  }),
});
