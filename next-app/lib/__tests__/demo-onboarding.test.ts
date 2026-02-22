// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  isGuidedSetupCompletedLocally,
  mirrorGuidedSetupCompleted,
  shouldLaunchGuidedSetupFallback,
} from "@/lib/demo/onboarding";

describe("demo onboarding localStorage mirror", () => {
  const projectId = "proj-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to launching guided setup when no completion flag exists", () => {
    expect(shouldLaunchGuidedSetupFallback(projectId)).toBe(true);
  });

  it("mirrors completion and prevents re-launch", () => {
    expect(isGuidedSetupCompletedLocally(projectId)).toBe(false);
    mirrorGuidedSetupCompleted(projectId);
    expect(isGuidedSetupCompletedLocally(projectId)).toBe(true);
    expect(shouldLaunchGuidedSetupFallback(projectId)).toBe(false);
  });

  it("tracks completion independently per project", () => {
    mirrorGuidedSetupCompleted("proj-a");
    expect(isGuidedSetupCompletedLocally("proj-a")).toBe(true);
    expect(isGuidedSetupCompletedLocally("proj-b")).toBe(false);
    expect(shouldLaunchGuidedSetupFallback("proj-b")).toBe(true);
  });
});
