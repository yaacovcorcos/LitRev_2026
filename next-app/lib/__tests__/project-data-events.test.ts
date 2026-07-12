import { describe, expect, it } from "vitest";
import { getChangedDomainsForAcceptedArtifact } from "@/lib/project-data-events";

describe("project data event artifact mapping", () => {
  it("refreshes the ledger for accepted study deletions", () => {
    expect(getChangedDomainsForAcceptedArtifact("study_deletion", {
      studyId: "study-1",
      title: "Study One",
    })).toEqual(["ledger"]);
  });
});
