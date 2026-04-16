import {
  DEFAULT_SECTION_ORDER,
  DRAFT_SECTIONS,
  DraftMode,
  DraftSectionId,
  DraftSectionKey,
  UNSECTIONED_DRAFT_ID,
} from "@/types/draft";
import type { JSONContent } from "@tiptap/core";
import { compileDraftCitations } from "@/lib/citation-compiler";
import type { ManuscriptDocument } from "@/types/manuscript";
import {
  buildCompatContentBySection,
  coerceManuscriptDocument,
  createManuscriptDocument,
} from "@/lib/manuscript/schema";
import type { DraftAuxiliaryReference } from "@/lib/draft-import/types";
import {
  draftSectionHasMeaningfulContent,
  resolveDraftMode,
  resolveFullDraftActiveSection,
  resolveSectionModeActiveSection,
} from "@/lib/draft-state-contracts";

const DRAFT_KEY_PREFIX = "litrev_draft_v1";

export type CopilotSender = "user" | "ai";

export type CopilotMessage = {
  id: string;
  sender: CopilotSender;
  text: string;
  createdAt: string;
};

export type DraftPanelsState = {
  ledgerWidth: number;
  copilotWidth: number;
  ledgerCollapsed: boolean;
  copilotCollapsed: boolean;
};

export type DraftSectionFormat = {
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily: string;
};

export const DEFAULT_SECTION_FORMAT: DraftSectionFormat = {
  fontSize: 16,
  lineHeight: 1.85,
  paragraphSpacing: 12,
  fontFamily: "Georgia, 'Times New Roman', serif",
};

type DraftStateBase = {
  mode: DraftMode;
  activeSection: DraftSectionId | null;
  sectionOrder: DraftSectionId[];
  customSections: Record<DraftSectionId, { label: string; placeholder?: string }>;
  formattingBySection: Record<DraftSectionId, DraftSectionFormat>;
  panels: DraftPanelsState;
  contentBySection: Record<DraftSectionId, JSONContent>;
  ledgerBySection: Record<DraftSectionId, string[]>;
  copilotBySection: Record<DraftSectionId, CopilotMessage[]>;
  auxiliaryBibliography?: DraftAuxiliaryReference[];
};

export type LegacyDraftState = DraftStateBase & {
  version: 1;
};

export type DraftState = DraftStateBase & {
  version: 2;
  manuscript: ManuscriptDocument;
};

export type DraftStateInput = DraftState | LegacyDraftState;

