import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ProtocolData } from "@/types/protocol";
import type { ServiceScope } from "@/lib/server/scope";
import { Prisma } from "@prisma/client";

export async function getProtocol(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string
): Promise<ProtocolData | null> {
  await assertProjectAccess(scopeInput, projectId);
  const protocol = await prisma.protocol.findUnique({ where: { projectId } });
  return protocol?.data as unknown as ProtocolData ?? null;
}

export async function saveProtocol(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  data: ProtocolData
): Promise<ProtocolData> {
  await assertProjectAccess(scopeInput, projectId);
  const saved = await prisma.protocol.upsert({
    where: { projectId },
    create: { projectId, data: data as unknown as Prisma.JsonObject },
    update: { data: data as unknown as Prisma.JsonObject },
  });
  return saved.data as unknown as ProtocolData;
}
