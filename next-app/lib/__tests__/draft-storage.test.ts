// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultDraftState, loadDraftState, normalizeDraftState } from "@/lib/draft-storage";
import { DEFAULT_SECTION_ORDER, UNSECTIONED_DRAFT_ID } from "@/types/draft";

describe("createDefaultDraftState", () => {
  it("starts with the seeded section-first scaffold", () => {
    const state = createDefaultDraftState();

    expect(state.version).toBe(2);
    expect(state.mode).toBe("section");
    expect(state.activeSection).toBe("abstract");
    expect(state.sectionOrder).toEqual(DEFAULT_SECTION_ORDER);
    expect(state.manuscript.sections.map((section) => section.sectionId)).toEqual(DEFAULT_SECTION_ORDER);
    expect(state.contentBySection[UNSECTIONED_DRAFT_ID]).toBeTruthy();
    expect(state.auxiliaryBibliography).toEqual([]);
  });
});

describe("normalizeDraftState", () => {
  it("restores the seeded scaffold for empty no-section drafts", () => {
    const normalized = normalizeDraftState({
      ...createDefaultDraftState(),
      mode: "full",
      activeSection: null,
      sectionOrder: [],
    });

    expect(normalized.mode).toBe("section");
    expect(normalized.sectionOrder).toEqual(DEFAULT_SECTION_ORDER);
    expect(normalized.activeSection).toBe("abstract");
  });

  it("keeps zero-section drafts in full mode when whole-draft content exists", () => {
    const baseline = createDefaultDraftState();
    const normalized = normalizeDraftState({
      ...baseline,
      mode: "section",
      activeSection: "abstract",
      sectionOrder: [],
      contentBySection: {
        ...baseline.contentBySection,
        [UNSECTIONED_DRAFT_ID]: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Whole draft content" }] }],
        },
      },
    });

    expect(normalized.mode).toBe("full");
    expect(normalized.sectionOrder).toEqual([]);
    expect(normalized.activeSection).toBeNull();
  });
});

describe("loadDraftState citation migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("migrates legacy citation attrs to canonical studyId/uid shape", () => {
    const projectId = "proj-citation-migration";
    const state = createDefaultDraftState();
    state.sectionOrder = ["abstract"];
    state.activeSection = "abstract";
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
    expect(migrated.manuscript.schemaVersion).toBe(2);
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
