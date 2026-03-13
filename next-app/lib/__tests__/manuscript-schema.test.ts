import { describe, expect, it } from "vitest";
import { DEFAULT_SECTION_ORDER } from "@/types/draft";
import type { JSONContent } from "@tiptap/core";
import {
  buildCompatContentBySection,
  createDefaultManuscriptDocument,
  createManuscriptDocument,
  ensureBlockIds,
  rewriteCitationStudyIdsInManuscript,
} from "@/lib/manuscript/schema";

describe("manuscript schema helpers", () => {
  it("creates default manuscript sections from the canonical order", () => {
    const manuscript = createDefaultManuscriptDocument();

    expect(manuscript.schemaVersion).toBe(1);
    expect(manuscript.sections.map((section) => section.sectionId)).toEqual(DEFAULT_SECTION_ORDER);
    expect(manuscript.doc.content?.every((node) => node.type === "manuscriptSection")).toBe(true);
  });

  it("round-trips custom sections and citation content through compat projection", () => {
    const manuscript = createManuscriptDocument({
      sectionOrder: ["abstract", "custom-1", "references"],
      customSections: {
        "custom-1": {
          label: "Synthesis Notes",
          placeholder: "Capture the synthesis here.",
        },
      },
      contentBySection: {
        abstract: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Abstract lead." }],
            },
          ],
        },
        "custom-1": {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "citation", attrs: { studyId: "study-1", uid: "cit-1" } }],
            },
          ],
        },
        references: {
          type: "doc",
          content: [{ type: "paragraph" }],
        },
      },
    });

    expect(manuscript.sections[1]).toMatchObject({
      sectionId: "custom-1",
      kind: "custom",
      label: "Synthesis Notes",
      placeholder: "Capture the synthesis here.",
    });

    const compat = buildCompatContentBySection(manuscript);
    expect(compat["custom-1"].content?.[0]?.content?.[0]).toMatchObject({
      type: "citation",
      attrs: { studyId: "study-1", uid: "cit-1" },
    });
    expect(compat["custom-1"].content?.[0]?.attrs).toMatchObject({
      blockId: expect.any(String),
    });
  });

  it("assigns stable block ids and rewrites manuscript citations", () => {
    const content: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Claim " },
            { type: "citation", attrs: { studyId: "study-old", uid: "cit-1" } },
          ],
        },
      ],
    };

    const first = ensureBlockIds(content, "abstract");
    const second = ensureBlockIds(content, "abstract");
    expect(first).toEqual(second);
    expect(first.content?.[0]?.attrs).toEqual({ blockId: "blk:abstract:0" });

    const manuscript = createManuscriptDocument({
      sectionOrder: ["abstract"],
      customSections: {},
      contentBySection: { abstract: first },
    });

    const rewritten = rewriteCitationStudyIdsInManuscript(manuscript, {
      "study-old": "study-new",
    });

    expect(rewritten.changedCount).toBe(1);
    expect(rewritten.document.doc.content?.[0]?.content?.[0]?.content?.[1]).toMatchObject({
      type: "citation",
      attrs: { studyId: "study-new", uid: "cit-1" },
    });
  });
});
