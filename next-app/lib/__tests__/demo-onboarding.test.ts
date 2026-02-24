// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  isGuidedSetupCompletedLocally,
  mirrorGuidedSetupCompleted,
} from "@/lib/demo/onboarding";

describe("demo onboarding localStorage mirror", () => {
  const projectId = "proj-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("mirrors completion for a project", () => {
    expect(isGuidedSetupCompletedLocally(projectId)).toBe(false);
    mirrorGuidedSetupCompleted(projectId);
    expect(isGuidedSetupCompletedLocally(projectId)).toBe(true);
  });

  it("tracks completion independently per project", () => {
    mirrorGuidedSetupCompleted("proj-a");
    expect(isGuidedSetupCompletedLocally("proj-a")).toBe(true);
    expect(isGuidedSetupCompletedLocally("proj-b")).toBe(false);
  });
});
