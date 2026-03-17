/**
 * Custom hook encapsulating all export-related state and callbacks
 * for the Draft Studio page. Extracted from page.tsx (D-3).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { listProjectFilesAction, createFileAssetAction, deleteFileAssetAction } from "@/app/actions/files";
import type { FileAsset } from "@/types/files";
import type { DraftState } from "@/lib/draftStorage";
import { docHasContent, jsonToText, type SectionMeta } from "./draft-helpers";
import type { Study } from "@/types/ledger";
import { compileDraftCitations, formatReferenceEntry, hasBlockingCitationIssues } from "@/lib/citation-compiler";

type UseDraftExportDeps = {
  projectId: string;
  projectName: string | undefined;
  draft: DraftState;
  getDraftSnapshot: () => DraftState;
  orderedSections: SectionMeta[];
  studies: Study[];
  flushContentCommit?: () => void;
  sectionMetaById?: unknown;
};

export function useDraftExport(deps: UseDraftExportDeps) {
  const {
    projectId,
    projectName,
    draft,
    getDraftSnapshot,
    orderedSections,
    studies,
    flushContentCommit = () => {},
  } = deps;

  const [isExportModalOpen, setExportModalOpen] = useState(false);
  const [exportHistory, setExportHistory] = useState<FileAsset[]>([]);
  const [latestExport, setLatestExport] = useState<FileAsset | null>(null);
  const [exportMode, setExportMode] = useState<"warn" | "strict">("warn");

  const compiledCitations = useMemo(
    () =>
      compileDraftCitations({
        contentBySection: draft.contentBySection,
        sectionOrder: orderedSections.map((section) => section.id),
        studies,
        includeNumberInNodes: true,
      }),
    [draft.contentBySection, orderedSections, studies]
  );
  const citationIssues = compiledCitations.issues;
  const blockingCitationIssuesCount = useMemo(
    () =>
      citationIssues.filter((issue) => issue.type === "missing_study_id" || issue.type === "missing_study").length,
    [citationIssues]
  );

  const hasDraftContent = useMemo(() => {
    return orderedSections.some((section) => docHasContent(draft.contentBySection[section.id]));
  }, [draft.contentBySection, orderedSections]);

  // Load export history on mount
  useEffect(() => {
    if (!projectId) return;
    const loadExports = async () => {
      try {
        const result = await listProjectFilesAction(projectId);
        if (!result.success) { console.error("Failed to load exports:", result.error); return; }
        const exports = result.data
          .filter((f) => f.kind === "export" && f.format === "docx")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setExportHistory(exports);
        setLatestExport(exports[0] || null);
      } catch (err) {
        console.error("Failed to load exports", err);
      }
    };
    loadExports();
  }, [projectId]);

  const handleExportDocx = useCallback(async (): Promise<FileAsset> => {
    if (!projectName || !projectId) throw new Error("Project not found");

    const exportDraft = getDraftSnapshot();
    flushContentCommit();
    const compiledForExport = compileDraftCitations({
      contentBySection: exportDraft.contentBySection,
      sectionOrder: orderedSections.map((section) => section.id),
      studies,
      includeNumberInNodes: true,
    });
    const exportCitationIssues = compiledForExport.issues;

    if (exportMode === "strict" && hasBlockingCitationIssues(exportCitationIssues)) {
      throw new Error("Export blocked in strict mode: fix missing citation targets before exporting.");
    }

    const lines: string[] = [];
    lines.push(`# ${projectName}`);
    lines.push("");
    lines.push(`*Draft exported on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`);
    lines.push("");
    if (exportCitationIssues.length > 0 && exportMode === "warn") {
      lines.push(`> Export warnings: ${exportCitationIssues.length} citation issue${exportCitationIssues.length === 1 ? "" : "s"} detected.`);
      lines.push("");
    }

    for (const section of orderedSections) {
      if (section.id === "references") continue;
      const content = exportDraft.contentBySection[section.id];
      if (!docHasContent(content)) continue;
      lines.push(`## ${section.label}`);
      lines.push("");
      const normalized = compiledForExport.normalizedContentBySection[section.id] ?? content;
      lines.push(jsonToText(normalized));
      lines.push("");
    }

    if (compiledForExport.orderedStudyIds.length > 0) {
      lines.push(`## References`);
      lines.push("");
      const byId = new Map(studies.map((study) => [study.id, study]));
      compiledForExport.orderedStudyIds.forEach((studyId, index) => {
        const study = byId.get(studyId);
        lines.push(study ? formatReferenceEntry(study, index + 1) : `${index + 1}. Missing study metadata for ${studyId}.`);
      });
      lines.push("");
    }

    const markdownContent = lines.join("\n");
    const nextVersion = (latestExport?.version ?? 0) + 1;
    const filename = `${projectName.replace(/[^a-zA-Z0-9]/g, "-")}-v${nextVersion}.docx`;
    const storagePath = `/exports/${projectId}/${filename}`;

    await new Promise((r) => setTimeout(r, 1500));

    const createResult = await createFileAssetAction(projectId, {
      kind: "export",
      format: "docx",
      filename,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: markdownContent.length * 2,
      storagePath,
      publicUrl: storagePath,
      version: nextVersion,
      metadata: { sections: orderedSections.length, exportMode, citationIssues: exportCitationIssues.length },
    });
    if (!createResult.success) throw new Error(createResult.error);
    const newExport = createResult.data;

    setExportHistory((prev) => [newExport, ...prev]);
    setLatestExport(newExport);

    return newExport;
  }, [
    getDraftSnapshot,
    projectName,
    projectId,
    flushContentCommit,
    exportMode,
    orderedSections,
    latestExport,
    studies,
  ]);

  const handleDeleteExport = useCallback(async (fileId: string) => {
    if (!projectId) return;
    const delResult = await deleteFileAssetAction(projectId, fileId);
    if (!delResult.success) { console.error("Failed to delete export:", delResult.error); return; }
    setExportHistory((prev) => prev.filter((f) => f.id !== fileId));
    if (latestExport?.id === fileId) {
      const remaining = exportHistory.filter((f) => f.id !== fileId);
      setLatestExport(remaining[0] || null);
    }
  }, [projectId, latestExport, exportHistory]);

  const handleExportDraft = useCallback(() => {
    if (!projectName || !projectId) return;

    const exportDraft = getDraftSnapshot();
    flushContentCommit();
    const compiledForExport = compileDraftCitations({
      contentBySection: exportDraft.contentBySection,
      sectionOrder: orderedSections.map((section) => section.id),
      studies,
      includeNumberInNodes: true,
    });

    const lines: string[] = [];
    lines.push(`# ${projectName}`);
    lines.push("");
    lines.push(`*Draft exported on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`);
    lines.push("");
    lines.push("---");
    lines.push("");

    for (const section of orderedSections) {
      if (section.id === "references") continue;
      const content = exportDraft.contentBySection[section.id];
      if (!docHasContent(content)) continue;

      lines.push(`## ${section.label}`);
      lines.push("");
      const normalized = compiledForExport.normalizedContentBySection[section.id] ?? content;
      lines.push(jsonToText(normalized));
      lines.push("");
    }

    if (compiledForExport.orderedStudyIds.length > 0) {
      lines.push(`## References`);
      lines.push("");
      const byId = new Map(studies.map((study) => [study.id, study]));
      compiledForExport.orderedStudyIds.forEach((studyId, index) => {
        const study = byId.get(studyId);
        lines.push(study ? formatReferenceEntry(study, index + 1) : `${index + 1}. Missing study metadata for ${studyId}.`);
      });
      lines.push("");
    }

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `draft-${projectId}-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getDraftSnapshot, projectName, projectId, orderedSections, studies, flushContentCommit]);

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
    handleExportDraft,
  };
}