function isBrowser() {
  return typeof window !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function storageKey(projectId: string) {
  return `${DRAFT_KEY_PREFIX}:${projectId}`;
}

export function emptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

const BASE_SECTION_IDS = DRAFT_SECTIONS.map((section) => section.key);
const createDefaultFormat = (): DraftSectionFormat => ({ ...DEFAULT_SECTION_FORMAT });

function buildSectionRecord<T>(ids: DraftSectionId[], factory: (key: DraftSectionId) => T): Record<DraftSectionId, T> {
  const record: Record<DraftSectionId, T> = {};
  for (const key of ids) {
    record[key] = factory(key);
  }
  return record;
}

function buildKnownSectionIds(customSections: Record<DraftSectionId, { label: string; placeholder?: string }>) {
  return [UNSECTIONED_DRAFT_ID, ...BASE_SECTION_IDS, ...Object.keys(customSections)] as DraftSectionId[];
}

function shouldRestoreSeededSectionBaseline(
  sectionOrder: DraftSectionId[],
  customSections: Record<DraftSectionId, { label: string; placeholder?: string }>,
  contentBySection: Record<DraftSectionId, JSONContent>,
): boolean {
  if (sectionOrder.length > 0) return false;
  if (Object.keys(customSections).length > 0) return false;
  return !draftSectionHasMeaningfulContent(contentBySection[UNSECTIONED_DRAFT_ID]);
}

function createPanelsState(): DraftPanelsState {
  return {
    ledgerWidth: 320,
    copilotWidth: 360,
    ledgerCollapsed: false,
    copilotCollapsed: false,
  };
}

export function createDefaultDraftState(): DraftState {
  const customSections = {};
  const knownSectionIds = buildKnownSectionIds(customSections);
  const sectionOrder = [...DEFAULT_SECTION_ORDER];
  const contentBySection = buildSectionRecord(knownSectionIds, () => emptyDoc());
  const manuscript = createManuscriptDocument({
    sectionOrder,
    customSections,
    contentBySection,
  });
  const compatContent = buildCompatContentBySection(manuscript);
  return {
    version: 2,
    mode: "section",
    activeSection: sectionOrder[0] ?? null,
    sectionOrder,
    customSections,
    formattingBySection: buildSectionRecord(knownSectionIds, () => createDefaultFormat()),
    panels: createPanelsState(),
    contentBySection: buildSectionRecord(knownSectionIds, (key) => compatContent[key] ?? emptyDoc()),
    ledgerBySection: buildSectionRecord(knownSectionIds, () => []),
    copilotBySection: buildSectionRecord(knownSectionIds, () => []),
    auxiliaryBibliography: [],
    manuscript,
  };
}

function coerceDraftMode(value: unknown): DraftMode | null {
  return value === "section" || value === "full" ? value : null;
}

function isBaseSectionKey(value: string): value is DraftSectionKey {
  return DRAFT_SECTIONS.some((s) => s.key === value);
}

function coerceSectionId(value: unknown): DraftSectionId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function coerceSectionFormat(value: unknown): DraftSectionFormat | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DraftSectionFormat>;
  const fontSize =
    typeof record.fontSize === "number"
      ? clampNumber(record.fontSize, 11, 28)
      : DEFAULT_SECTION_FORMAT.fontSize;
  const lineHeight =
    typeof record.lineHeight === "number"
      ? clampNumber(record.lineHeight, 1.1, 2.4)
      : DEFAULT_SECTION_FORMAT.lineHeight;
  const paragraphSpacing =
    typeof record.paragraphSpacing === "number"
      ? clampNumber(record.paragraphSpacing, 0, 32)
      : DEFAULT_SECTION_FORMAT.paragraphSpacing;
  const fontFamily =
    typeof record.fontFamily === "string" && record.fontFamily.trim().length > 0
      ? record.fontFamily
      : DEFAULT_SECTION_FORMAT.fontFamily;
  return {
    fontSize,
    lineHeight,
    paragraphSpacing,
    fontFamily,
  };
}

function coerceCustomSections(
  value: unknown,
): Record<DraftSectionId, { label: string; placeholder?: string }> {
  if (!value || typeof value !== "object") return {};
  const record: Record<DraftSectionId, { label: string; placeholder?: string }> = {};
  for (const [id, meta] of Object.entries(value)) {
    if (!id || typeof id !== "string") continue;
    if (isBaseSectionKey(id) || id === UNSECTIONED_DRAFT_ID) continue;
    if (!meta || typeof meta !== "object") continue;
    const rawLabel = (meta as { label?: unknown }).label;
    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
    if (!label) continue;
    const placeholder =
      typeof (meta as { placeholder?: unknown }).placeholder === "string"
        ? ((meta as { placeholder?: string }).placeholder ?? "").trim() || undefined
        : undefined;
    record[id] = placeholder ? { label, placeholder } : { label };
  }
  return record;
}

