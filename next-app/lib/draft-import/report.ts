import type {
  DraftImportPreservationClass,
  DraftImportReportEntry,
  DraftImportSourceFormat,
  DraftImportSummary,
  DraftImportWarningSeverity,
} from "@/lib/draft-import/types";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort();
}

export function createImportSummary(input?: Partial<DraftImportSummary>): DraftImportSummary {
  return {
    preserved: uniqueSorted(input?.preserved ?? []),
    downgraded: uniqueSorted(input?.downgraded ?? []),
    unresolved: uniqueSorted(input?.unresolved ?? []),
  };
}

export function appendImportSummary(
  current: DraftImportSummary,
  next: Partial<DraftImportSummary>,
): DraftImportSummary {
  return createImportSummary({
    preserved: [...current.preserved, ...(next.preserved ?? [])],
    downgraded: [...current.downgraded, ...(next.downgraded ?? [])],
    unresolved: [...current.unresolved, ...(next.unresolved ?? [])],
  });
}

export function createImportReportEntry(params: {
  code: string;
  severity?: DraftImportWarningSeverity;
  preservation: DraftImportPreservationClass;
  message: string;
  sourceFormat: DraftImportSourceFormat;
  sourceLabel?: string;
  detail?: string;
  sectionLabel?: string;
  citationKey?: string;
  objectType?: string;
}): DraftImportReportEntry {
  return {
    severity: params.severity ?? (params.preservation === "preserved" ? "info" : params.preservation === "dropped" ? "error" : "warning"),
    ...params,
  };
}

export function entriesFromSummary(
  summary: DraftImportSummary,
  sourceFormat: DraftImportSourceFormat,
  sourceLabel: string,
): DraftImportReportEntry[] {
  const entries: DraftImportReportEntry[] = [];
  if (summary.preserved.length > 0) {
    entries.push(
      createImportReportEntry({
        code: "import.summary.preserved",
        preservation: "preserved",
        message: `Preserved ${summary.preserved.join(", ")}.`,
        sourceFormat,
        sourceLabel,
      }),
    );
  }
  if (summary.downgraded.length > 0) {
    entries.push(
      createImportReportEntry({
        code: "import.summary.downgraded",
        preservation: "downgraded",
        message: `Downgraded ${summary.downgraded.join(", ")}.`,
        sourceFormat,
        sourceLabel,
      }),
    );
  }
  if (summary.unresolved.length > 0) {
    entries.push(
      createImportReportEntry({
        code: "import.summary.unresolved",
        preservation: "unresolved",
        message: `Unresolved ${summary.unresolved.join(", ")}.`,
        sourceFormat,
        sourceLabel,
      }),
    );
  }
  return entries;
}
