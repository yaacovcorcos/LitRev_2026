import { buildCompatContentBySection, coerceManuscriptDocument } from "@/lib/manuscript/schema";
import {
  createDefaultDraftState,
  normalizeDraftState,
  type DraftSectionFormat,
  type DraftState,
  type DraftStateInput,
} from "@/lib/draft-storage";
import { compileDraftCitations } from "@/lib/citation-compiler";
import type { ManuscriptDocument } from "@/types/manuscript";
import type { DraftSectionId } from "@/types/draft";

type RichTextContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichTextContent[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

export type DraftCheckpointKind = "manual" | "ai_apply" | "export";

export type DraftCheckpointSnapshot = {
  manuscript: ManuscriptDocument;
  sectionOrder: DraftSectionId[];
  customSections: DraftState["customSections"];
  formattingBySection: Record<DraftSectionId, DraftSectionFormat>;
  ledgerBySection: Record<DraftSectionId, string[]>;
};

export type DraftCheckpointRecord = {
  id: string;
  projectId: string;
  workspaceId?: string;
  label?: string;
  kind: DraftCheckpointKind;
  snapshot: DraftCheckpointSnapshot;
  fileAssetId?: string;
  artifactId?: string;
  conversationId?: string;
  createdAt: string;
};

export type DraftCheckpointSectionDelta = {
  sectionId: DraftSectionId;
  currentWordCount: number;
  checkpointWordCount: number;
  deltaWordCount: number;
};

export type DraftCheckpointComparison = {
  checkpointId: string;
  addedSectionIds: DraftSectionId[];
  removedSectionIds: DraftSectionId[];
  changedSectionIds: DraftSectionId[];
  referencesOrderChanged: boolean;
  sectionDeltas: DraftCheckpointSectionDelta[];
};

function extractPlainTextFromContent(content: RichTextContent | null | undefined): string {
  if (!content) return "";
  if (typeof content.text === "string") return content.text;
  if (!Array.isArray(content.content)) return "";
  return content.content.map(extractPlainTextFromContent).join(" ").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceCheckpointSectionId(value: unknown): DraftSectionId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceSectionOrder(value: unknown): DraftSectionId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ordered: DraftSectionId[] = [];
  for (const entry of value) {
    const sectionId = coerceCheckpointSectionId(entry);
    if (!sectionId || seen.has(sectionId)) continue;
    seen.add(sectionId);
    ordered.push(sectionId);
  }
  return ordered;
}

export function buildDraftCheckpointSnapshot(draftState: DraftStateInput): DraftCheckpointSnapshot {
  const normalized = normalizeDraftState(draftState);
  return {
    manuscript: normalized.manuscript,
    sectionOrder: normalized.sectionOrder,
    customSections: normalized.customSections,
    formattingBySection: normalized.formattingBySection,
    ledgerBySection: normalized.ledgerBySection,
  };
}

export function normalizeDraftCheckpointSnapshot(input: unknown): DraftCheckpointSnapshot {
  const fallback = buildDraftCheckpointSnapshot(createDefaultDraftState());
  if (!isRecord(input)) return fallback;

  const manuscript = coerceManuscriptDocument(input.manuscript) ?? fallback.manuscript;
  const rebuiltContent = buildCompatContentBySection(manuscript);

  const normalized = normalizeDraftState({
    version: 2,
    mode: "section",
    activeSection: null,
    sectionOrder: coerceSectionOrder(input.sectionOrder),
    customSections: isRecord(input.customSections) ? input.customSections : {},
    formattingBySection: isRecord(input.formattingBySection) ? input.formattingBySection : {},
    panels: createDefaultDraftState().panels,
    contentBySection: rebuiltContent,
    ledgerBySection: isRecord(input.ledgerBySection) ? input.ledgerBySection : {},
    copilotBySection: {},
    manuscript,
  });

  return buildDraftCheckpointSnapshot(normalized);
}

export function rebuildDraftStateFromCheckpointSnapshot(
  snapshot: DraftCheckpointSnapshot,
  currentDraft?: DraftStateInput | null,
): DraftState {
  const base = currentDraft ? normalizeDraftState(currentDraft) : createDefaultDraftState();
  const compatContent = buildCompatContentBySection(snapshot.manuscript);

  return normalizeDraftState({
    version: 2,
    mode: base.mode,
    activeSection: base.activeSection,
    sectionOrder: snapshot.sectionOrder,
    customSections: snapshot.customSections,
    formattingBySection: snapshot.formattingBySection,
    panels: base.panels,
    contentBySection: compatContent,
    ledgerBySection: snapshot.ledgerBySection,
    copilotBySection: base.copilotBySection,
    manuscript: snapshot.manuscript,
  });
}

function countWords(doc: RichTextContent): number {
  const text = extractPlainTextFromContent(doc)?.trim() ?? "";
  return text.length > 0 ? text.split(/\s+/).length : 0;
}

function compareReferenceOrder(currentDraft: DraftState, checkpointDraft: DraftState): boolean {
  const currentOrder = compileDraftCitations({
    contentBySection: currentDraft.contentBySection,
    sectionOrder: currentDraft.sectionOrder,
  }).orderedStudyIds;
  const checkpointOrder = compileDraftCitations({
    contentBySection: checkpointDraft.contentBySection,
    sectionOrder: checkpointDraft.sectionOrder,
  }).orderedStudyIds;

  if (currentOrder.length !== checkpointOrder.length) {
    return true;
  }
  return currentOrder.some((studyId, index) => studyId !== checkpointOrder[index]);
}

export function compareDraftCheckpointSnapshot(
  currentDraftInput: DraftStateInput,
  snapshot: DraftCheckpointSnapshot,
  checkpointId: string,
): DraftCheckpointComparison {
  const currentDraft = normalizeDraftState(currentDraftInput);
  const checkpointDraft = rebuildDraftStateFromCheckpointSnapshot(snapshot, currentDraft);

  const currentSectionIds = new Set(currentDraft.sectionOrder);
  const checkpointSectionIds = new Set(checkpointDraft.sectionOrder);

  const addedSectionIds = checkpointDraft.sectionOrder.filter((sectionId) => !currentSectionIds.has(sectionId));
  const removedSectionIds = currentDraft.sectionOrder.filter((sectionId) => !checkpointSectionIds.has(sectionId));
  const sharedSectionIds = currentDraft.sectionOrder.filter((sectionId) => checkpointSectionIds.has(sectionId));

  const sectionDeltas = sharedSectionIds
    .map((sectionId) => {
      const currentWordCount = countWords(currentDraft.contentBySection[sectionId] as RichTextContent);
      const checkpointWordCount = countWords(checkpointDraft.contentBySection[sectionId] as RichTextContent);
      return {
        sectionId,
        currentWordCount,
        checkpointWordCount,
        deltaWordCount: checkpointWordCount - currentWordCount,
      };
    })
    .filter((delta) => delta.deltaWordCount !== 0);

  const changedSectionIds = sectionDeltas.map((delta) => delta.sectionId);

  return {
    checkpointId,
    addedSectionIds,
    removedSectionIds,
    changedSectionIds,
    referencesOrderChanged: compareReferenceOrder(currentDraft, checkpointDraft),
    sectionDeltas,
  };
}

export function toDraftCheckpointRecord(record: {
  id: string;
  projectId: string;
  workspaceId: string | null;
  label: string | null;
  kind: string;
  snapshot: unknown;
  fileAssetId: string | null;
  artifactId: string | null;
  conversationId: string | null;
  createdAt: Date;
}): DraftCheckpointRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    workspaceId: record.workspaceId ?? undefined,
    label: record.label ?? undefined,
    kind: (record.kind as DraftCheckpointKind) ?? "manual",
    snapshot: normalizeDraftCheckpointSnapshot(record.snapshot),
    fileAssetId: record.fileAssetId ?? undefined,
    artifactId: record.artifactId ?? undefined,
    conversationId: record.conversationId ?? undefined,
    createdAt: record.createdAt.toISOString(),
  };
}
