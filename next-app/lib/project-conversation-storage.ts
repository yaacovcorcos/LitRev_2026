/**
 * Storage utility for the shared project conversation state.
 * This manages one runtime per project across the main conversation surface
 * and the side-panel project copilot.
 */

import type { AIErrorEnvelope, ConversationMessageAttachment, CopilotPage, UserInputRequest } from "@/types/ai";

const PROJECT_CONVERSATION_KEY_PREFIX = "litrev_project_conversation_v1";
const LEGACY_PROJECT_COPILOT_KEY_PREFIX = "litrev_project_copilot_v1";

export type ProjectConversationSender = "user" | "ai";

export type ProjectConversationMessageAttachment = ConversationMessageAttachment;

export type ProjectConversationMessage = {
  id: string;
  sender: ProjectConversationSender;
  text: string;
  deliveryState?: "reserved";
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
  attachments?: ProjectConversationMessageAttachment[];
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
  userInputRequest?: UserInputRequest;
  /** Structured checkpoint emitted by the runtime */
  checkpoint?: {
    label: string;
    runId?: string;
    checkpointKind?: "standard" | "recovery";
  };
  /** Structured tool activity metadata for timeline rendering */
  toolActivity?: {
    callId: string;
    toolName: string;
    status: "queued" | "running" | "done" | "failed" | "interrupted";
    displayLabel?: string;
    inputPreview?: string;
    outcomeSummary?: string;
    sourceBadge?: string;
    detailItems?: string[];
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

export type ProjectConversationPanelState = {
  width: number;
  collapsed: boolean;
};

export type ProjectConversationState = {
  version: 1;
  panel: ProjectConversationPanelState;
  messages: ProjectConversationMessage[];
};

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(projectId: string, prefix = PROJECT_CONVERSATION_KEY_PREFIX) {
  return `${prefix}:${projectId}`;
}

function legacyStorageKey(projectId: string) {
  return storageKey(projectId, LEGACY_PROJECT_COPILOT_KEY_PREFIX);
}

function persistState(projectId: string, state: ProjectConversationState) {
  window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
}

export function createDefaultProjectConversationState(): ProjectConversationState {
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

export function loadProjectConversationState(projectId: string): ProjectConversationState {
  const fallback = createDefaultProjectConversationState();
  if (!isBrowser()) return fallback;
  try {
    const currentKey = storageKey(projectId);
    const previousKey = legacyStorageKey(projectId);
    const stored = window.localStorage.getItem(currentKey) ?? window.localStorage.getItem(previousKey);
    if (!stored) {
      persistState(projectId, fallback);
      return fallback;
    }
    const parsed = JSON.parse(stored) as Partial<ProjectConversationState> | null;
    if (!parsed || typeof parsed !== "object") return fallback;

    const panel: ProjectConversationPanelState = {
      width:
        typeof parsed.panel?.width === "number"
          ? clampNumber(parsed.panel.width, 300, 560)
          : fallback.panel.width,
      collapsed:
        typeof parsed.panel?.collapsed === "boolean"
          ? parsed.panel.collapsed
          : fallback.panel.collapsed,
    };

    const messages: ProjectConversationMessage[] = [];
    if (Array.isArray(parsed.messages)) {
      for (const m of parsed.messages) {
        if (!m || typeof m !== "object") continue;
        const msg = m as Partial<ProjectConversationMessage>;
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
            deliveryState: msg.deliveryState === "reserved" ? "reserved" : undefined,
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

    const nextState: ProjectConversationState = {
      version: 1,
      panel,
      messages,
    };

    if (!window.localStorage.getItem(currentKey) && window.localStorage.getItem(previousKey)) {
      persistState(projectId, nextState);
    }

    return nextState;
  } catch (err) {
    console.warn("loadProjectConversationState failed, using fallback", err);
    try {
      persistState(projectId, fallback);
    } catch {
      // ignore
    }
    return fallback;
  }
}

export function saveProjectConversationState(projectId: string, state: ProjectConversationState) {
  if (!isBrowser()) return;
  try {
    persistState(projectId, state);
  } catch (err) {
    console.warn("saveProjectConversationState failed", err);
  }
}
