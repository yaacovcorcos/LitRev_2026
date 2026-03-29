import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { createDefaultProtocolData, type ProtocolData } from "@/types/protocol";
import type { ScopeInput } from "@/lib/server/scope";
import type { Prisma } from "@prisma/client";

type ProtocolDbClient = typeof prisma | Prisma.TransactionClient;

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function getProtocol(
  scopeInput: ScopeInput,
  projectId: string
): Promise<ProtocolData | null> {
  await assertProjectAccess(scopeInput, projectId);
  const protocol = await prisma.protocol.findUnique({ where: { projectId } });
  return protocol?.data as unknown as ProtocolData ?? null;
}

export async function saveProtocol(
  scopeInput: ScopeInput,
  projectId: string,
  data: ProtocolData
): Promise<ProtocolData> {
  await assertProjectAccess(scopeInput, projectId);
  const saved = await prisma.protocol.upsert({
    where: { projectId },
    create: { projectId, data: toInputJsonValue(data) },
    update: { data: toInputJsonValue(data) },
  });
  return saved.data as unknown as ProtocolData;
}

/**
 * Idempotent: returns existing protocol data or creates an empty default.
 * Internal server helper — no scope check (callers are already auth-gated).
 * Uses upsert to handle the race where another request creates the row
 * between findUnique and write.
 */
export async function ensureProtocol(projectId: string): Promise<ProtocolData> {
  return ensureProtocolWithDb(prisma, projectId);
}

export async function ensureProtocolWithDb(
  db: ProtocolDbClient,
  projectId: string,
): Promise<ProtocolData> {
  const row = await db.protocol.findUnique({ where: { projectId } });
  if (row) return row.data as unknown as ProtocolData;
  const defaults = createDefaultProtocolData();
  const created = await db.protocol.upsert({
    where: { projectId },
    create: { projectId, data: toInputJsonValue(defaults) },
    update: {},
  });
  return created.data as unknown as ProtocolData;
}

export async function saveProtocolTrusted(
  db: ProtocolDbClient,
  projectId: string,
  data: ProtocolData,
): Promise<ProtocolData> {
  const saved = await db.protocol.upsert({
    where: { projectId },
    create: { projectId, data: toInputJsonValue(data) },
    update: { data: toInputJsonValue(data) },
  });
  return saved.data as unknown as ProtocolData;
}
