// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProjectGuidedSetupOverride,
  isGuidedSetupCompleted,
  loadGuidedSetupDefault,
  loadProjectGuidedSetupOverride,
  markGuidedSetupCompleted,
  saveGuidedSetupDefault,
  saveProjectGuidedSetupOverride,
  shouldLaunchGuidedSetup,
} from "@/lib/demo/onboarding";

describe("demo onboarding local fallback storage", () => {
  const projectId = "proj-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults guided setup to enabled when no preference exists", () => {
    expect(loadGuidedSetupDefault()).toBe(true);
    expect(shouldLaunchGuidedSetup(projectId)).toBe(true);
  });

  it("persists guided setup default preference", () => {
    saveGuidedSetupDefault(false);
    expect(loadGuidedSetupDefault()).toBe(false);
    expect(shouldLaunchGuidedSetup(projectId)).toBe(false);
  });

  it("uses per-project override before global default", () => {
    saveGuidedSetupDefault(false);
    saveProjectGuidedSetupOverride(projectId, true);

    expect(loadProjectGuidedSetupOverride(projectId)).toBe(true);
    expect(shouldLaunchGuidedSetup(projectId)).toBe(true);
  });

  it("clears per-project override", () => {
    saveProjectGuidedSetupOverride(projectId, false);
    expect(loadProjectGuidedSetupOverride(projectId)).toBe(false);

    clearProjectGuidedSetupOverride(projectId);
    expect(loadProjectGuidedSetupOverride(projectId)).toBeNull();
  });

  it("tracks onboarding completion flag per project", () => {
    expect(isGuidedSetupCompleted(projectId)).toBe(false);
    markGuidedSetupCompleted(projectId);
    expect(isGuidedSetupCompleted(projectId)).toBe(true);
  });
});
