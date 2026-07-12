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

export type ToolIdempotencyReserveOptions = {
  staleRunningBefore?: Date;
  now?: Date;
};

export type ToolIdempotencyStore = {
  reserve(
    input: ToolIdempotencyReservationInput,
    options?: ToolIdempotencyReserveOptions
  ): Promise<ToolIdempotencyReservation>;
  complete(input: ToolIdempotencyReservationInput & {
    reservationId: string;
    result: ToolResult;
  }): Promise<void>;
  release(input: ToolIdempotencyRecordKey & {
    reservationId: string;
    callId: string;
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
    async reserve(input, options) {
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
          createdAt: true,
        },
      });

      if (existing?.status === "completed") {
        const result = fromStoredToolResult(existing.result);
        if (result) {
          return { status: "replay", result };
        }
      }

      if (
        existing?.status === "running"
        && options?.staleRunningBefore
        && existing.createdAt < options.staleRunningBefore
      ) {
        const updated = await prisma.toolIdempotencyRecord.updateMany({
          where: {
            id: existing.id,
            status: "running",
            createdAt: { lt: options.staleRunningBefore },
          },
          data: {
            callId: input.callId,
            runId: input.runId ?? null,
            projectId: input.projectId ?? null,
            userId: input.userId ?? null,
            studyId: input.studyId ?? null,
            completedAt: null,
            createdAt: options.now ?? new Date(),
          },
        });
        if (updated.count > 0) {
          return { status: "reserved", reservationId: existing.id };
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

      const updated = await prisma.toolIdempotencyRecord.updateMany({
        where: {
          id: input.reservationId,
          status: "running",
          callId: input.callId,
        },
        data,
      });
      if (updated.count !== 1) {
        throw new Error("Tool idempotency reservation is no longer owned by this call.");
      }
    },

    async release(input) {
      await prisma.toolIdempotencyRecord.deleteMany({
        where: {
          id: input.reservationId,
          status: "running",
          callId: input.callId,
        },
      });
    },
  };
}
