"use server";

import { z } from "zod";
import type { ProtocolData } from "@/types/protocol";
import { getProtocol, saveProtocol } from "@/lib/server/protocols";
import { syncProtocolToMemory } from "@/lib/server/memory";
import { logServerError } from "@/lib/server/logging";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";
import { protocolDataSchema } from "@/lib/schemas/protocol";

export async function getProtocolAction(projectId: string): Promise<ActionResult<ProtocolData | null>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      getProtocol({ ownerId: userId, workspaceId }, id),
    ),
  );
}

const saveProtocolInput = z.object({
  projectId: projectIdSchema,
  data: protocolDataSchema,
});

export async function saveProtocolAction(projectId: string, data: ProtocolData): Promise<ActionResult<ProtocolData>> {
  return withValidatedAction(saveProtocolInput, { projectId, data },
    (v) => withAuth(async ({ userId, workspaceId }) => {
      const saved = await saveProtocol({ ownerId: userId, workspaceId }, v.projectId, v.data as ProtocolData);
      syncProtocolToMemory(v.projectId, v.data as ProtocolData).catch((err) =>
        logServerError("protocol-sync", "protocol memory sync failed", {
          projectId: v.projectId,
        }, err)
      );
      return saved;
    }),
  );
}
