import { buildCompatContentBySection } from "@/lib/manuscript/schema";
import { normalizeDraftState } from "@/lib/draft-storage";
import { createImportSummary } from "@/lib/draft-import/report";
import type { DraftImportResult } from "@/lib/draft-import/types";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

export function parseLegacyDraftImport(sourceLabel: string, raw: unknown): DraftImportResult {
  const normalized = normalizeDraftState(raw);
  const compat = buildCompatContentBySection(normalized.manuscript);

  return {
    format: "legacy-draft",
    kind: "mixed",
    sourceLabel,
    sections: normalized.manuscript.sections.map((section) => ({
      label: section.label,
      sectionId: section.sectionId,
      isCustom: section.kind === "custom",
      placeholder: section.placeholder,
      blocks: compat[section.sectionId]?.content ?? [{ type: "paragraph" }],
    })),
    bibliography: normalized.auxiliaryBibliography ?? [],
    summary: createImportSummary({
      preserved: ["existing LitRev sections", "citations", "manuscript structure"],
    }),
    report: [],
    stats: {
      sectionCount: normalized.manuscript.sections.filter((section) => section.sectionId !== UNSECTIONED_DRAFT_ID).length,
      blockCount: Object.values(compat).reduce((count, doc) => count + (doc.content?.length ?? 0), 0),
      bibliographyCount: normalized.auxiliaryBibliography?.length ?? 0,
    },
  };
}
