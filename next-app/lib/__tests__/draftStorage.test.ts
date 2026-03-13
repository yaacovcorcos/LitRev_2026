// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultDraftState, loadDraftState } from "@/lib/draftStorage";

describe("loadDraftState citation migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("migrates legacy citation attrs to canonical studyId/uid shape", () => {
    const projectId = "proj-citation-migration";
    const state = createDefaultDraftState();
    expect(state.version).toBe(2);
    state.contentBySection.abstract = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "citation", attrs: { id: "study-1", label: "Legacy label", number: 9 } }],
        },
      ],
    };

    window.localStorage.setItem(`litrev_draft_v1:${projectId}`, JSON.stringify(state));

    const migrated = loadDraftState(projectId);
    expect(migrated.version).toBe(2);
    expect(migrated.manuscript.schemaVersion).toBe(1);
    const node = migrated.contentBySection.abstract.content?.[0]?.content?.[0];
    expect(node?.type).toBe("citation");
    expect(node?.attrs?.studyId).toBe("study-1");
    expect(typeof node?.attrs?.uid).toBe("string");
    expect(node?.attrs).not.toHaveProperty("id");
    expect(node?.attrs).not.toHaveProperty("label");
    expect(node?.attrs).not.toHaveProperty("number");
    const paragraph = migrated.contentBySection.abstract.content?.[0];
    expect(paragraph?.attrs).toMatchObject({
      blockId: expect.any(String),
    });
    expect(migrated.manuscript.sections.map((section) => section.sectionId)).toContain("abstract");
  });
});
