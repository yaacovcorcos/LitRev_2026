import { DEFAULT_SECTION_ORDER, DRAFT_SECTIONS, DraftMode, DraftSectionKey } from "@/types/draft";
import type { JSONContent } from "@tiptap/core";

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

export type DraftState = {
  version: 1;
  mode: DraftMode;
  activeSection: DraftSectionKey;
  sectionOrder: DraftSectionKey[];
  panels: DraftPanelsState;
  contentBySection: Record<DraftSectionKey, JSONContent>;
  ledgerBySection: Record<DraftSectionKey, string[]>;
  copilotBySection: Record<DraftSectionKey, CopilotMessage[]>;
};

function isBrowser() {
  return typeof window !== "undefined";
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

function buildSectionRecord<T>(factory: (key: DraftSectionKey) => T): Record<DraftSectionKey, T> {
  const record = {} as Record<DraftSectionKey, T>;
  for (const section of DRAFT_SECTIONS) {
    record[section.key] = factory(section.key);
  }
  return record;
}

export function createDefaultDraftState(): DraftState {
  const defaultOrder = [...DEFAULT_SECTION_ORDER];
  const activeSection = defaultOrder[0] ?? "abstract";
  return {
    version: 1,
    mode: "section",
    activeSection,
    sectionOrder: defaultOrder,
    panels: {
      ledgerWidth: 320,
      copilotWidth: 360,
      ledgerCollapsed: false,
      copilotCollapsed: false,
    },
    contentBySection: buildSectionRecord(() => emptyDoc()),
    ledgerBySection: buildSectionRecord(() => []),
    copilotBySection: buildSectionRecord(() => []),
  };
}

function coerceDraftMode(value: unknown): DraftMode | null {
  return value === "section" || value === "full" ? value : null;
}

function coerceSectionKey(value: unknown): DraftSectionKey | null {
  if (typeof value !== "string") return null;
  return DRAFT_SECTIONS.some((s) => s.key === value) ? (value as DraftSectionKey) : null;
}

function coerceSectionOrder(value: unknown): DraftSectionKey[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<DraftSectionKey>();
  const ordered: DraftSectionKey[] = [];
  for (const entry of value) {
    const key = coerceSectionKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered.length ? ordered : null;
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
    const parsed = JSON.parse(stored) as Partial<DraftState> | null;
    if (!parsed || typeof parsed !== "object") return fallback;

    const mode = coerceDraftMode(parsed.mode) ?? fallback.mode;
    const storedOrder = coerceSectionOrder(parsed.sectionOrder) ?? fallback.sectionOrder;
    const activeSection =
      coerceSectionKey(parsed.activeSection) && storedOrder.includes(parsed.activeSection as DraftSectionKey)
        ? (parsed.activeSection as DraftSectionKey)
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

    const contentBySection = buildSectionRecord((key) => {
      const maybe = parsed.contentBySection?.[key];
      if (maybe && typeof maybe === "object") return maybe as JSONContent;
      return fallback.contentBySection[key];
    });

    const ledgerBySection = buildSectionRecord((key) => {
      const maybe = parsed.ledgerBySection?.[key];
      return Array.isArray(maybe) ? maybe.filter((x) => typeof x === "string") : fallback.ledgerBySection[key];
    });

    const copilotBySection = buildSectionRecord((key) => {
      const maybe = parsed.copilotBySection?.[key];
      if (!Array.isArray(maybe)) return fallback.copilotBySection[key];
      return maybe
        .filter((m) => m && typeof m === "object")
        .map((m) => {
          const msg = m as Partial<CopilotMessage>;
          return {
            id: typeof msg.id === "string" ? msg.id : `m-${Date.now()}`,
            sender: msg.sender === "ai" ? "ai" : "user",
            text: typeof msg.text === "string" ? msg.text : "",
            createdAt: typeof msg.createdAt === "string" ? msg.createdAt : new Date().toISOString(),
          } satisfies CopilotMessage;
        })
        .filter((m) => m.text.trim().length > 0);
    });

    return {
      version: 1,
      mode,
      activeSection,
      sectionOrder: storedOrder,
      panels,
      contentBySection,
      ledgerBySection,
      copilotBySection,
    };
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

export function saveDraftState(projectId: string, state: DraftState) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch (err) {
    console.warn("saveDraftState failed", err);
  }
}
