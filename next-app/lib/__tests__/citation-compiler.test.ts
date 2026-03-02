import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import type { Study } from "@/types/ledger";
import {
  buildReferencesDoc,
  compileDraftCitations,
  getCitedSectionIdsByStudyId,
  hasBlockingCitationIssues,
  rewriteCitationStudyIdsInContentBySection,
  rewriteCitationStudyIdsInDoc,
} from "@/lib/citation-compiler";

function makeDoc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

const baseStudies: Study[] = [
  {
    id: "s1",
    title: "Study 1",
    authors: "Smith et al.",
    year: 2020,
    status: "active",
    quality: "High",
    details: { doi: "10.1000/s1" },
  },
  {
    id: "s2",
    title: "Study 2",
    authors: "Jones et al.",
    year: 2021,
    status: "active",
    quality: "Medium",
    details: { pmid: "12345" },
  },
  {
    id: "s3",
    title: "Study 3",
    authors: "Taylor et al.",
    year: 2022,
    status: "excluded",
    quality: "Low",
    details: {},
  },
];

describe("compileDraftCitations", () => {
  it("assigns deterministic numbers by first unique appearance and reuses them", () => {
    const contentBySection = {
      abstract: makeDoc([
        {
          type: "paragraph",
          content: [
            { type: "citation", attrs: { studyId: "s2", uid: "u1" } },
            { type: "citation", attrs: { studyId: "s1", uid: "u2" } },
          ],
        },
      ]),
      introduction: makeDoc([
        {
          type: "paragraph",
          content: [
            { type: "citation", attrs: { studyId: "s2", uid: "u3" } },
            { type: "citation", attrs: { studyId: "s1", uid: "u4" } },
          ],
        },
      ]),
      references: makeDoc([{ type: "paragraph" }]),
    } as Record<string, JSONContent>;

    const compiled = compileDraftCitations({
      contentBySection,
      sectionOrder: ["abstract", "introduction", "references"],
      studies: baseStudies,
      includeNumberInNodes: true,
    });

    expect(compiled.orderedStudyIds).toEqual(["s2", "s1"]);
    expect(compiled.numberByStudyId).toEqual({ s2: 1, s1: 2 });
    expect(compiled.citations.map((citation) => citation.number)).toEqual([1, 2, 1, 2]);
    expect(compiled.issues).toEqual([]);
  });

  it("normalizes legacy citation attrs and omits presentation attrs by default", () => {
    const contentBySection = {
      abstract: makeDoc([
        {
          type: "paragraph",
          content: [{ type: "citation", attrs: { id: "s1", label: "Legacy Label", number: 999 } }],
        },
      ]),
    } as Record<string, JSONContent>;

    const compiled = compileDraftCitations({
      contentBySection,
      sectionOrder: ["abstract"],
      studies: baseStudies,
    });

    const citationNode = compiled.normalizedContentBySection.abstract.content?.[0]?.content?.[0];
    expect(citationNode?.type).toBe("citation");
    expect(citationNode?.attrs).toMatchObject({ studyId: "s1" });
    expect(typeof citationNode?.attrs?.uid).toBe("string");
    expect(citationNode?.attrs).not.toHaveProperty("id");
    expect(citationNode?.attrs).not.toHaveProperty("label");
    expect(citationNode?.attrs).not.toHaveProperty("number");
  });

  it("can include resolved number attrs for render-time display when requested", () => {
    const contentBySection = {
      abstract: makeDoc([
        {
          type: "paragraph",
          content: [{ type: "citation", attrs: { studyId: "s1", uid: "u1" } }],
        },
      ]),
    } as Record<string, JSONContent>;

    const compiled = compileDraftCitations({
      contentBySection,
      sectionOrder: ["abstract"],
      includeNumberInNodes: true,
    });

    const citationNode = compiled.normalizedContentBySection.abstract.content?.[0]?.content?.[0];
    expect(citationNode?.attrs?.number).toBe(1);
  });

  it("reports integrity issues for missing ids, missing studies, excluded studies, and missing metadata", () => {
    const contentBySection = {
      abstract: makeDoc([
        {
          type: "paragraph",
          content: [
            { type: "citation", attrs: { uid: "missing-id" } },
            { type: "citation", attrs: { studyId: "missing-study", uid: "missing-study-uid" } },
            { type: "citation", attrs: { studyId: "s3", uid: "excluded-uid" } },
          ],
        },
      ]),
    } as Record<string, JSONContent>;

    const compiled = compileDraftCitations({
      contentBySection,
      sectionOrder: ["abstract"],
      studies: baseStudies,
    });

    const issueTypes = compiled.issues.map((issue) => issue.type);
    expect(issueTypes).toContain("missing_study_id");
    expect(issueTypes).toContain("missing_study");
    expect(issueTypes).toContain("excluded_study");
    expect(issueTypes).toContain("missing_metadata");
    expect(hasBlockingCitationIssues(compiled.issues)).toBe(true);
  });
});

