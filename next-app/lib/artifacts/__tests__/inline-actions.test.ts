import { describe, expect, it } from "vitest";
import { getArtifactInlineActionModel, supportsArtifactInlineUndo } from "@/lib/artifacts/inline-actions";

describe("artifact inline action policy", () => {
  it("marks destructive review-resolution actions as requiring confirmation", () => {
    const studyProposal = getArtifactInlineActionModel("study_proposal", "proposed");
    const excludeAction = studyProposal.actions.find((action) => action.key === "exclude");
    expect(excludeAction).toMatchObject({
      class: "review_resolution",
      requiresConfirmation: true,
    });

    const memoryProposal = getArtifactInlineActionModel("memory_proposal", "proposed");
    const dismissAction = memoryProposal.actions.find((action) => action.key === "dismiss");
    expect(dismissAction).toMatchObject({
      class: "review_resolution",
      requiresConfirmation: true,
    });

    const studyDeletion = getArtifactInlineActionModel("study_deletion", "proposed");
    expect(studyDeletion.actions.find((action) => action.key === "delete")).toMatchObject({
      class: "review_resolution",
      kind: "delete",
      requiresConfirmation: true,
    });
  });

  it("keeps positive review resolutions unconfirmed and secondary actions non-mutating", () => {
    const studyUpdate = getArtifactInlineActionModel("study_update", "proposed");
    expect(studyUpdate.actions.find((action) => action.key === "apply")).toMatchObject({
      class: "review_resolution",
      requiresConfirmation: false,
    });

    const protocol = getArtifactInlineActionModel("protocol_suggestion", "proposed");
    expect(protocol.actions.find((action) => action.key === "discuss")).toMatchObject({
      class: "secondary",
      requiresConfirmation: false,
    });
  });

  it("keeps the visible undo affordance narrower than server restore support", () => {
    expect(supportsArtifactInlineUndo("study_update", "accepted")).toBe(true);
    expect(supportsArtifactInlineUndo("study_update", "auto_applied")).toBe(true);
    expect(supportsArtifactInlineUndo("study_update", "proposed")).toBe(false);
    expect(supportsArtifactInlineUndo("study_deletion", "accepted")).toBe(true);
    expect(getArtifactInlineActionModel("study_deletion", "accepted").settled.undoAction).toMatchObject({
      key: "undo",
      requiresConfirmation: true,
    });

    for (const artifactType of [
      "criteria_card",
      "draft_diff",
      "evidence_table",
      "memory_forget_proposal",
      "memory_proposal",
      "plan",
      "protocol_suggestion",
      "screening_batch",
      "scoping_report",
      "study_proposal",
    ] as const) {
      expect(supportsArtifactInlineUndo(artifactType, "accepted")).toBe(false);
      expect(getArtifactInlineActionModel(artifactType, "accepted").settled.undoAction).toBeUndefined();
    }
  });
});
