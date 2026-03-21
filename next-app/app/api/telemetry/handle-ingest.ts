import { z } from "zod";
import type { AuthContext, TelemetryApiActor } from "@/lib/server/auth/session";
import {
  requireApiSession,
  resolveTelemetryApiActor,
} from "@/lib/server/auth/session";
import { isTelemetryIngestE2EMode } from "@/lib/telemetry/e2e-mode";
import {
  TelemetryAnonymousNotAllowedError,
  TelemetryAnonymousRateLimitedError,
  TelemetryProjectAccessDeniedError,
} from "@/lib/server/telemetry-policy";
import { logServerError } from "@/lib/server/logging";

type AcceptedResponseBody = {
  success: true;
  deduped: boolean;
  id?: string | null;
};

type BaseTelemetryIngestHandlerOptions<TResult> = {
  logKey: string;
  toAcceptedBody: (result: TResult) => AcceptedResponseBody;
};

type TelemetryIngestHandlerOptionsRequired<TResult> =
  BaseTelemetryIngestHandlerOptions<TResult> & {
    authMode?: "required";
    ingest: (context: AuthContext, body: unknown) => Promise<TResult>;
  };

type TelemetryIngestHandlerOptionsOptional<TResult> =
  BaseTelemetryIngestHandlerOptions<TResult> & {
    authMode: "optional";
    ingest: (actor: TelemetryApiActor, body: unknown) => Promise<TResult>;
  };

function responseJson(status: number, body: object, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers,
  });
}

export function createTelemetryPostHandler<TResult>({
  authMode,
  logKey,
  ingest,
  toAcceptedBody,
}: TelemetryIngestHandlerOptionsRequired<TResult>): (request: Request) => Promise<Response>;
export function createTelemetryPostHandler<TResult>({
  authMode,
  logKey,
  ingest,
  toAcceptedBody,
}: TelemetryIngestHandlerOptionsOptional<TResult>): (request: Request) => Promise<Response>;
export function createTelemetryPostHandler<TResult>({
  authMode = "required",
  logKey,
  ingest,
  toAcceptedBody,
}: (TelemetryIngestHandlerOptionsRequired<TResult> | TelemetryIngestHandlerOptionsOptional<TResult>) & {
  ingest: ((context: AuthContext, body: unknown) => Promise<TResult>) | ((actor: TelemetryApiActor, body: unknown) => Promise<TResult>);
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const body = await request.json();
      let result: TResult;

      if (authMode === "optional") {
        const actor = await resolveTelemetryApiActor(request);
        result = await (
          ingest as (actor: TelemetryApiActor, body: unknown) => Promise<TResult>
        )(actor, body);
      } else {
        const authResult = await requireApiSession(request);
        if (!authResult.ok) {
          return authResult.response;
        }
        result = await (
          ingest as (context: AuthContext, body: unknown) => Promise<TResult>
        )(authResult.context, body);
      }

      return responseJson(202, toAcceptedBody(result));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return responseJson(400, {
          success: false,
          error: "Invalid telemetry payload",
          issues: error.issues,
        });
      }

      if (error instanceof SyntaxError) {
        return responseJson(400, {
          success: false,
          error: "Invalid JSON payload",
        });
      }

      if (error instanceof TelemetryProjectAccessDeniedError) {
        return responseJson(403, {
          success: false,
          error: "Project not found or access denied",
        });
      }

      if (error instanceof TelemetryAnonymousNotAllowedError) {
        return responseJson(403, {
          success: false,
          error: "Anonymous telemetry is not allowed for this payload",
        });
      }

      if (error instanceof TelemetryAnonymousRateLimitedError) {
        return responseJson(
          429,
          {
            success: false,
            error: "Too many anonymous telemetry events",
          },
          {
            ...(error.retryAfterSeconds
              ? { "Retry-After": String(error.retryAfterSeconds) }
              : {}),
          },
        );
      }

      if (!isTelemetryIngestE2EMode()) {
        logServerError(`telemetry/${logKey}`, "ingestion failed", undefined, error);
      }

      return responseJson(500, {
        success: false,
        error: "Telemetry ingestion failed",
      });
    }
  };
}