describe("reference and backlink helpers", () => {
  it("builds references in citation order", () => {
    const doc = buildReferencesDoc(["s2", "s1"], baseStudies);
    const first = doc.content?.[0]?.content?.[0];
    const second = doc.content?.[1]?.content?.[0];
    expect(first?.type).toBe("text");
    expect(second?.type).toBe("text");
    expect(String(first?.text)).toMatch(/^1\./);
    expect(String(second?.text)).toMatch(/^2\./);
  });

  it("returns unique section ids for cited study", () => {
    const sections = getCitedSectionIdsByStudyId({
      studyId: "s1",
      citations: [
        { sectionId: "abstract", uid: "u1", studyId: "s1", number: 1 },
        { sectionId: "abstract", uid: "u2", studyId: "s1", number: 1 },
        { sectionId: "methods", uid: "u3", studyId: "s1", number: 1 },
      ],
    });
    expect(sections).toEqual(["abstract", "methods"]);
  });
});

describe("citation id rewrite helpers", () => {
  it("rewrites study ids in a single doc", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        content: [
          { type: "citation", attrs: { studyId: "old-1", uid: "u1" } },
          { type: "citation", attrs: { studyId: "keep-1", uid: "u2" } },
        ],
      },
    ]);

    const rewritten = rewriteCitationStudyIdsInDoc(doc, { "old-1": "new-1" });
    const firstCitation = rewritten.content.content?.[0]?.content?.[0];
    const secondCitation = rewritten.content.content?.[0]?.content?.[1];

    expect(rewritten.changedCount).toBe(1);
    expect(firstCitation?.attrs?.studyId).toBe("new-1");
    expect(secondCitation?.attrs?.studyId).toBe("keep-1");
  });

  it("rewrites citations across sections and reports changed sections", () => {
    const contentBySection = {
      abstract: makeDoc([
        {
          type: "paragraph",
          content: [{ type: "citation", attrs: { studyId: "old-1", uid: "u1" } }],
        },
      ]),
      methods: makeDoc([
        {
          type: "paragraph",
          content: [{ type: "citation", attrs: { studyId: "old-2", uid: "u2" } }],
        },
      ]),
    } as Record<string, JSONContent>;

    const rewritten = rewriteCitationStudyIdsInContentBySection(contentBySection, {
      "old-1": "new-1",
      "old-2": "new-2",
    });

    expect(rewritten.changedCount).toBe(2);
    expect(rewritten.changedSections.sort()).toEqual(["abstract", "methods"]);
    expect(
      rewritten.contentBySection.abstract.content?.[0]?.content?.[0]?.attrs?.studyId
    ).toBe("new-1");
    expect(
      rewritten.contentBySection.methods.content?.[0]?.content?.[0]?.attrs?.studyId
    ).toBe("new-2");
  });
});
