/**
 * Storage utility for the unified Project Copilot state.
 * This manages a single copilot instance per project that works across
 * all project pages (Draft, Protocol, Ledger).
 */

import type { AIErrorEnvelope, ConversationMessageAttachment, CopilotPage, UserInputRequest } from "@/types/ai";

const PROJECT_COPILOT_KEY_PREFIX = "litrev_project_copilot_v1";

export type CopilotSender = "user" | "ai";

export type CopilotMessageAttachment = ConversationMessageAttachment;

export type CopilotMessage = {
  id: string;
  sender: CopilotSender;
  text: string;
  progress?: {
    message: string;
    current?: number;
    total?: number;
  };
  streamError?: AIErrorEnvelope;
  reasoning?: {
    text: string;
    state?: "streaming" | "done";
    truncated?: boolean;
  };
  createdAt: string;
  /** Optional context about where this message was sent from */
  context?: {
    page: CopilotPage;
    section?: string;
  };
  /** File attachments on this message */
  attachments?: CopilotMessageAttachment[];
  /** Artifact data when this message represents an inline artifact (Phase 2) */
  artifact?: {
    id: string;
    type: string;
    status: string;
    title: string;
    payload: Record<string, unknown>;
    version: number;
  };
  /** Structured ask_user request emitted by the runtime */
  userInputRequest?: (UserInputRequest & {
    answered?: boolean;
    answer?: string;
  });
  /** Structured checkpoint emitted by the runtime */
  checkpoint?: {
    label: string;
  };
  /** Structured tool activity metadata for timeline rendering */
  toolActivity?: {
    callId: string;
    toolName: string;
    status: "queued" | "running" | "done" | "failed" | "interrupted";
    summary?: string;
    queryPreview?: string;
    returnedCount?: number;
    totalResults?: number;
    resultIdentifiers?: string[];
    errorMeta?: AIErrorEnvelope;
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
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
        const hasStructuredPayload = Boolean(
          msg.progress || msg.userInputRequest || msg.toolActivity || msg.artifact || msg.checkpoint
        );
        if (text.trim().length > 0 || hasStructuredPayload) {
          messages.push({
            id,
            sender,
            text,
            createdAt,
            context: msg.context,
            progress: msg.progress,
            reasoning: msg.reasoning,
            streamError: msg.streamError,
            artifact: msg.artifact,
            attachments: msg.attachments,
            userInputRequest: msg.userInputRequest,
            checkpoint: msg.checkpoint,
            toolActivity: msg.toolActivity,
          });
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
