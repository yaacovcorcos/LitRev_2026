import { describe, expect, it } from "vitest";
import { compileDraftDiagnostics } from "@/lib/draft-diagnostics/compile";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";
import type { Study } from "@/types/ledger";

function textDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function citationDoc(attrs: Record<string, unknown>) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "citation", attrs }] }],
  };
}

function createDraftSnapshot(overrides?: Partial<Parameters<typeof compileDraftDiagnostics>[0]["draftSnapshot"]>) {
  return {
    version: 2 as const,
    mode: "section" as const,
    activeSection: "abstract",
    sectionOrder: ["abstract", "discussion", "references"],
    customSections: {},
    formattingBySection: {
      [UNSECTIONED_DRAFT_ID]: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      abstract: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      discussion: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
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
      abstract: { type: "doc", content: [{ type: "paragraph" }] },
      discussion: { type: "doc", content: [{ type: "paragraph" }] },
      references: { type: "doc", content: [{ type: "paragraph" }] },
    },
    ledgerBySection: {
      [UNSECTIONED_DRAFT_ID]: [],
      abstract: [],
      discussion: [],
      references: [],
    },
    copilotBySection: {
      [UNSECTIONED_DRAFT_ID]: [],
      abstract: [],
      discussion: [],
      references: [],
    },
    manuscript: {
      schemaVersion: 2 as const,
      doc: { type: "doc", content: [] },
      sections: [
        { sectionId: "abstract", sectionNodeId: "sec:abstract", kind: "base" as const, label: "Abstract" },
        { sectionId: "discussion", sectionNodeId: "sec:discussion", kind: "base" as const, label: "Discussion" },
        { sectionId: "references", sectionNodeId: "sec:references", kind: "base" as const, label: "References" },
      ],
    },
    ...overrides,
  };
}

describe("compileDraftDiagnostics", () => {
  it("reuses the canonical citation issue taxonomy and blocking classification", () => {
    const studies: Study[] = [
      {
        id: "excluded-study",
        title: "Excluded Study",
        authors: "Smith J",
        year: 2020,
        status: "excluded",
        quality: "High",
        details: { journal: "Journal A", doi: "10.1000/a" },
      },
      {
        id: "active-no-metadata",
        title: "Metadata Gap",
        authors: "Jones A",
        year: 2021,
        status: "active",
        quality: "High",
        details: { journal: "Journal B" },
      },
    ];

    const report = compileDraftDiagnostics({
      draftSnapshot: createDraftSnapshot({
        contentBySection: {
          [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
          abstract: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "citation", attrs: { uid: "cit-missing-id" } },
                  { type: "citation", attrs: { studyId: "missing-study", uid: "cit-missing-study" } },
                ],
              },
            ],
          },
          discussion: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "citation", attrs: { studyId: "excluded-study", uid: "cit-excluded" } },
                  { type: "citation", attrs: { studyId: "active-no-metadata", uid: "cit-metadata" } },
                ],
              },
            ],
          },
          references: { type: "doc", content: [{ type: "paragraph" }] },
        },
      }),
      studies,
    });

    const citationCodes = report.diagnostics
      .filter((diagnostic) => diagnostic.kind === "citation")
      .map((diagnostic) => diagnostic.code);

    expect(citationCodes).toEqual(
      expect.arrayContaining(["missing_study_id", "missing_study", "excluded_study", "missing_metadata"]),
    );
    expect(report.summary.byCitationIssueType.missing_study_id).toBe(1);
    expect(report.summary.byCitationIssueType.missing_study).toBe(1);
    expect(report.summary.byCitationIssueType.excluded_study).toBe(1);
    expect(report.summary.byCitationIssueType.missing_metadata).toBe(1);
    expect(report.summary.blockingCitationIssueCount).toBe(2);
  });

  it("emits advisory readiness warnings only for meaningful sections", () => {
    const report = compileDraftDiagnostics({
      draftSnapshot: createDraftSnapshot({
        contentBySection: {
          [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
          abstract: textDoc("This section has prose but no citations."),
          discussion: { type: "doc", content: [{ type: "paragraph" }] },
          references: { type: "doc", content: [{ type: "paragraph" }] },
        },
        ledgerBySection: {
          [UNSECTIONED_DRAFT_ID]: [],
          abstract: ["study-1"],
          discussion: [],
          references: [],
        },
      }),
      studies: [
        {
          id: "study-1",
          title: "Study One",
          authors: "Smith J",
          year: 2020,
          status: "active",
          quality: "High",
          details: { journal: "Journal A", doi: "10.1000/a" },
        },
      ],
    });

    const readinessDiagnostics = report.diagnostics.filter((diagnostic) => diagnostic.kind === "readiness");
    expect(readinessDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "section_missing_citation_readiness",
          sectionId: "abstract",
          severity: "warning",
        }),
        expect.objectContaining({
          code: "section_ledger_unused_readiness",
          sectionId: "abstract",
          severity: "warning",
        }),
      ]),
    );
    expect(readinessDiagnostics.every((diagnostic) => diagnostic.severity === "warning")).toBe(true);
    expect(readinessDiagnostics.some((diagnostic) => diagnostic.sectionId === "discussion")).toBe(false);
  });

  it("stays deterministic across section reorder", () => {
    const studies: Study[] = [
      {
        id: "study-1",
        title: "Study One",
        authors: "Smith J",
        year: 2020,
        status: "active",
        quality: "High",
        details: { journal: "Journal A", doi: "10.1000/a" },
      },
    ];

    const baseSnapshot = createDraftSnapshot({
      contentBySection: {
        [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
        abstract: textDoc("Abstract prose without inline support."),
        discussion: citationDoc({ studyId: "study-1", uid: "cit-1" }),
        references: { type: "doc", content: [{ type: "paragraph" }] },
      },
      ledgerBySection: {
        [UNSECTIONED_DRAFT_ID]: [],
        abstract: ["study-1"],
        discussion: [],
        references: [],
      },
    });

    const reorderedSnapshot = {
      ...baseSnapshot,
      sectionOrder: ["discussion", "abstract", "references"],
    };

    const baseReport = compileDraftDiagnostics({ draftSnapshot: baseSnapshot, studies });
    const reorderedReport = compileDraftDiagnostics({ draftSnapshot: reorderedSnapshot, studies });

    const serializeDiagnostics = (codes: typeof baseReport.diagnostics) =>
      codes
        .map((diagnostic) => `${diagnostic.kind}:${diagnostic.code}:${diagnostic.sectionId ?? "draft"}`)
        .sort();

    expect(serializeDiagnostics(baseReport.diagnostics)).toEqual(serializeDiagnostics(reorderedReport.diagnostics));
    expect(baseReport.summary).toEqual(reorderedReport.summary);
  });
});
