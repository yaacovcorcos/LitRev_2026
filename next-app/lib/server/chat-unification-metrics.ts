import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import type { AuthContext } from "@/lib/server/auth/session";
import { assertTelemetryProjectAccess } from "@/lib/server/telemetry-policy";
import type {
  AnswerStreamDeliveryPayload,
  AskUserContextMismatchPayload,
  ChatUnificationMetricVersion,
  ChatSurface,
  ChatUnificationMetricType,
  RetryModelContinuityPayload,
  RetryModelContinuityPayloadLegacy,
  RetryModelContinuityPayloadV3,
  RunEndObservedPayload,
  StuckRunningToolsPayload,
} from "@/types/chat-unification";
import {
  CHAT_UNIFICATION_ACCEPTED_METRIC_VERSIONS,
  CHAT_UNIFICATION_METRIC_VERSION,
} from "@/types/chat-unification";

const CHAT_SURFACE_VALUES = ["ai", "project"] as const satisfies readonly ChatSurface[];
const CHAT_UNIFICATION_METRIC_TYPES = [
  "retry_model_continuity",
  "ask_user_context_mismatch",
  "stuck_running_tools_after_run_end",
  "run_end_observed",
  "answer_stream_delivery",
] as const satisfies readonly ChatUnificationMetricType[];

const CHAT_STREAM_PHASE_VALUES = ["send", "plan", "project_stream"] as const;
const ACTUAL_MODEL_SOURCE_VALUES = ["provider", "requested", "unknown"] as const;
const CHAT_UNIFICATION_METRIC_VERSIONS = CHAT_UNIFICATION_ACCEPTED_METRIC_VERSIONS;

const RetryModelContinuityPayloadV1V2Schema = z.object({
  preserved: z.boolean(),
  expectedModel: z.string().nullable(),
  actualModel: z.string().nullable(),
  actualModelSource: z.enum(ACTUAL_MODEL_SOURCE_VALUES).optional().default("unknown"),
  source: z.literal("retry_action"),
});

const RetryModelContinuityPayloadV3Schema: z.ZodType<RetryModelContinuityPayloadV3> = z.object({
  requestKey: z.string().uuid(),
  expectedModel: z.string().nullable(),
  source: z.literal("retry_action"),
});

const RetryModelContinuityPayloadLegacySchema: z.ZodType<RetryModelContinuityPayloadLegacy> =
  RetryModelContinuityPayloadV1V2Schema;

const AskUserContextMismatchPayloadSchema: z.ZodType<AskUserContextMismatchPayload> = z.object({
  mismatch: z.boolean(),
  expectedPage: z.string().nullable(),
  expectedSection: z.string().nullable(),
  resolvedPage: z.string().nullable(),
  resolvedSection: z.string().nullable(),
});

const StuckRunningToolsPayloadSchema: z.ZodType<StuckRunningToolsPayload> = z.object({
  unresolvedCount: z.number().int().min(0),
  unresolvedCountBeforeClear: z.number().int().min(0).nullable().optional().default(null),
  unresolvedCountAfterClear: z.number().int().min(0).nullable().optional().default(null),
  runStatus: z.string().nullable(),
  streamPhase: z.enum(CHAT_STREAM_PHASE_VALUES),
});

const RunEndObservedPayloadSchema: z.ZodType<RunEndObservedPayload> = z.object({
  requestKey: z.string().uuid().nullable().optional().default(null),
  runStatus: z.string().nullable(),
  streamPhase: z.enum(CHAT_STREAM_PHASE_VALUES),
  actualModel: z.string().nullable().optional().default(null),
  actualModelSource: z.enum(ACTUAL_MODEL_SOURCE_VALUES).optional().default("unknown"),
  firstProviderContentMs: z.number().finite().min(0).nullable().optional().default(null),
});

const AnswerStreamDeliveryPayloadSchema: z.ZodType<AnswerStreamDeliveryPayload> = z.object({
  requestKey: z.string().uuid(),
  streamPhase: z.enum(CHAT_STREAM_PHASE_VALUES),
  firstVisibleContentMs: z.number().finite().min(0).nullable(),
  visibleChunkCount: z.number().int().min(0),
  visibleChunkChars: z.number().int().min(0),
  maxVisibleChunkChars: z.number().int().min(0).nullable(),
  meanVisibleChunkGapMs: z.number().finite().min(0).nullable(),
});

const ChatUnificationMetricInputSchema = z.object({
  eventId: z.string().uuid(),
  version: z.number().int().refine(
    (value) => CHAT_UNIFICATION_METRIC_VERSIONS.includes(value as ChatUnificationMetricVersion),
    `Unsupported metric version. Supported versions: ${CHAT_UNIFICATION_METRIC_VERSIONS.join(", ")}`,
  ).optional(),
  type: z.enum(CHAT_UNIFICATION_METRIC_TYPES),
  surface: z.enum(CHAT_SURFACE_VALUES),
  runId: z.string().trim().min(1).optional().nullable(),
  conversationId: z.string().trim().min(1).optional().nullable(),
  projectId: z.string().trim().min(1).optional().nullable(),
  clientTimestamp: z.string().trim().min(1).optional().nullable(),
  payload: z.unknown(),
});

function parsePayload(
  version: ChatUnificationMetricVersion,
  type: ChatUnificationMetricType,
  payload: unknown,
): RetryModelContinuityPayload | AskUserContextMismatchPayload | StuckRunningToolsPayload | RunEndObservedPayload | AnswerStreamDeliveryPayload {
  switch (type) {
    case "retry_model_continuity": {
      if (version >= 3) {
        return RetryModelContinuityPayloadV3Schema.parse(payload);
      }
      return RetryModelContinuityPayloadLegacySchema.parse(payload);
    }
    case "ask_user_context_mismatch":
      return AskUserContextMismatchPayloadSchema.parse(payload);
    case "stuck_running_tools_after_run_end":
      return StuckRunningToolsPayloadSchema.parse(payload);
    case "run_end_observed":
      return RunEndObservedPayloadSchema.parse(payload);
    case "answer_stream_delivery":
      return AnswerStreamDeliveryPayloadSchema.parse(payload);
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
  const metricVersion = (parsed.version ?? CHAT_UNIFICATION_METRIC_VERSION) as ChatUnificationMetricVersion;
  const payload = parsePayload(metricVersion, parsed.type, parsed.payload);

  if (parsed.projectId) {
    await assertTelemetryProjectAccess(auth, parsed.projectId);
  }

  const runId = await resolveValidatedRunId(parsed.runId ?? null, auth);

  try {
    const created = await prisma.chatUnificationMetric.create({
      data: {
        eventId: parsed.eventId,
        version: metricVersion,
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
