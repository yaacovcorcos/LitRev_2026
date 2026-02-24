/**
 * Client-side localStorage mirror for onboarding state.
 *
 * The server (UserMemory + Project.progress) is the source of truth.
 * These functions exist only for:
 *  1. Mirroring completion after a successful server write (instant local reads).
 *  2. Synchronous fallback when the server is unreachable.
 */

const GUIDED_SETUP_DONE_PREFIX = "litrev:guided-setup-done:v1:";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function projectDoneKey(projectId: string): string {
  return `${GUIDED_SETUP_DONE_PREFIX}${projectId}`;
}

/** Write completion flag to localStorage after server confirms completion. */
export function mirrorGuidedSetupCompleted(projectId: string): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(projectDoneKey(projectId), "1");
}

/** Synchronous read: has this project's onboarding been completed locally? */
export function isGuidedSetupCompletedLocally(projectId: string): boolean {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(projectDoneKey(projectId)) === "1";
}
