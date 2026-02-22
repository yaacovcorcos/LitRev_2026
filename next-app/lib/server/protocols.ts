import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ProtocolData } from "@/types/protocol";
import type { ServiceScope, ScopeInput } from "@/lib/server/scope";

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
    create: { projectId, data: data as any },
    update: { data: data as any },
  });
  return saved.data as unknown as ProtocolData;
}
