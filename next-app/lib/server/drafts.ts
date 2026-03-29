import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { normalizeDraftState, type DraftState, type DraftStateInput } from "@/lib/draftStorage";
import type { Prisma } from "@prisma/client";
import type { ScopeInput } from "@/lib/server/scope";

type DraftDbClient = typeof prisma | Prisma.TransactionClient;

function toJsonValue(value: DraftStateInput): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(normalizeDraftState(value))) as Prisma.InputJsonValue;
}

export async function getDraft(
  scopeInput: ScopeInput,
  projectId: string
): Promise<DraftState | null> {
  await assertProjectAccess(scopeInput, projectId);
  return getDraftTrusted(prisma, projectId);
}

export async function saveDraft(
  scopeInput: ScopeInput,
  projectId: string,
  state: DraftStateInput
): Promise<DraftState> {
  await assertProjectAccess(scopeInput, projectId);
  return saveDraftTrusted(prisma, projectId, state);
}

export async function getDraftTrusted(
  db: DraftDbClient,
  projectId: string,
): Promise<DraftState | null> {
  const draft = await db.draft.findUnique({ where: { projectId } });
  return draft?.state ? normalizeDraftState(draft.state) : null;
}

export async function saveDraftTrusted(
  db: DraftDbClient,
  projectId: string,
  state: DraftStateInput,
): Promise<DraftState> {
  const normalizedState = toJsonValue(state);
  const saved = await db.draft.upsert({
    where: { projectId },
    create: { projectId, state: normalizedState },
    update: { state: normalizedState },
  });
  return normalizeDraftState(saved.state);
}
