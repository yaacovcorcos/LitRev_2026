import { useCallback, useEffect, useMemo, useState } from "react";
import { listProjectFilesAction, createFileAssetAction, deleteFileAssetAction } from "@/app/actions/files";
import type { FileAsset } from "@/types/files";
import type { DraftState } from "@/lib/draftStorage";
import { docHasContent, jsonToText, type SectionMeta } from "./draft-helpers";
import type { Study } from "@/types/ledger";
import { compileDraftCitations, formatReferenceEntry, hasBlockingCitationIssues } from "@/lib/citation-compiler";
import { UNSECTIONED_DRAFT_ID, type DraftSectionId } from "@/types/draft";

type UseDraftExportDeps = {
  projectId: string;
  projectName: string | undefined;
  draft: DraftState;
  getDraftSnapshot: () => DraftState;
  orderedSections: SectionMeta[];
  sectionMetaById: Map<DraftSectionId, SectionMeta>;
  studies: Study[];
};

function buildExportSectionOrder(draft: DraftState, orderedSections: SectionMeta[]) {
  const sections: SectionMeta[] = [];
  const shouldIncludeWholeDraft =
    docHasContent(draft.contentBySection[UNSECTIONED_DRAFT_ID]) || orderedSections.length === 0;
  if (shouldIncludeWholeDraft) {
    sections.push({
      id: UNSECTIONED_DRAFT_ID,
      label: "Whole draft",
      placeholder: "Start writing...",
      isWholeDraft: true,
    });
  }
  sections.push(...orderedSections);
  return sections;
}

export function useDraftExport(deps: UseDraftExportDeps) {
  const { projectId, projectName, draft, getDraftSnapshot, orderedSections, studies } = deps;

  const [isExportModalOpen, setExportModalOpen] = useState(false);
  const [exportHistory, setExportHistory] = useState<FileAsset[]>([]);
  const [latestExport, setLatestExport] = useState<FileAsset | null>(null);
  const [exportMode, setExportMode] = useState<"warn" | "strict">("warn");

  const exportSections = useMemo(() => buildExportSectionOrder(draft, orderedSections), [draft, orderedSections]);

  const compiledCitations = useMemo(
    () =>
      compileDraftCitations({
        contentBySection: draft.contentBySection,
        sectionOrder: draft.sectionOrder,
        studies,
        includeNumberInNodes: true,
      }),
    [draft.contentBySection, draft.sectionOrder, studies],
  );
  const citationIssues = compiledCitations.issues;
  const blockingCitationIssuesCount = useMemo(
    () => citationIssues.filter((issue) => issue.type === "missing_study_id" || issue.type === "missing_study").length,
    [citationIssues],
  );

  const hasDraftContent = useMemo(
    () => exportSections.some((section) => section.id === "references" || docHasContent(draft.contentBySection[section.id])),
    [draft.contentBySection, exportSections],
  );

  useEffect(() => {
    if (!projectId) return;
    const loadExports = async () => {
      try {
        const result = await listProjectFilesAction(projectId);
        if (!result.success) {
          console.error("Failed to load exports:", result.error);
          return;
        }
        const exports = result.data
          .filter((file) => file.kind === "export" && file.format === "docx")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setExportHistory(exports);
        setLatestExport(exports[0] || null);
      } catch (err) {
        console.error("Failed to load exports", err);
      }
    };
    loadExports();
  }, [projectId]);

  const buildExportLines = useCallback((exportDraft: DraftState) => {
    const compiledForExport = compileDraftCitations({
      contentBySection: exportDraft.contentBySection,
      sectionOrder: exportDraft.sectionOrder,
      studies,
      includeNumberInNodes: true,
    });

    const lines: string[] = [];
    lines.push(`# ${projectName}`);
    lines.push("");
    lines.push(`*Draft exported on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`);
    lines.push("");

    for (const section of buildExportSectionOrder(exportDraft, orderedSections)) {
      if (section.id === "references") continue;
      const content = exportDraft.contentBySection[section.id];
      if (!docHasContent(content)) continue;
      lines.push(`## ${section.label}`);
      lines.push("");
      const normalized = compiledForExport.normalizedContentBySection[section.id] ?? content;
      lines.push(jsonToText(normalized));
      lines.push("");
    }

    if (compiledForExport.orderedStudyIds.length > 0 || exportDraft.sectionOrder.includes("references")) {
      lines.push("## References");
      lines.push("");
      const byId = new Map(studies.map((study) => [study.id, study]));
      if (compiledForExport.orderedStudyIds.length === 0) {
        lines.push("No references yet.");
      } else {
        compiledForExport.orderedStudyIds.forEach((studyId, index) => {
          const study = byId.get(studyId);
          lines.push(study ? formatReferenceEntry(study, index + 1) : `${index + 1}. Missing study metadata for ${studyId}.`);
        });
      }
      lines.push("");
    }

    return {
      lines,
      exportCitationIssues: compiledForExport.issues,
    };
  }, [orderedSections, projectName, studies]);

  const handleExportDocx = useCallback(async (): Promise<FileAsset> => {
    if (!projectName || !projectId) throw new Error("Project not found");

    const exportDraft = getDraftSnapshot();
    const { lines, exportCitationIssues } = buildExportLines(exportDraft);
    if (exportMode === "strict" && hasBlockingCitationIssues(exportCitationIssues)) {
      throw new Error("Export blocked in strict mode: fix missing citation targets before exporting.");
    }

    if (exportCitationIssues.length > 0 && exportMode === "warn") {
      lines.splice(4, 0, `> Export warnings: ${exportCitationIssues.length} citation issue${exportCitationIssues.length === 1 ? "" : "s"} detected.`, "");
    }

    const markdownContent = lines.join("\n");
    const nextVersion = (latestExport?.version ?? 0) + 1;
    const filename = `${projectName.replace(/[^a-zA-Z0-9]/g, "-")}-v${nextVersion}.docx`;
    const storagePath = `/exports/${projectId}/${filename}`;

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const createResult = await createFileAssetAction(projectId, {
      kind: "export",
      format: "docx",
      filename,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: markdownContent.length * 2,
      storagePath,
      publicUrl: storagePath,
      version: nextVersion,
      metadata: { sections: exportSections.length, exportMode, citationIssues: exportCitationIssues.length },
    });
    if (!createResult.success) throw new Error(createResult.error);
    const newExport = createResult.data;

    setExportHistory((prev) => [newExport, ...prev]);
    setLatestExport(newExport);
    return newExport;
  }, [buildExportLines, exportMode, exportSections.length, getDraftSnapshot, latestExport, projectId, projectName]);

  const handleDeleteExport = useCallback(async (fileId: string) => {
    if (!projectId) return;
    const delResult = await deleteFileAssetAction(projectId, fileId);
    if (!delResult.success) {
      console.error("Failed to delete export:", delResult.error);
      return;
    }
    setExportHistory((prev) => prev.filter((file) => file.id !== fileId));
    setLatestExport((prev) => (prev?.id === fileId ? null : prev));
  }, [projectId]);

  return {
    isExportModalOpen,
    setExportModalOpen,
    exportHistory,
    latestExport,
    exportMode,
    setExportMode,
    citationIssues,
    blockingCitationIssuesCount,
    hasDraftContent,
    handleExportDocx,
    handleDeleteExport,
  };
}
