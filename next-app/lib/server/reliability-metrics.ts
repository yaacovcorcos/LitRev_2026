import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AuthContext, TelemetryApiActor } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import {
  RELIABILITY_DEAD_SCROLL_INPUT_VALUES,
  RELIABILITY_FLOW_VALUES,
  RELIABILITY_LAYOUT_MODE_VALUES,
  RELIABILITY_NETWORK_VALUES,
  RELIABILITY_RETRY_SOURCE_VALUES,
  RELIABILITY_ROUTE_STATE_VALUES,
  RELIABILITY_ROUTE_TEMPLATES,
  RELIABILITY_SHELL_MODE_VALUES,
  RELIABILITY_STREAM_PHASE_VALUES,
  RELIABILITY_STREAM_TERMINAL_REASON_VALUES,
  RELIABILITY_SURFACE_VALUES,
  RELIABILITY_VIEWPORT_VALUES,
} from "@/types/reliability-telemetry";
import {
  assertAnonymousReliabilityMetricAllowed,
  assertAnonymousTelemetryRateLimit,
  assertTelemetryProjectAccess,
  TelemetryProjectAccessDeniedError,
} from "@/lib/server/telemetry-policy";
import type { ReliabilityMetricInput } from "@/types/reliability-telemetry";

const boundedString = z.string().trim().min(1).max(256);
const nonNegativeDurationMs = z.number().finite().nonnegative();
export const RELIABILITY_MAX_CLIENT_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
export const RELIABILITY_MAX_CLIENT_FUTURE_SKEW_MS = 5 * 60 * 1000;
const boundedClientTimestamp = z.iso.datetime({ offset: true }).superRefine((value, ctx) => {
  const timestamp = Date.parse(value);
  const now = Date.now();
  if (timestamp < now - RELIABILITY_MAX_CLIENT_EVENT_AGE_MS) {
    ctx.addIssue({
      code: "custom",
      message: "Client timestamp is outside the accepted event age window",
    });
  }
  if (timestamp > now + RELIABILITY_MAX_CLIENT_FUTURE_SKEW_MS) {
    ctx.addIssue({
      code: "custom",
      message: "Client timestamp is too far in the future",
    });
  }
});
const commonMetricFields = {
  eventId: boundedString,
  version: z.literal(1),
  surface: z.enum(RELIABILITY_SURFACE_VALUES),
  projectId: boundedString.optional().nullable(),
  conversationId: boundedString.optional().nullable(),
  runId: boundedString.optional().nullable(),
  clientTimestamp: boundedClientTimestamp,
  dimensions: z.object({
    viewport: z.enum(RELIABILITY_VIEWPORT_VALUES),
    network: z.enum(RELIABILITY_NETWORK_VALUES),
    flags: z.object({
      scrollOwnershipA1: z.boolean().nullable(),
      streamReliabilityA2: z.boolean().nullable(),
      mobileScrollLockV2: z.boolean().nullable(),
    }).strict(),
  }).strict(),
};

function metricSchema<TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) {
  return z.object({
    ...commonMetricFields,
    type: z.literal(type),
    payload,
  }).strict();
}

const ReliabilityMetricInputSchema = z.discriminatedUnion("type", [
  metricSchema(
    "reliability.v1.stream.started",
    z.object({
      requestKey: boundedString,
      phase: z.enum(RELIABILITY_STREAM_PHASE_VALUES),
    }).strict(),
  ),
  metricSchema(
    "reliability.v1.stream.terminal",
    z.object({
      requestKey: boundedString,
      phase: z.enum(RELIABILITY_STREAM_PHASE_VALUES),
      reason: z.enum(RELIABILITY_STREAM_TERMINAL_REASON_VALUES),
      runStatus: boundedString.nullable(),
    }).strict(),
  ),
  metricSchema(
    "reliability.v1.stream.stuck_watchdog_fired",
    z.object({
      requestKey: boundedString,
      inactivityMs: nonNegativeDurationMs,
    }).strict(),
  ),
  metricSchema(
    "reliability.v1.retry.clicked",
    z.object({
      requestKey: boundedString,
      source: z.enum(RELIABILITY_RETRY_SOURCE_VALUES),
    }).strict(),
  ),
  metricSchema(
    "reliability.v1.shell.session_started",
    z.object({ sessionId: boundedString }).strict(),
  ),
  metricSchema(
    "reliability.v1.shell.session_ended",
    z.object({
      sessionId: boundedString,
      durationMs: nonNegativeDurationMs,
    }).strict(),
  ),
  z.object({
    ...commonMetricFields,
    type: z.literal("reliability.v1.shell.dead_scroll_detected"),
    surface: z.literal("shell"),
    projectId: boundedString,
    payload: z.object({
      sessionId: boundedString,
      input: z.enum(RELIABILITY_DEAD_SCROLL_INPUT_VALUES),
      blockedDurationMs: z.number().finite().min(2_000),
      shellMode: z.enum(RELIABILITY_SHELL_MODE_VALUES),
    }).strict(),
  }).strict(),
  metricSchema(
    "reliability.v1.route.ready",
    z.object({
      routeTemplate: z.enum(RELIABILITY_ROUTE_TEMPLATES),
      state: z.enum(RELIABILITY_ROUTE_STATE_VALUES),
      layoutMode: z.enum(RELIABILITY_LAYOUT_MODE_VALUES).nullable(),
    }).strict(),
  ),
  metricSchema(
    "reliability.v1.route.flow_completed",
    z.object({
      routeTemplate: z.enum(RELIABILITY_ROUTE_TEMPLATES),
      flow: z.enum(RELIABILITY_FLOW_VALUES),
      layoutMode: z.enum(RELIABILITY_LAYOUT_MODE_VALUES).nullable(),
    }).strict(),
  ),
]);

