import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { DraftState } from "@/lib/draftStorage";
import type { ServiceScope, ScopeInput } from "@/lib/server/scope";

export async function getDraft(
  scopeInput: ScopeInput,
  projectId: string
): Promise<DraftState | null> {
  await assertProjectAccess(scopeInput, projectId);
  const draft = await prisma.draft.findUnique({ where: { projectId } });
  return (draft?.state as DraftState) ?? null;
}

export async function saveDraft(
  scopeInput: ScopeInput,
  projectId: string,
  state: DraftState
): Promise<DraftState> {
  await assertProjectAccess(scopeInput, projectId);
  const saved = await prisma.draft.upsert({
    where: { projectId },
    create: { projectId, state },
    update: { state },
  });
  return saved.state as DraftState;
}
