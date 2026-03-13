import { DEFAULT_SECTION_ORDER, DRAFT_SECTIONS, DraftMode, DraftSectionId, DraftSectionKey } from "@/types/draft";
import type { JSONContent } from "@tiptap/core";
import { compileDraftCitations } from "@/lib/citation-compiler";
import type { ManuscriptDocument } from "@/types/manuscript";
import {
  buildCompatContentBySection,
  coerceManuscriptDocument,
  createDefaultManuscriptDocument,
  createManuscriptDocument,
} from "@/lib/manuscript/schema";

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
  activeSection: DraftSectionId;
  sectionOrder: DraftSectionId[];
  customSections: Record<DraftSectionId, { label: string; placeholder?: string }>;
  formattingBySection: Record<DraftSectionId, DraftSectionFormat>;
  panels: DraftPanelsState;
  contentBySection: Record<DraftSectionId, JSONContent>;
  ledgerBySection: Record<DraftSectionId, string[]>;
  copilotBySection: Record<DraftSectionId, CopilotMessage[]>;
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

export function createDefaultDraftState(): DraftState {
  const defaultOrder = [...DEFAULT_SECTION_ORDER];
  const activeSection = defaultOrder[0] ?? "abstract";
  const manuscript = createDefaultManuscriptDocument();
  return {
    version: 2,
    mode: "section",
    activeSection,
    sectionOrder: defaultOrder,
    customSections: {},
    formattingBySection: buildSectionRecord(BASE_SECTION_IDS, () => createDefaultFormat()),
    panels: {
      ledgerWidth: 320,
      copilotWidth: 360,
      ledgerCollapsed: true,
      copilotCollapsed: false,
    },
    contentBySection: buildCompatContentBySection(manuscript),
    ledgerBySection: buildSectionRecord(BASE_SECTION_IDS, () => []),
    copilotBySection: buildSectionRecord(BASE_SECTION_IDS, () => []),
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
  value: unknown
): Record<DraftSectionId, { label: string; placeholder?: string }> {
  if (!value || typeof value !== "object") return {};
  const record: Record<DraftSectionId, { label: string; placeholder?: string }> = {};
  for (const [id, meta] of Object.entries(value)) {
    if (!id || typeof id !== "string") continue;
    if (isBaseSectionKey(id)) continue;
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
    if (!id || seen.has(id) || !knownIds.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered.length ? ordered : null;
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

export function normalizeDraftState(input: unknown): DraftState {
  const fallback = createDefaultDraftState();
  if (!isRecord(input)) return fallback;

  const parsed = input as Partial<DraftStateInput> & { manuscript?: unknown };
  const mode = coerceDraftMode(parsed.mode) ?? fallback.mode;
  const customSections = coerceCustomSections(parsed.customSections);
  const knownIds = new Set<DraftSectionId>([...BASE_SECTION_IDS, ...Object.keys(customSections)]);
  let storedOrder = coerceSectionOrder(parsed.sectionOrder, knownIds) ?? fallback.sectionOrder;
  const missingCustom = Object.keys(customSections).filter((id) => !storedOrder.includes(id));
  if (missingCustom.length) {
    storedOrder = [...storedOrder, ...missingCustom];
  }
  const activeSection =
    coerceSectionId(parsed.activeSection) && storedOrder.includes(parsed.activeSection as DraftSectionId)
      ? (parsed.activeSection as DraftSectionId)
      : storedOrder[0] ?? fallback.activeSection;

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

  const manuscript = coerceManuscriptDocument(parsed.manuscript);
  const compatFromManuscript = manuscript ? buildCompatContentBySection(manuscript) : null;
  const rawContentSource =
    isRecord(parsed.contentBySection)
      ? (parsed.contentBySection as Record<DraftSectionId, JSONContent>)
      : compatFromManuscript ?? {};

  const baseContent = buildSectionRecord(BASE_SECTION_IDS, (key) => {
    const maybe = rawContentSource[key];
    if (maybe && typeof maybe === "object") return maybe as JSONContent;
    return fallback.contentBySection[key];
  });
  const customIds = Object.keys(customSections);
  const customContent = buildSectionRecord(customIds, (key) => {
    const maybe = rawContentSource[key];
    if (maybe && typeof maybe === "object") return maybe as JSONContent;
    return emptyDoc();
  });
  const contentBySection = { ...baseContent, ...customContent };

  const baseFormatting = buildSectionRecord(BASE_SECTION_IDS, (key) => {
    const maybe = parsed.formattingBySection?.[key];
    return coerceSectionFormat(maybe) ?? createDefaultFormat();
  });
  const customFormatting = buildSectionRecord(customIds, (key) => {
    const maybe = parsed.formattingBySection?.[key];
    return coerceSectionFormat(maybe) ?? createDefaultFormat();
  });
  const formattingBySection = { ...baseFormatting, ...customFormatting };

  const baseLedger = buildSectionRecord(BASE_SECTION_IDS, (key) => {
    const maybe = parsed.ledgerBySection?.[key];
    return Array.isArray(maybe) ? maybe.filter((x) => typeof x === "string") : fallback.ledgerBySection[key];
  });
  const customLedger = buildSectionRecord(customIds, (key) => {
    const maybe = parsed.ledgerBySection?.[key];
    return Array.isArray(maybe) ? maybe.filter((x) => typeof x === "string") : [];
  });
  const ledgerBySection = { ...baseLedger, ...customLedger };

  const baseCopilot = buildSectionRecord(BASE_SECTION_IDS, (key) => {
    const maybe = parsed.copilotBySection?.[key];
    if (!Array.isArray(maybe)) return fallback.copilotBySection[key];
    return maybe.map(normalizeCopilotMessage).filter((message): message is CopilotMessage => Boolean(message));
  });
  const customCopilot = buildSectionRecord(customIds, (key) => {
    const maybe = parsed.copilotBySection?.[key];
    if (!Array.isArray(maybe)) return [];
    return maybe.map(normalizeCopilotMessage).filter((message): message is CopilotMessage => Boolean(message));
  });
  const copilotBySection = { ...baseCopilot, ...customCopilot };

  const compiled = compileDraftCitations({
    contentBySection,
    sectionOrder: storedOrder,
    includeNumberInNodes: false,
  });
  const nextManuscript = createManuscriptDocument({
    sectionOrder: storedOrder,
    customSections,
    contentBySection: compiled.normalizedContentBySection,
  });

  return {
    version: 2,
    mode,
    activeSection,
    sectionOrder: storedOrder,
    customSections,
    formattingBySection,
    panels,
    contentBySection: buildCompatContentBySection(nextManuscript),
    ledgerBySection,
    copilotBySection,
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
