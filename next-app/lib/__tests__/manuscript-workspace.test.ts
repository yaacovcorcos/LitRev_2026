import { describe, expect, it } from "vitest";
import { createManuscriptDocument } from "@/lib/manuscript/schema";
import {
  extractManuscriptOutline,
  insertManuscriptSection,
  moveTopLevelBlock,
  removeManuscriptSection,
  reorderManuscriptSection,
} from "@/lib/manuscript/workspace";

describe("manuscript workspace helpers", () => {
  it("extracts section headings from the manuscript outline", () => {
    const manuscript = createManuscriptDocument({
      sectionOrder: ["abstract", "results", "references"],
      customSections: {},
      contentBySection: {
        abstract: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2, blockId: "blk:intro" },
              content: [{ type: "text", text: "Context" }],
            },
          ],
        },
        results: { type: "doc", content: [{ type: "paragraph" }] },
        references: { type: "doc", content: [{ type: "paragraph" }] },
      },
    });

    const outline = extractManuscriptOutline(manuscript);

    expect(outline[0]).toMatchObject({
      sectionId: "abstract",
      headings: [{ id: "blk:intro", label: "Context", level: 2 }],
    });
    expect(outline[2]?.isGenerated).toBe(true);
  });

  it("inserts new sections before references and preserves references last", () => {
    const manuscript = createManuscriptDocument({
      sectionOrder: ["abstract", "references"],
      customSections: {},
      contentBySection: {
        abstract: { type: "doc", content: [{ type: "paragraph" }] },
        references: { type: "doc", content: [{ type: "paragraph" }] },
      },
    });

    const inserted = insertManuscriptSection({
      document: manuscript,
      section: {
        sectionId: "funding",
        sectionNodeId: "sec:funding",
        kind: "base",
        label: "Funding",
      },
      afterSectionId: "references",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    expect(inserted.sections.map((section) => section.sectionId)).toEqual(["abstract", "funding", "references"]);
  });

  it("rejects removing or reordering the references section", () => {
    const manuscript = createManuscriptDocument({
      sectionOrder: ["abstract", "methods", "references"],
      customSections: {},
      contentBySection: {
        abstract: { type: "doc", content: [{ type: "paragraph" }] },
        methods: { type: "doc", content: [{ type: "paragraph" }] },
        references: { type: "doc", content: [{ type: "paragraph" }] },
      },
    });

    expect(removeManuscriptSection(manuscript, "references")).toEqual(manuscript);
    expect(reorderManuscriptSection({
      document: manuscript,
      sectionId: "references",
      targetSectionId: "abstract",
      position: "before",
    })).toEqual(manuscript);
  });

  it("moves top-level blocks within a section while preserving block ids", () => {
    const manuscript = createManuscriptDocument({
      sectionOrder: ["abstract"],
      customSections: {},
      contentBySection: {
        abstract: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { blockId: "blk:first" },
              content: [{ type: "text", text: "First" }],
            },
            {
              type: "paragraph",
              attrs: { blockId: "blk:second" },
              content: [{ type: "text", text: "Second" }],
            },
          ],
        },
      },
    });

    const moved = moveTopLevelBlock(manuscript, {
      sectionId: "abstract",
      blockId: "blk:first",
      direction: "down",
    });

    expect(moved.doc.content?.[0]?.content?.map((node) => node.attrs?.blockId)).toEqual([
      "blk:second",
      "blk:first",
    ]);
  });
});
