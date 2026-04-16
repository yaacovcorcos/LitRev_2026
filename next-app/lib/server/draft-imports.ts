import "server-only";

import { createDraftCheckpoint, type CreateDraftCheckpointInput } from "@/lib/server/draft-checkpoints";
import { getDraft, saveDraft } from "@/lib/server/drafts";
import { listStudies } from "@/lib/server/ledger";
import type { ScopeInput } from "@/lib/server/scope";
import type { DraftImportPayload, DraftImportResult } from "@/lib/draft-import/types";
import { parseDraftImportPayload } from "@/lib/draft-import";
import { buildDraftImportApplyPlan, type DraftImportApplyPlan } from "@/lib/draft-import/reconcile";
import type { DraftCheckpointRecord } from "@/lib/draft-checkpoints";

export type ExecuteDraftImportInput = {
  projectId: string;
  payload: DraftImportPayload;
  mode?: "dry-run" | "apply";
};

export type ExecuteDraftImportResult = {
  result: DraftImportResult;
  applyPlan: DraftImportApplyPlan;
  draft?: Awaited<ReturnType<typeof getDraft>>;
  checkpoint?: DraftCheckpointRecord;
};

function checkpointInput(projectId: string, sourceLabel: string, draftState: DraftImportApplyPlan["nextDraft"]): CreateDraftCheckpointInput {
  return {
    projectId,
    kind: "import",
    label: `Import ${sourceLabel}`,
    draftState,
  };
}

export async function executeDraftImport(
  scopeInput: ScopeInput,
  input: ExecuteDraftImportInput,
): Promise<ExecuteDraftImportResult> {
  const mode = input.mode ?? "dry-run";
  const [currentDraft, studies] = await Promise.all([
    getDraft(scopeInput, input.projectId),
    listStudies(scopeInput, input.projectId),
  ]);

  const result = await parseDraftImportPayload(input.payload, {
    sourceLabel: input.payload.filename ?? `import.${input.payload.format}`,
    studies,
    auxiliaryBibliography: currentDraft?.auxiliaryBibliography ?? [],
  });
  const applyPlan = buildDraftImportApplyPlan(currentDraft, result);

  if (mode === "dry-run" || !applyPlan.changed) {
    return {
      result,
      applyPlan,
      draft: currentDraft,
    };
  }

  const checkpoint = await createDraftCheckpoint(
    scopeInput,
    checkpointInput(input.projectId, result.sourceLabel, currentDraft ?? applyPlan.nextDraft),
  );
  const draft = await saveDraft(scopeInput, input.projectId, applyPlan.nextDraft);

  return {
    result,
    applyPlan,
    draft,
    checkpoint,
  };
}
