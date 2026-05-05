import "server-only";

import type { Prisma } from "@prisma/client";
import type { ToolResult } from "@/types/ai";
import { prisma } from "@/lib/server/prisma";

export type ToolIdempotencyRecordKey = {
  scopeKey: string;
  toolName: string;
  fingerprint: string;
};

export type ToolIdempotencyReservationInput = ToolIdempotencyRecordKey & {
  callId: string;
  runId?: string | null;
  projectId?: string | null;
  userId?: string | null;
  studyId?: string | null;
};

export type ToolIdempotencyReservation =
  | { status: "reserved"; reservationId: string }
  | { status: "replay"; result: ToolResult }
  | { status: "in_flight"; reservationId: string | null };

export type ToolIdempotencyStore = {
  reserve(input: ToolIdempotencyReservationInput): Promise<ToolIdempotencyReservation>;
  complete(input: ToolIdempotencyReservationInput & {
    reservationId?: string | null;
    result: ToolResult;
  }): Promise<void>;
  release(input: ToolIdempotencyRecordKey & {
    reservationId?: string | null;
  }): Promise<void>;
};

type PrismaErrorWithCode = {
  code?: unknown;
};

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && (error as PrismaErrorWithCode).code === code,
  );
}

function toStoredToolResult(result: ToolResult): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify({
    ...result,
    // A replayed result is always rebound to the current provider call ID.
    callId: "",
  })) as Prisma.InputJsonValue;
}

function fromStoredToolResult(value: Prisma.JsonValue | null): ToolResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.callId !== "string" || !("result" in record)) return null;
  return record as ToolResult;
}

export function createPrismaToolIdempotencyStore(): ToolIdempotencyStore {
  return {
    async reserve(input) {
      try {
        const created = await prisma.toolIdempotencyRecord.create({
          data: {
            scopeKey: input.scopeKey,
            toolName: input.toolName,
            fingerprint: input.fingerprint,
            status: "running",
            callId: input.callId,
            runId: input.runId ?? undefined,
            projectId: input.projectId ?? undefined,
            userId: input.userId ?? undefined,
            studyId: input.studyId ?? undefined,
          },
          select: { id: true },
        });
        return { status: "reserved", reservationId: created.id };
      } catch (error) {
        if (!isPrismaErrorCode(error, "P2002")) {
          throw error;
        }
      }

      const existing = await prisma.toolIdempotencyRecord.findUnique({
        where: {
          scopeKey_toolName_fingerprint: {
            scopeKey: input.scopeKey,
            toolName: input.toolName,
            fingerprint: input.fingerprint,
          },
        },
        select: {
          id: true,
          status: true,
          result: true,
        },
      });

      if (existing?.status === "completed") {
        const result = fromStoredToolResult(existing.result);
        if (result) {
          return { status: "replay", result };
        }
      }

      return { status: "in_flight", reservationId: existing?.id ?? null };
    },

    async complete(input) {
      const result = toStoredToolResult(input.result);
      const data = {
        status: "completed",
        result,
        completedAt: new Date(),
      };

      if (input.reservationId) {
        const updated = await prisma.toolIdempotencyRecord.updateMany({
          where: {
            id: input.reservationId,
            status: "running",
          },
          data,
        });
        if (updated.count > 0) return;
      }

      await prisma.toolIdempotencyRecord.upsert({
        where: {
          scopeKey_toolName_fingerprint: {
            scopeKey: input.scopeKey,
            toolName: input.toolName,
            fingerprint: input.fingerprint,
          },
        },
        update: data,
        create: {
          scopeKey: input.scopeKey,
          toolName: input.toolName,
          fingerprint: input.fingerprint,
          status: "completed",
          callId: input.callId,
          runId: input.runId ?? undefined,
          projectId: input.projectId ?? undefined,
          userId: input.userId ?? undefined,
          studyId: input.studyId ?? undefined,
          result,
          completedAt: new Date(),
        },
      });
    },

    async release(input) {
      if (input.reservationId) {
        await prisma.toolIdempotencyRecord.deleteMany({
          where: {
            id: input.reservationId,
            status: "running",
          },
        });
        return;
      }

      await prisma.toolIdempotencyRecord.deleteMany({
        where: {
          scopeKey: input.scopeKey,
          toolName: input.toolName,
          fingerprint: input.fingerprint,
          status: "running",
        },
      });
    },
  };
}
