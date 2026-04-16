import { describe, expect, it } from "vitest";
import { createDefaultDraftState } from "@/lib/draft-storage";
import { buildDraftImportApplyPlan } from "@/lib/draft-import/reconcile";
import type { DraftImportResult } from "@/lib/draft-import/types";

describe("buildDraftImportApplyPlan", () => {
  it("merges bibliography-only imports without replacing manuscript content", () => {
    const currentDraft = createDefaultDraftState();
    const result: DraftImportResult = {
      format: "bibtex",
      kind: "bibliography",
      sourceLabel: "sample-references.bib",
      sections: [],
      bibliography: [
        {
          id: "aux-smith",
          sourceFormat: "bibtex",
          sourceItemId: "smith2020",
          citationKey: "smith2020",
          title: "Synthetic Outcomes After Timed Intensification",
          doi: "10.1000/litrev-benchmark-1",
          linkedStudyId: "study-1",
        },
      ],
      summary: { preserved: ["title"], downgraded: [], unresolved: [] },
      report: [],
      stats: { sectionCount: 0, blockCount: 0, bibliographyCount: 1 },
    };

    const plan = buildDraftImportApplyPlan(currentDraft, result);

    expect(plan.kind).toBe("merge_bibliography");
    expect(plan.nextDraft.sectionOrder).toEqual(currentDraft.sectionOrder);
    expect(plan.nextDraft.auxiliaryBibliography).toHaveLength(1);
  });

  it("replaces manuscript content for manuscript imports while preserving bibliography", () => {
    const currentDraft = createDefaultDraftState();
    const result: DraftImportResult = {
      format: "markdown",
      kind: "manuscript",
      sourceLabel: "sample-manuscript.md",
      title: "Imported Manuscript",
      sections: [
        {
          label: "Methods",
          sectionId: "methods",
          isCustom: false,
          blocks: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Imported methods paragraph." }],
            },
          ],
        },
      ],
      bibliography: [
        {
          id: "aux-smith",
          sourceFormat: "bibtex",
          sourceItemId: "smith2020",
          citationKey: "smith2020",
          title: "Synthetic Outcomes After Timed Intensification",
        },
      ],
      summary: { preserved: ["headings"], downgraded: [], unresolved: [] },
      report: [],
      stats: { sectionCount: 1, blockCount: 1, bibliographyCount: 1 },
    };

    const plan = buildDraftImportApplyPlan(currentDraft, result);

    expect(plan.kind).toBe("replace_manuscript");
    expect(plan.nextDraft.sectionOrder).toEqual(["methods"]);
    expect(plan.nextDraft.contentBySection.methods.content?.[0]?.type).toBe("paragraph");
    expect(plan.nextDraft.auxiliaryBibliography).toHaveLength(1);
  });
});
