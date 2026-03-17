import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { TelemetryApiActor } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import { RELIABILITY_VIEWPORT_VALUES } from "@/types/reliability-telemetry";
import {
  assertAnonymousReliabilityMetricAllowed,
  assertAnonymousTelemetryRateLimit,
  assertTelemetryProjectAccess,
} from "@/lib/server/telemetry-policy";
import type { ReliabilityMetricInput } from "@/types/reliability-telemetry";

const RELIABILITY_SURFACES = ["ai", "project", "popup", "shell", "home", "auth", "protocol"] as const;
const RELIABILITY_TYPES = [
  "reliability.v1.stream.started",
  "reliability.v1.stream.terminal",
  "reliability.v1.stream.stuck_watchdog_fired",
  "reliability.v1.retry.clicked",
  "reliability.v1.shell.session_started",
  "reliability.v1.shell.session_ended",
  "reliability.v1.route.ready",
  "reliability.v1.route.flow_completed",
] as const;

const ReliabilityMetricInputSchema = z.object({
  eventId: z.string().trim().min(1),
  version: z.literal(1),
  type: z.enum(RELIABILITY_TYPES),
  surface: z.enum(RELIABILITY_SURFACES),
  projectId: z.string().trim().min(1).optional().nullable(),
  conversationId: z.string().trim().min(1).optional().nullable(),
  runId: z.string().trim().min(1).optional().nullable(),
  clientTimestamp: z.string().trim().min(1),
  dimensions: z.object({
    viewport: z.enum(RELIABILITY_VIEWPORT_VALUES),
    network: z.enum(["online", "offline", "slow", "unknown"]),
    flags: z.object({
      scrollOwnershipA1: z.boolean().nullable(),
      streamReliabilityA2: z.boolean().nullable(),
      mobileScrollLockV2: z.boolean().nullable(),
    }),
  }),
  payload: z.unknown(),
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

export type IngestReliabilityMetricResult = {
  deduped: boolean;
  id: string | null;
};

export async function ingestReliabilityMetric(
  actor: TelemetryApiActor,
  input: unknown,
): Promise<IngestReliabilityMetricResult> {
  const parsed = ReliabilityMetricInputSchema.parse(input) as ReliabilityMetricInput;
  if (actor.kind === "anonymous") {
    assertAnonymousTelemetryRateLimit(actor.clientIp);
    assertAnonymousReliabilityMetricAllowed(parsed);
  } else if (parsed.projectId) {
    await assertTelemetryProjectAccess(actor.context, parsed.projectId);
  }

  try {
    const created = await prisma.chatUnificationMetric.create({
      data: {
        eventId: parsed.eventId,
        version: parsed.version,
        type: parsed.type,
        surface: parsed.surface,
        userId: actor.kind === "authenticated" ? actor.context.userId : null,
        workspaceId: actor.kind === "authenticated" ? actor.context.workspaceId : null,
        projectId: parsed.projectId ?? null,
        runId: parsed.runId ?? null,
        conversationId: parsed.conversationId ?? null,
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
