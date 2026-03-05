export type ProjectModeBucket = "conversation" | "workspace";

export type ProjectEntryStateV1 = {
  version: 1;
  lastModeBucket: ProjectModeBucket;
  lastConversationId: string | null;
  lastConversationActiveAtMs: number | null;
};

type RestoreReason =
  | "no_state"
  | "workspace_bucket"
  | "id_missing"
  | "ttl_expired"
  | "id_invalid"
  | "restored";

export type ConversationRestoreDecision =
  | { shouldRestore: false; reason: Exclude<RestoreReason, "restored"> }
  | { shouldRestore: true; reason: "restored"; conversationId: string };

const PROJECT_ENTRY_KEY_PREFIX = "litrev:project-entry:v1:";
const PROJECT_ENTRY_VERSION = 1 as const;
const DEFAULT_RESTORE_TIMEOUT_MS = 15 * 60 * 1000;

export function isProjectEntryRestoreEnabled(): boolean {
  const publicValue = process.env.NEXT_PUBLIC_ENABLE_PROJECT_ENTRY_RESTORE;
  return publicValue !== "0";
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function keyForProject(projectId: string): string {
  return `${PROJECT_ENTRY_KEY_PREFIX}${projectId}`;
}

function isValidModeBucket(value: unknown): value is ProjectModeBucket {
  return value === "conversation" || value === "workspace";
}

function isValidState(value: unknown): value is ProjectEntryStateV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === PROJECT_ENTRY_VERSION &&
    isValidModeBucket(candidate.lastModeBucket) &&
    (candidate.lastConversationId === null || typeof candidate.lastConversationId === "string") &&
    (candidate.lastConversationActiveAtMs === null || typeof candidate.lastConversationActiveAtMs === "number")
  );
}

export function getConversationRestoreTimeoutMs(): number {
  return DEFAULT_RESTORE_TIMEOUT_MS;
}

export function readProjectEntryState(projectId: string): ProjectEntryStateV1 | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(keyForProject(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidState(parsed)) {
      window.localStorage.removeItem(keyForProject(projectId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeProjectEntryState(projectId: string, patch: Partial<ProjectEntryStateV1>): void {
  if (!canUseStorage()) return;
  const prev = readProjectEntryState(projectId);
  const next: ProjectEntryStateV1 = {
    lastModeBucket: prev?.lastModeBucket ?? "conversation",
    lastConversationId: prev?.lastConversationId ?? null,
    lastConversationActiveAtMs: prev?.lastConversationActiveAtMs ?? null,
    ...patch,
    version: PROJECT_ENTRY_VERSION,
  };
  try {
    window.localStorage.setItem(keyForProject(projectId), JSON.stringify(next));
  } catch {
    // Ignore storage failures and fail soft.
  }
}

export function clearProjectEntryState(projectId: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(keyForProject(projectId));
  } catch {
    // Ignore storage failures and fail soft.
  }
}

export function setProjectModeBucket(projectId: string, bucket: ProjectModeBucket): void {
  writeProjectEntryState(projectId, { lastModeBucket: bucket });
}

export function markConversationActive(projectId: string, conversationId: string, atMs = Date.now()): void {
  writeProjectEntryState(projectId, {
    lastModeBucket: "conversation",
    lastConversationId: conversationId,
    lastConversationActiveAtMs: atMs,
  });
}

export function decideConversationRestore(
  state: ProjectEntryStateV1 | null,
  nowMs: number,
  knownConversationIds?: Set<string>,
): ConversationRestoreDecision {
  if (!state) return { shouldRestore: false, reason: "no_state" };
  if (state.lastModeBucket !== "conversation") {
    return { shouldRestore: false, reason: "workspace_bucket" };
  }
  if (!state.lastConversationId || state.lastConversationActiveAtMs == null) {
    return { shouldRestore: false, reason: "id_missing" };
  }
  if (nowMs - state.lastConversationActiveAtMs > getConversationRestoreTimeoutMs()) {
    return { shouldRestore: false, reason: "ttl_expired" };
  }
  if (knownConversationIds && !knownConversationIds.has(state.lastConversationId)) {
    return { shouldRestore: false, reason: "id_invalid" };
  }
  return {
    shouldRestore: true,
    reason: "restored",
    conversationId: state.lastConversationId,
  };
}
