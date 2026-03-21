import { describe, expect, it } from "vitest";
import { compileDraftExportDocument } from "@/lib/draft-export/compile";
import type { Study } from "@/types/ledger";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

function textDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const studies: Study[] = [
  {
    id: "study-1",
    title: "Study One",
    authors: "Smith J",
    year: 2020,
    status: "active",
    quality: "High",
    details: {
      journal: "Journal A",
      doi: "10.1000/a",
    },
  },
];

describe("compileDraftExportDocument", () => {
  it("filters empty sections and generates references last from citations", () => {
    const document = compileDraftExportDocument({
      projectTitle: "Alpha Draft",
      draftSnapshot: {
        version: 2,
        mode: "section",
        activeSection: "abstract",
        sectionOrder: ["abstract", "introduction", "references"],
        customSections: {},
        formattingBySection: {
          [UNSECTIONED_DRAFT_ID]: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
          abstract: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
          introduction: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
          references: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
        },
        panels: {
          ledgerWidth: 320,
          copilotWidth: 360,
          ledgerCollapsed: false,
          copilotCollapsed: false,
        },
        contentBySection: {
          [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
          abstract: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Summary " },
                  { type: "citation", attrs: { studyId: "study-1", uid: "cit-1" } },
                ],
              },
            ],
          },
          introduction: { type: "doc", content: [{ type: "paragraph" }] },
          references: { type: "doc", content: [{ type: "paragraph" }] },
        },
        ledgerBySection: {
          [UNSECTIONED_DRAFT_ID]: [],
          abstract: [],
          introduction: [],
          references: [],
        },
        copilotBySection: {
          [UNSECTIONED_DRAFT_ID]: [],
          abstract: [],
          introduction: [],
          references: [],
        },
        manuscript: {
          schemaVersion: 2,
          doc: {
            type: "doc",
            content: [],
          },
          sections: [
            {
              sectionId: "abstract",
              sectionNodeId: "sec:abstract",
              kind: "base",
              label: "Abstract",
            },
            {
              sectionId: "introduction",
              sectionNodeId: "sec:introduction",
              kind: "base",
              label: "Introduction",
            },
            {
              sectionId: "references",
              sectionNodeId: "sec:references",
              kind: "base",
              label: "References",
            },
          ],
        },
      },
      studies,
    });

    expect(document.sections.map((section) => section.id)).toEqual(["abstract"]);
    expect(document.references).toHaveLength(1);
    expect(document.references[0]?.studyId).toBe("study-1");
    expect(document.references[0]?.text).toMatch(/^1\./);
  });

  it("exports whole-draft content when there are zero named sections", () => {
    const document = compileDraftExportDocument({
      projectTitle: "Alpha Draft",
      draftSnapshot: {
        version: 2,
        mode: "full",
        activeSection: null,
        sectionOrder: [],
        customSections: {},
        formattingBySection: {
          [UNSECTIONED_DRAFT_ID]: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
        },
        panels: {
          ledgerWidth: 320,
          copilotWidth: 360,
          ledgerCollapsed: false,
          copilotCollapsed: false,
        },
        contentBySection: {
          [UNSECTIONED_DRAFT_ID]: textDoc("Whole draft text"),
        },
        ledgerBySection: {
          [UNSECTIONED_DRAFT_ID]: [],
        },
        copilotBySection: {
          [UNSECTIONED_DRAFT_ID]: [],
        },
        manuscript: {
          schemaVersion: 2,
          doc: {
            type: "doc",
            content: [],
          },
          sections: [
            {
              sectionId: UNSECTIONED_DRAFT_ID,
              sectionNodeId: "sec:whole-draft",
              kind: "freeform",
              label: "Whole draft",
              placeholder: "Start writing...",
            },
          ],
        },
      },
      studies: [],
    });

    expect(document.sections).toHaveLength(1);
    expect(document.sections[0]?.id).toBe(UNSECTIONED_DRAFT_ID);
    expect(document.sections[0]?.isWholeDraft).toBe(true);
  });
});