function parseClientTimestamp(input: string): Date {
  return new Date(input);
}

type ResolvedReliabilityScope = {
  projectId: string | null;
  conversationId: string | null;
  runId: string | null;
};

async function resolveAuthenticatedReliabilityScope(
  auth: AuthContext,
  parsed: ReliabilityMetricInput,
): Promise<ResolvedReliabilityScope> {
  const inputProjectId = parsed.projectId ?? null;
  const inputConversationId = parsed.conversationId ?? null;
  const inputRunId = parsed.runId ?? null;

  const run = inputRunId
    ? await prisma.agentRun.findFirst({
        where: {
          id: inputRunId,
          OR: [
            { projectId: null, userId: auth.userId },
            { project: { ownerId: auth.userId, workspaceId: auth.workspaceId } },
          ],
        },
        select: {
          id: true,
          projectId: true,
          conversationId: true,
        },
      })
    : null;

  if (inputRunId && !run) {
    throw new TelemetryProjectAccessDeniedError();
  }

  if (run && inputConversationId && run.conversationId !== inputConversationId) {
    throw new TelemetryProjectAccessDeniedError();
  }

  const resolvedConversationId = inputConversationId ?? run?.conversationId ?? null;
  const conversation = resolvedConversationId
    ? await prisma.aIConversation.findFirst({
        where: {
          id: resolvedConversationId,
          userId: auth.userId,
          workspaceId: auth.workspaceId,
        },
        select: {
          id: true,
          projectId: true,
        },
      })
    : null;

  if (resolvedConversationId && !conversation) {
    throw new TelemetryProjectAccessDeniedError();
  }

  if (run && conversation && run.projectId !== conversation.projectId) {
    throw new TelemetryProjectAccessDeniedError();
  }
  if (inputProjectId && run && run.projectId !== inputProjectId) {
    throw new TelemetryProjectAccessDeniedError();
  }
  if (inputProjectId && conversation && conversation.projectId !== inputProjectId) {
    throw new TelemetryProjectAccessDeniedError();
  }

  const projectId = inputProjectId ?? run?.projectId ?? conversation?.projectId ?? null;
  if (projectId) {
    await assertTelemetryProjectAccess(auth, projectId);
  }

  return {
    projectId,
    conversationId: resolvedConversationId,
    runId: inputRunId,
  };
}

function isEventIdUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  if (!Array.isArray(target)) return false;
  return target.map((value) => String(value)).includes("eventId");
}

export type IngestReliabilityMetricResult = {
  deduped: boolean;
  id: string | null;
};

export async function ingestReliabilityMetric(
  actor: TelemetryApiActor,
  input: unknown,
): Promise<IngestReliabilityMetricResult> {
  const parsed: ReliabilityMetricInput = ReliabilityMetricInputSchema.parse(input);
  if (actor.kind === "anonymous") {
    assertAnonymousTelemetryRateLimit(actor.clientIp);
    assertAnonymousReliabilityMetricAllowed(parsed);
  }

  const scope = actor.kind === "authenticated"
    ? await resolveAuthenticatedReliabilityScope(actor.context, parsed)
    : {
        projectId: parsed.projectId ?? null,
        conversationId: parsed.conversationId ?? null,
        runId: parsed.runId ?? null,
      };

  try {
    const created = await prisma.chatUnificationMetric.create({
      data: {
        eventId: parsed.eventId,
        version: parsed.version,
        type: parsed.type,
        surface: parsed.surface,
        userId: actor.kind === "authenticated" ? actor.context.userId : null,
        workspaceId: actor.kind === "authenticated" ? actor.context.workspaceId : null,
        projectId: scope.projectId,
        runId: scope.runId,
        conversationId: scope.conversationId,
        payload: {
          dimensions: parsed.dimensions,
          payload: parsed.payload as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
        clientTimestamp: parseClientTimestamp(parsed.clientTimestamp),
      },
      select: { id: true },
    });
    return { deduped: false, id: created.id };
  } catch (error) {
    if (isEventIdUniqueConflict(error)) {
      return { deduped: true, id: null };
    }
    throw error;
  }
}
