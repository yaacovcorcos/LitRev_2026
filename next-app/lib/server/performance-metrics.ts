import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { TelemetryApiActor } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import {
  PERFORMANCE_METRIC_NAMES,
  PERFORMANCE_METRIC_RATINGS,
  PERFORMANCE_METRIC_VERSION,
  PERFORMANCE_NETWORK_VALUES,
  PERFORMANCE_ROUTE_TEMPLATES,
  PERFORMANCE_SURFACES,
  PERFORMANCE_VIEWPORT_VALUES,
  type PerformanceMetricInput,
} from "@/types/performance-telemetry";
import {
  assertAnonymousPerformanceMetricAllowed,
  assertAnonymousTelemetryRateLimit,
  assertTelemetryProjectAccess,
} from "@/lib/server/telemetry-policy";

const MAX_EVENT_ID_LENGTH = 128;
const MAX_METRIC_ID_LENGTH = 128;
const MAX_COMMIT_SHA_LENGTH = 64;
const MAX_APP_VERSION_LENGTH = 64;
const MAX_PROJECT_ID_LENGTH = 128;

const PerformanceMetricInputSchema: z.ZodType<PerformanceMetricInput> = z.strictObject({
  eventId: z.string().trim().min(1).max(MAX_EVENT_ID_LENGTH),
  version: z.literal(PERFORMANCE_METRIC_VERSION),
  name: z.enum(PERFORMANCE_METRIC_NAMES),
  value: z.number().finite().min(0),
  metricId: z.string().trim().min(1).max(MAX_METRIC_ID_LENGTH),
  rating: z.enum(PERFORMANCE_METRIC_RATINGS).nullable(),
  routeTemplate: z.enum(PERFORMANCE_ROUTE_TEMPLATES),
  surface: z.enum(PERFORMANCE_SURFACES),
  projectId: z.string().trim().min(1).max(MAX_PROJECT_ID_LENGTH).nullable(),
  clientTimestamp: z.string().trim().min(1),
  dimensions: z.strictObject({
    viewport: z.enum(PERFORMANCE_VIEWPORT_VALUES),
    network: z.enum(PERFORMANCE_NETWORK_VALUES),
    online: z.boolean().nullable(),
    synthetic: z.boolean(),
    appVersion: z.string().trim().min(1).max(MAX_APP_VERSION_LENGTH).nullable(),
    commitSha: z.string().trim().min(1).max(MAX_COMMIT_SHA_LENGTH).nullable(),
  }),
});

function parseClientTimestamp(input: string): Date | null {
  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function isEventIdUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  if (!Array.isArray(target)) return false;
  return target.map((value) => String(value)).includes("eventId");
}

export type IngestPerformanceMetricResult = {
  deduped: boolean;
  id: string | null;
};

export async function ingestPerformanceMetric(
  actor: TelemetryApiActor,
  input: unknown,
): Promise<IngestPerformanceMetricResult> {
  const parsed = PerformanceMetricInputSchema.parse(input);

  if (actor.kind === "anonymous") {
    assertAnonymousTelemetryRateLimit(actor.clientIp);
    assertAnonymousPerformanceMetricAllowed(parsed);
  } else if (parsed.projectId) {
    await assertTelemetryProjectAccess(actor.context, parsed.projectId);
  }

  try {
    const created = await prisma.chatUnificationMetric.create({
      data: {
        eventId: parsed.eventId,
        version: parsed.version,
        type: "performance_web_vital",
        surface: parsed.surface,
        userId: actor.kind === "authenticated" ? actor.context.userId : null,
        workspaceId: actor.kind === "authenticated" ? actor.context.workspaceId : null,
        projectId: parsed.projectId,
        runId: null,
        conversationId: null,
        payload: {
          metric: {
            name: parsed.name,
            value: parsed.value,
            metricId: parsed.metricId,
            rating: parsed.rating,
          },
          routeTemplate: parsed.routeTemplate,
          dimensions: parsed.dimensions,
        } as Prisma.InputJsonValue,
        clientTimestamp: parseClientTimestamp(parsed.clientTimestamp),
      },
      select: { id: true },
    });

    return {
      deduped: false,
      id: created.id,
    };
  } catch (error) {
    if (isEventIdUniqueConflict(error)) {
      return {
        deduped: true,
        id: null,
      };
    }
    throw error;
  }
}

export const __private__ = {
  PerformanceMetricInputSchema,
};
