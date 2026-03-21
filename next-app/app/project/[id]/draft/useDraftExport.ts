/**
 * Custom hook encapsulating all export-related state and callbacks
 * for the Draft Studio page. Extracted from page.tsx (D-3).
 */
import { useCallback, useMemo, useState } from "react";
import { deleteFileAssetAction } from "@/app/actions/files";
import { generateDraftExportAction } from "@/app/actions/draft-exports";
import type { FileAsset } from "@/types/files";
import type { DraftState } from "@/lib/draftStorage";
import { docHasContent, type SectionMeta } from "./draft-helpers";
import type { Study } from "@/types/ledger";
import { compileDraftCitations } from "@/lib/citation-compiler";
import { useProjectExportHistory } from "./useProjectExportHistory";

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
  const [exportMode, setExportMode] = useState<"warn" | "strict">("warn");
  const {
    exportHistory,
    latestExport,
    prependExport,
    removeExport,
  } = useProjectExportHistory(projectId);

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

  const handleExportDocx = useCallback(async (): Promise<FileAsset> => {
    if (!projectName || !projectId) throw new Error("Project not found");

    flushContentCommit();
    const exportDraft = getDraftSnapshot();
    const exportResult = await generateDraftExportAction(projectId, exportDraft, {
      format: "docx",
      mode: exportMode,
    });
    if (!exportResult.success) throw new Error(exportResult.error);
    const newExport = exportResult.data;

    prependExport(newExport);

    return newExport;
  }, [
    getDraftSnapshot,
    projectName,
    projectId,
    flushContentCommit,
    exportMode,
    orderedSections,
    latestExport,
    prependExport,
    studies,
  ]);

  const handleDeleteExport = useCallback(async (fileId: string) => {
    if (!projectId) return;
    const delResult = await deleteFileAssetAction(projectId, fileId);
    if (!delResult.success) { console.error("Failed to delete export:", delResult.error); return; }
    removeExport(fileId);
  }, [projectId, removeExport]);

  const handleExportDraft = useCallback(async () => {
    if (!projectName || !projectId) return;

    flushContentCommit();
    const exportDraft = getDraftSnapshot();
    const result = await generateDraftExportAction(projectId, exportDraft, {
      format: "markdown",
      mode: exportMode,
    });
    if (!result.success) {
      throw new Error(result.error);
    }
    if (!result.data.publicUrl || typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = result.data.publicUrl;
    a.download = result.data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [exportMode, getDraftSnapshot, projectName, projectId, flushContentCommit]);

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
