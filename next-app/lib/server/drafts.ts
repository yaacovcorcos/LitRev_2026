import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { normalizeDraftState, type DraftState, type DraftStateInput } from "@/lib/draftStorage";
import type { Prisma } from "@prisma/client";
import type { ScopeInput } from "@/lib/server/scope";

function toJsonValue(value: DraftStateInput): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(normalizeDraftState(value))) as Prisma.InputJsonValue;
}

export async function getDraft(
  scopeInput: ScopeInput,
  projectId: string
): Promise<DraftState | null> {
  await assertProjectAccess(scopeInput, projectId);
  const draft = await prisma.draft.findUnique({ where: { projectId } });
  return draft?.state ? normalizeDraftState(draft.state) : null;
}

export async function saveDraft(
  scopeInput: ScopeInput,
  projectId: string,
  state: DraftStateInput
): Promise<DraftState> {
  await assertProjectAccess(scopeInput, projectId);
  const normalizedState = toJsonValue(state);
  const saved = await prisma.draft.upsert({
    where: { projectId },
    create: { projectId, state: normalizedState },
    update: { state: normalizedState },
  });
  return normalizeDraftState(saved.state);
}