function coerceSectionOrder(value: unknown, knownIds: Set<DraftSectionId>): DraftSectionId[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<DraftSectionId>();
  const ordered: DraftSectionId[] = [];
  for (const entry of value) {
    const id = coerceSectionId(entry);
    if (!id || id === UNSECTIONED_DRAFT_ID || seen.has(id) || !knownIds.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

function normalizeCopilotMessage(value: unknown): CopilotMessage | null {
  if (!isRecord(value)) return null;
  const text = typeof value.text === "string" ? value.text : "";
  if (!text.trim()) return null;
  return {
    id: typeof value.id === "string" ? value.id : `m-${Date.now()}`,
    sender: value.sender === "ai" ? "ai" : "user",
    text,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalYear(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const whole = Math.floor(value);
  return whole >= 0 ? whole : undefined;
}

function normalizeAuxiliaryReference(value: unknown): DraftAuxiliaryReference | null {
  if (!isRecord(value)) return null;

  const sourceFormat = trimOptionalString(value.sourceFormat);
  const title = trimOptionalString(value.title);
  if (!sourceFormat || !title) {
    return null;
  }

  return {
    id:
      trimOptionalString(value.id)
      ?? trimOptionalString(value.sourceItemId)
      ?? `aux-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
    sourceFormat: sourceFormat as DraftAuxiliaryReference["sourceFormat"],
    sourceItemId: trimOptionalString(value.sourceItemId),
    citationKey: trimOptionalString(value.citationKey),
    title,
    authors: trimOptionalString(value.authors),
    year: normalizeOptionalYear(value.year),
    containerTitle: trimOptionalString(value.containerTitle),
    volume: trimOptionalString(value.volume),
    issue: trimOptionalString(value.issue),
    pages: trimOptionalString(value.pages),
    doi: trimOptionalString(value.doi),
    pmid: trimOptionalString(value.pmid),
    linkedStudyId: trimOptionalString(value.linkedStudyId),
  };
}

function coerceAuxiliaryBibliography(value: unknown): DraftAuxiliaryReference[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: DraftAuxiliaryReference[] = [];
  for (const entry of value) {
    const next = normalizeAuxiliaryReference(entry);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    normalized.push(next);
  }
  return normalized;
}

function createContentRecord(
  source: Record<DraftSectionId, JSONContent>,
  knownIds: DraftSectionId[],
): Record<DraftSectionId, JSONContent> {
  return buildSectionRecord(knownIds, (key) => {
    const maybe = source[key];
    return maybe && typeof maybe === "object" ? (maybe as JSONContent) : emptyDoc();
  });
}

export function normalizeDraftState(input: unknown): DraftState {
  const fallback = createDefaultDraftState();
  if (!isRecord(input)) return fallback;

  const parsed = input as Partial<DraftStateInput> & { manuscript?: unknown };
  const manuscript = coerceManuscriptDocument(parsed.manuscript);
  const derivedCustomSections = manuscript
    ? Object.fromEntries(
        manuscript.sections
          .filter((section) => section.kind === "custom")
          .map((section) => [
            section.sectionId,
            section.placeholder ? { label: section.label, placeholder: section.placeholder } : { label: section.label },
          ]),
      )
    : {};
  const customSections = {
    ...derivedCustomSections,
    ...coerceCustomSections(parsed.customSections),
  };
  const knownSectionIds = buildKnownSectionIds(customSections);
  const knownIds = new Set<DraftSectionId>(knownSectionIds);
  const manuscriptSectionOrder = manuscript
    ? manuscript.sections
        .map((section) => section.sectionId)
        .filter((sectionId) => sectionId !== UNSECTIONED_DRAFT_ID)
    : null;
  let storedOrder =
    coerceSectionOrder(parsed.sectionOrder, knownIds)
    ?? (manuscriptSectionOrder ? manuscriptSectionOrder.filter((id) => knownIds.has(id)) : null)
    ?? fallback.sectionOrder;
  const missingCustom = Object.keys(customSections).filter((id) => !storedOrder.includes(id));
  if (missingCustom.length > 0) {
    storedOrder = [...storedOrder, ...missingCustom];
  }

  const rawMode = coerceDraftMode(parsed.mode) ?? fallback.mode;
  const rawActiveSection = coerceSectionId(parsed.activeSection);
  const activeSectionCandidate =
    rawActiveSection && rawActiveSection !== UNSECTIONED_DRAFT_ID && storedOrder.includes(rawActiveSection)
      ? rawActiveSection
      : null;

  const panels: DraftPanelsState = {
    ledgerWidth: typeof parsed.panels?.ledgerWidth === "number" ? parsed.panels.ledgerWidth : fallback.panels.ledgerWidth,
    copilotWidth:
      typeof parsed.panels?.copilotWidth === "number" ? parsed.panels.copilotWidth : fallback.panels.copilotWidth,
    ledgerCollapsed:
      typeof parsed.panels?.ledgerCollapsed === "boolean"
        ? parsed.panels.ledgerCollapsed
        : fallback.panels.ledgerCollapsed,
    copilotCollapsed:
      typeof parsed.panels?.copilotCollapsed === "boolean"
        ? parsed.panels.copilotCollapsed
        : fallback.panels.copilotCollapsed,
  };

  const compatFromManuscript = manuscript ? buildCompatContentBySection(manuscript) : null;
  const rawContentSource =
    isRecord(parsed.contentBySection)
      ? (parsed.contentBySection as Record<DraftSectionId, JSONContent>)
      : compatFromManuscript ?? {};
  const contentBySection = createContentRecord(rawContentSource, knownSectionIds);

  const formattingBySection = buildSectionRecord(knownSectionIds, (key) => {
    const maybe = parsed.formattingBySection?.[key];
    return coerceSectionFormat(maybe) ?? createDefaultFormat();
  });

  const ledgerBySection = buildSectionRecord(knownSectionIds, (key) => {
    const maybe = parsed.ledgerBySection?.[key];
    return Array.isArray(maybe) ? maybe.filter((x) => typeof x === "string") : [];
  });

  const copilotBySection = buildSectionRecord(knownSectionIds, (key) => {
    const maybe = parsed.copilotBySection?.[key];
    if (!Array.isArray(maybe)) return [];
    return maybe.map(normalizeCopilotMessage).filter((message): message is CopilotMessage => Boolean(message));
  });

  const didRestoreSeededBaseline = shouldRestoreSeededSectionBaseline(storedOrder, customSections, contentBySection);
  const seededSectionOrder = didRestoreSeededBaseline ? [...DEFAULT_SECTION_ORDER] : storedOrder;

  const compiled = compileDraftCitations({
    contentBySection,
    sectionOrder: seededSectionOrder,
    includeNumberInNodes: false,
  });
  const nextManuscript = createManuscriptDocument({
    sectionOrder: seededSectionOrder,
    customSections,
    contentBySection: compiled.normalizedContentBySection,
  });
  const nextCompat = buildCompatContentBySection(nextManuscript);
  const nextSectionOrder = nextManuscript.sections
    .map((section) => section.sectionId)
    .filter((sectionId) => sectionId !== UNSECTIONED_DRAFT_ID);
  const mode = didRestoreSeededBaseline ? "section" : resolveDraftMode(rawMode, nextSectionOrder);
  const activeSection = mode === "section"
    ? resolveSectionModeActiveSection(activeSectionCandidate, nextSectionOrder)
    : resolveFullDraftActiveSection(activeSectionCandidate, nextSectionOrder);

  return {
    version: 2,
    mode,
    activeSection,
    sectionOrder: nextSectionOrder,
    customSections,
    formattingBySection,
    panels,
    contentBySection: buildSectionRecord(knownSectionIds, (key) => nextCompat[key] ?? emptyDoc()),
    ledgerBySection,
    copilotBySection,
    auxiliaryBibliography: coerceAuxiliaryBibliography(parsed.auxiliaryBibliography),
    manuscript: nextManuscript,
  };
}

export function migrateLegacyDraftStateToV2(input: LegacyDraftState): DraftState {
  return normalizeDraftState(input);
}

export function loadDraftState(projectId: string): DraftState {
  const fallback = createDefaultDraftState();
  if (!isBrowser()) return fallback;
  try {
    const stored = window.localStorage.getItem(storageKey(projectId));
    if (!stored) {
      window.localStorage.setItem(storageKey(projectId), JSON.stringify(fallback));
      return fallback;
    }
    const normalizedState = normalizeDraftState(JSON.parse(stored));
    if (stored !== JSON.stringify(normalizedState)) {
      try {
        window.localStorage.setItem(storageKey(projectId), JSON.stringify(normalizedState));
      } catch {
        // ignore write-back migration failures and keep returning normalized state
      }
    }
    return normalizedState;
  } catch (err) {
    console.warn("loadDraftState failed, using fallback", err);
    try {
      window.localStorage.setItem(storageKey(projectId), JSON.stringify(fallback));
    } catch {
      // ignore
    }
    return fallback;
  }
}

export function saveDraftState(projectId: string, state: DraftStateInput) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(normalizeDraftState(state)));
  } catch (err) {
    console.warn("saveDraftState failed", err);
  }
}
