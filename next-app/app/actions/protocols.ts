"use server";

import type { ProtocolData } from "@/types/protocol";
import { getProtocol, saveProtocol } from "@/lib/server/protocols";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";

export async function getProtocolAction(projectId: string): Promise<ProtocolData | null> {
  return getProtocol(SINGLE_USER_SCOPE, projectId);
}

export async function saveProtocolAction(projectId: string, data: ProtocolData): Promise<ProtocolData> {
  return saveProtocol(SINGLE_USER_SCOPE, projectId, data);
}
