import { describe, expect, it } from "vitest";
import {
  getCachePolicy,
  HOME_PROJECT_STALE_MS,
  PROJECT_DATA_POLICIES,
  type CachePolicyResource,
} from "@/lib/project-data-policy";

const EXPECTED_RESOURCES: CachePolicyResource[] = [
  "homeProjects",
  "projectOverviewStats",
  "protocolDocument",
  "ledgerStudies",
  "draftManuscript",
  "notesIndex",
  "noteDetail",
  "projectMemoryList",
  "memoryDiagnosticsTabs",
  "aiConversationList",
  "aiConversationTimeline",
  "projectConversationState",
  "popupTranscript",
];

describe("project-data-policy", () => {
  it("defines the complete approved resource set", () => {
    expect(Object.keys(PROJECT_DATA_POLICIES).sort()).toEqual([...EXPECTED_RESOURCES].sort());
  });

  it("locks the home stale window to the approved value", () => {
    expect(HOME_PROJECT_STALE_MS).toBe(15_000);
    expect(getCachePolicy("homeProjects").staleWindowMs).toBe(15_000);
  });

  it("keeps every resource declarative and structurally valid", () => {
    for (const resource of EXPECTED_RESOURCES) {
      const policy = getCachePolicy(resource);
      expect(policy.freshnessClass).toBeTypeOf("string");
      expect(policy.preloadMode).toBeTypeOf("string");
      expect(Array.isArray(policy.invalidationReasons)).toBe(true);
      expect(policy.invalidationReasons.length).toBeGreaterThan(0);
      expect(policy.staleWindowMs === null || policy.staleWindowMs >= 0).toBe(true);
    }
  });
});
