import { z } from "zod";
import type { AuthContext } from "@/lib/server/auth/session";
import { requireApiSession } from "@/lib/server/auth/session";
import { isTelemetryIngestE2EMode } from "@/lib/telemetry/e2e-mode";

type AcceptedResponseBody = {
  success: true;
  deduped: boolean;
  id?: string | null;
};

type TelemetryIngestHandlerOptions<TResult> = {
  logKey: string;
  ingest: (context: AuthContext, body: unknown) => Promise<TResult>;
  toAcceptedBody: (result: TResult) => AcceptedResponseBody;
};

export function createTelemetryPostHandler<TResult>({
  logKey,
  ingest,
  toAcceptedBody,
}: TelemetryIngestHandlerOptions<TResult>) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const authResult = await requireApiSession(request);
      if (!authResult.ok) return authResult.response;

      const body = await request.json();
      const result = await ingest(authResult.context, body);

      return Response.json(toAcceptedBody(result), { status: 202 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json(
          {
            success: false,
            error: "Invalid telemetry payload",
            issues: error.issues,
          },
          { status: 400 },
        );
      }

      if (error instanceof SyntaxError) {
        return Response.json(
          {
            success: false,
            error: "Invalid JSON payload",
          },
          { status: 400 },
        );
      }

      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("access denied")
      ) {
        return Response.json(
          {
            success: false,
            error: "Project not found or access denied",
          },
          { status: 403 },
        );
      }

      if (!isTelemetryIngestE2EMode()) {
        console.error(`[telemetry/${logKey}] ingestion failed`, error);
      }
      return Response.json(
        {
          success: false,
          error: "Telemetry ingestion failed",
        },
        { status: 500 },
      );
    }
  };
}
