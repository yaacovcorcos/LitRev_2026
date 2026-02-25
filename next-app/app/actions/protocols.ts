"use server";

import type { ProtocolData } from "@/types/protocol";
import { getProtocol, saveProtocol } from "@/lib/server/protocols";
import { syncProtocolToMemory } from "@/lib/server/memory";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";

export async function getProtocolAction(projectId: string): Promise<ActionResult<ProtocolData | null>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      getProtocol({ ownerId: userId, workspaceId }, projectId),
    ),
  );
}

export async function saveProtocolAction(projectId: string, data: ProtocolData): Promise<ActionResult<ProtocolData>> {
  return withAction(() =>
    withAuth(async ({ userId, workspaceId }) => {
      const saved = await saveProtocol({ ownerId: userId, workspaceId }, projectId, data);
      // Fire-and-forget: sync protocol fields to memory system
      syncProtocolToMemory(projectId, data).catch((err) =>
        console.error("[protocol-sync] Failed:", err)
      );
      return saved;
    }),
  );
}
