/**
 * Storage utility for the unified Project Copilot state.
 * This manages a single copilot instance per project that works across
 * all project pages (Draft, Protocol, Ledger).
 */

const PROJECT_COPILOT_KEY_PREFIX = "litrev_project_copilot_v1";

export type CopilotSender = "user" | "ai";

export type CopilotMessage = {
  id: string;
  sender: CopilotSender;
  text: string;
  createdAt: string;
  /** Optional context about where this message was sent from */
  context?: {
    page: "draft" | "protocol" | "ledger" | "study";
    section?: string;
  };
};

export type ProjectCopilotPanelState = {
  width: number;
  collapsed: boolean;
};

export type ProjectCopilotState = {
  version: 1;
  panel: ProjectCopilotPanelState;
  messages: CopilotMessage[];
};

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(projectId: string) {
  return `${PROJECT_COPILOT_KEY_PREFIX}:${projectId}`;
}

export function createDefaultProjectCopilotState(): ProjectCopilotState {
  return {
    version: 1,
    panel: {
      width: 360,
      collapsed: false,
    },
    messages: [],
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function loadProjectCopilotState(projectId: string): ProjectCopilotState {
  const fallback = createDefaultProjectCopilotState();
  if (!isBrowser()) return fallback;
  try {
    const stored = window.localStorage.getItem(storageKey(projectId));
    if (!stored) {
      window.localStorage.setItem(storageKey(projectId), JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(stored) as Partial<ProjectCopilotState> | null;
    if (!parsed || typeof parsed !== "object") return fallback;

    const panel: ProjectCopilotPanelState = {
      width:
        typeof parsed.panel?.width === "number"
          ? clampNumber(parsed.panel.width, 300, 560)
          : fallback.panel.width,
      collapsed:
        typeof parsed.panel?.collapsed === "boolean"
          ? parsed.panel.collapsed
          : fallback.panel.collapsed,
    };

    const messages: CopilotMessage[] = [];
    if (Array.isArray(parsed.messages)) {
      for (const m of parsed.messages) {
        if (!m || typeof m !== "object") continue;
        const msg = m as Partial<CopilotMessage>;
        const id = typeof msg.id === "string" ? msg.id : `m-${Date.now()}`;
        const sender = msg.sender === "ai" ? "ai" : "user";
        const text = typeof msg.text === "string" ? msg.text : "";
        const createdAt = typeof msg.createdAt === "string" ? msg.createdAt : new Date().toISOString();
        if (text.trim().length > 0) {
          messages.push({ id, sender, text, createdAt, context: msg.context });
        }
      }
    }

    return {
      version: 1,
      panel,
      messages,
    };
  } catch (err) {
    console.warn("loadProjectCopilotState failed, using fallback", err);
    try {
      window.localStorage.setItem(storageKey(projectId), JSON.stringify(fallback));
    } catch {
      // ignore
    }
    return fallback;
  }
}

export function saveProjectCopilotState(projectId: string, state: ProjectCopilotState) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch (err) {
    console.warn("saveProjectCopilotState failed", err);
  }
}
