const GUIDED_SETUP_DEFAULT_KEY = "litrev:guided-setup-default:v1";
const GUIDED_SETUP_OVERRIDE_PREFIX = "litrev:guided-setup-project:v1:";
const GUIDED_SETUP_DONE_PREFIX = "litrev:guided-setup-done:v1:";
const DEFAULT_GUIDED_SETUP = true;

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function projectOverrideKey(projectId: string): string {
  return `${GUIDED_SETUP_OVERRIDE_PREFIX}${projectId}`;
}

function projectDoneKey(projectId: string): string {
  return `${GUIDED_SETUP_DONE_PREFIX}${projectId}`;
}

function parseBoolean(value: string | null): boolean | null {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

export function loadGuidedSetupDefault(): boolean {
  if (!canUseStorage()) return DEFAULT_GUIDED_SETUP;
  const parsed = parseBoolean(window.localStorage.getItem(GUIDED_SETUP_DEFAULT_KEY));
  return parsed ?? DEFAULT_GUIDED_SETUP;
}

export function saveGuidedSetupDefault(enabled: boolean): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(GUIDED_SETUP_DEFAULT_KEY, enabled ? "1" : "0");
}

export function loadProjectGuidedSetupOverride(projectId: string): boolean | null {
  if (!canUseStorage()) return null;
  return parseBoolean(window.localStorage.getItem(projectOverrideKey(projectId)));
}

export function saveProjectGuidedSetupOverride(projectId: string, enabled: boolean): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(projectOverrideKey(projectId), enabled ? "1" : "0");
}

export function clearProjectGuidedSetupOverride(projectId: string): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(projectOverrideKey(projectId));
}

export function shouldLaunchGuidedSetup(projectId: string): boolean {
  const projectOverride = loadProjectGuidedSetupOverride(projectId);
  if (projectOverride !== null) return projectOverride;
  return loadGuidedSetupDefault();
}

export function markGuidedSetupCompleted(projectId: string): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(projectDoneKey(projectId), "1");
}

export function isGuidedSetupCompleted(projectId: string): boolean {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(projectDoneKey(projectId)) === "1";
}
