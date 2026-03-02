import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { AuthContext } from "@/lib/server/auth/session";
import type {
  AskUserContextMismatchPayload,
  ChatSurface,
  ChatUnificationMetricType,
  RetryModelContinuityPayload,
  RunEndObservedPayload,
  StuckRunningToolsPayload,
} from "@/types/chat-unification";

const CHAT_SURFACE_VALUES = ["ai", "project"] as const satisfies readonly ChatSurface[];
const CHAT_UNIFICATION_METRIC_TYPES = [
  "retry_model_continuity",
  "ask_user_context_mismatch",
  "stuck_running_tools_after_run_end",
  "run_end_observed",
] as const satisfies readonly ChatUnificationMetricType[];

const CHAT_STREAM_PHASE_VALUES = ["send", "plan", "project_stream"] as const;

const RetryModelContinuityPayloadSchema: z.ZodType<RetryModelContinuityPayload> = z.object({
  preserved: z.boolean(),
  expectedModel: z.string().nullable(),
  actualModel: z.string().nullable(),
  source: z.literal("retry_action"),
});

const AskUserContextMismatchPayloadSchema: z.ZodType<AskUserContextMismatchPayload> = z.object({
  mismatch: z.boolean(),
  expectedPage: z.string().nullable(),
  expectedSection: z.string().nullable(),
  resolvedPage: z.string().nullable(),
  resolvedSection: z.string().nullable(),
});

const StuckRunningToolsPayloadSchema: z.ZodType<StuckRunningToolsPayload> = z.object({
  unresolvedCount: z.number().int().min(0),
  runStatus: z.string().nullable(),
  streamPhase: z.enum(CHAT_STREAM_PHASE_VALUES),
});

const RunEndObservedPayloadSchema: z.ZodType<RunEndObservedPayload> = z.object({
  runStatus: z.string().nullable(),
  streamPhase: z.enum(CHAT_STREAM_PHASE_VALUES),
});

const ChatUnificationMetricInputSchema = z.object({
  eventId: z.string().uuid(),
  version: z.literal(1).optional(),
  type: z.enum(CHAT_UNIFICATION_METRIC_TYPES),
  surface: z.enum(CHAT_SURFACE_VALUES),
  runId: z.string().trim().min(1).optional().nullable(),
  conversationId: z.string().trim().min(1).optional().nullable(),
  projectId: z.string().trim().min(1).optional().nullable(),
  clientTimestamp: z.string().trim().min(1).optional().nullable(),
  payload: z.unknown(),
});

function parsePayload(
  type: ChatUnificationMetricType,
  payload: unknown,
): RetryModelContinuityPayload | AskUserContextMismatchPayload | StuckRunningToolsPayload | RunEndObservedPayload {
  switch (type) {
    case "retry_model_continuity":
      return RetryModelContinuityPayloadSchema.parse(payload);
    case "ask_user_context_mismatch":
      return AskUserContextMismatchPayloadSchema.parse(payload);
    case "stuck_running_tools_after_run_end":
      return StuckRunningToolsPayloadSchema.parse(payload);
    case "run_end_observed":
      return RunEndObservedPayloadSchema.parse(payload);
    default:
      throw new Error(`Unsupported metric type: ${String(type)}`);
  }
}

function parseClientTimestamp(input?: string | null): Date | null {
  if (!input) return null;
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

async function resolveValidatedRunId(
  inputRunId: string | null | undefined,
  auth: AuthContext,
): Promise<string | null> {
  if (!inputRunId) return null;
  const run = await prisma.agentRun.findFirst({
    where: {
      id: inputRunId,
      OR: [
        { userId: auth.userId },
        { project: { ownerId: auth.userId, workspaceId: auth.workspaceId } },
      ],
    },
    select: { id: true },
  });
  return run?.id ?? null;
}

export type IngestChatUnificationMetricResult = {
  deduped: boolean;
  id: string | null;
};

export async function ingestChatUnificationMetric(
  auth: AuthContext,
  input: unknown,
): Promise<IngestChatUnificationMetricResult> {
  const parsed = ChatUnificationMetricInputSchema.parse(input);
  const payload = parsePayload(parsed.type, parsed.payload);

  if (parsed.projectId) {
    await assertProjectAccess(
      { ownerId: auth.userId, workspaceId: auth.workspaceId },
      parsed.projectId,
    );
  }

  const runId = await resolveValidatedRunId(parsed.runId ?? null, auth);

  try {
    const created = await prisma.chatUnificationMetric.create({
      data: {
        eventId: parsed.eventId,
        version: 1,
        type: parsed.type,
        surface: parsed.surface,
        userId: auth.userId,
        workspaceId: auth.workspaceId,
        projectId: parsed.projectId ?? null,
        runId,
        conversationId: parsed.conversationId ?? null,
        payload,
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

export type ChatUnificationMetricRow = {
  eventId: string;
  type: ChatUnificationMetricType;
  surface: ChatSurface;
  runId: string | null;
  conversationId: string | null;
  projectId: string | null;
  payload: unknown;
  recordedAt: Date;
};

export async function listChatUnificationMetrics(params: {
  since: Date;
  until?: Date;
}) {
  const where = {
    recordedAt: {
      gte: params.since,
      ...(params.until ? { lte: params.until } : {}),
    },
  };
  return prisma.chatUnificationMetric.findMany({
    where,
    orderBy: { recordedAt: "asc" },
    select: {
      eventId: true,
      type: true,
      surface: true,
      runId: true,
      conversationId: true,
      projectId: true,
      payload: true,
      recordedAt: true,
    },
  }) as Promise<ChatUnificationMetricRow[]>;
}
