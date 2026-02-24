"use server";

import type { ProtocolData } from "@/types/protocol";
import { getProtocol, saveProtocol } from "@/lib/server/protocols";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { syncProtocolToMemory } from "@/lib/server/memory";
import { withAction, type ActionResult } from "@/lib/server/action-utils";

export async function getProtocolAction(projectId: string): Promise<ActionResult<ProtocolData | null>> {
  return withAction(() => getProtocol(SINGLE_USER_SCOPE, projectId));
}

export async function saveProtocolAction(projectId: string, data: ProtocolData): Promise<ActionResult<ProtocolData>> {
  return withAction(async () => {
    const saved = await saveProtocol(SINGLE_USER_SCOPE, projectId, data);
    // Fire-and-forget: sync protocol fields to memory system
    syncProtocolToMemory(projectId, data).catch((err) =>
      console.error("[protocol-sync] Failed:", err)
    );
    return saved;
  });
}
