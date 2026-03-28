const AI_ENTRY_KEY_PREFIX = "litrev:ai-entry:v1:";
const AI_ENTRY_VERSION = 1 as const;
const AI_ENTRY_GLOBAL_SCOPE = "__global__";
const DEFAULT_AI_ENTRY_RESTORE_TIMEOUT_MS = 15 * 60 * 1000;

export type AiEntryRestoreStateV1 = {
  version: 1;
  lastConversationId: string | null;
  lastRecoverableRunId: string | null;
  lastRecoverableAtMs: number | null;
};

type RestoreReason =
  | "no_state"
  | "id_missing"
  | "ttl_expired"
  | "conversation_invalid"
  | "restored";

export type AiEntryRestoreDecision =
  | { shouldRestore: false; reason: Exclude<RestoreReason, "restored"> }
  | { shouldRestore: true; reason: "restored"; conversationId: string; runId: string };

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function normalizeScopeKey(projectId: string | null | undefined): string {
  return projectId?.trim() || AI_ENTRY_GLOBAL_SCOPE;
}

function keyForScope(projectId: string | null | undefined): string {
  return `${AI_ENTRY_KEY_PREFIX}${normalizeScopeKey(projectId)}`;
}

function isValidState(value: unknown): value is AiEntryRestoreStateV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === AI_ENTRY_VERSION &&
    (candidate.lastConversationId === null || typeof candidate.lastConversationId === "string") &&
    (candidate.lastRecoverableRunId === null || typeof candidate.lastRecoverableRunId === "string") &&
    (candidate.lastRecoverableAtMs === null || typeof candidate.lastRecoverableAtMs === "number")
  );
}

export function getAiEntryRestoreTimeoutMs(): number {
  return DEFAULT_AI_ENTRY_RESTORE_TIMEOUT_MS;
}

export function readAiEntryRestoreState(projectId: string | null | undefined): AiEntryRestoreStateV1 | null {
  if (!canUseStorage()) return null;
  const storageKey = keyForScope(projectId);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidState(parsed)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage failures and fail soft.
    }
    return null;
  }
}

export function writeAiEntryRestoreState(
  projectId: string | null | undefined,
  patch: Partial<AiEntryRestoreStateV1>,
): void {
  if (!canUseStorage()) return;
  const prev = readAiEntryRestoreState(projectId);
  const next: AiEntryRestoreStateV1 = {
    version: AI_ENTRY_VERSION,
    lastConversationId: prev?.lastConversationId ?? null,
    lastRecoverableRunId: prev?.lastRecoverableRunId ?? null,
    lastRecoverableAtMs: prev?.lastRecoverableAtMs ?? null,
    ...patch,
  };
  try {
    window.localStorage.setItem(keyForScope(projectId), JSON.stringify(next));
  } catch {
    // Ignore storage failures and fail soft.
  }
}

export function clearAiEntryRestoreState(projectId: string | null | undefined): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(keyForScope(projectId));
  } catch {
    // Ignore storage failures and fail soft.
  }
}

export function markAiRecoverableRun(
  projectId: string | null | undefined,
  params: {
    conversationId: string;
    runId: string;
    atMs?: number;
  },
): void {
  writeAiEntryRestoreState(projectId, {
    lastConversationId: params.conversationId,
    lastRecoverableRunId: params.runId,
    lastRecoverableAtMs: params.atMs ?? Date.now(),
  });
}

export function decideAiEntryRestore(
  state: AiEntryRestoreStateV1 | null,
  nowMs: number,
  knownConversationIds?: Set<string>,
): AiEntryRestoreDecision {
  if (!state) return { shouldRestore: false, reason: "no_state" };
  if (
    !state.lastConversationId
    || !state.lastRecoverableRunId
    || state.lastRecoverableAtMs == null
  ) {
    return { shouldRestore: false, reason: "id_missing" };
  }
  if (nowMs - state.lastRecoverableAtMs > getAiEntryRestoreTimeoutMs()) {
    return { shouldRestore: false, reason: "ttl_expired" };
  }
  if (knownConversationIds && !knownConversationIds.has(state.lastConversationId)) {
    return { shouldRestore: false, reason: "conversation_invalid" };
  }
  return {
    shouldRestore: true,
    reason: "restored",
    conversationId: state.lastConversationId,
    runId: state.lastRecoverableRunId,
  };
}
