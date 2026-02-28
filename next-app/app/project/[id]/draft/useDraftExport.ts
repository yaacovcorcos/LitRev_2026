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

type UseDraftExportDeps = {
  projectId: string;
  projectName: string | undefined;
  draft: DraftState;
  orderedSections: SectionMeta[];
  studies: Study[];
  flushContentCommit: () => void;
};

export function useDraftExport(deps: UseDraftExportDeps) {
  const { projectId, projectName, draft, orderedSections, studies, flushContentCommit } = deps;

  const [isExportModalOpen, setExportModalOpen] = useState(false);
  const [exportHistory, setExportHistory] = useState<FileAsset[]>([]);
  const [latestExport, setLatestExport] = useState<FileAsset | null>(null);

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

    flushContentCommit();

    const lines: string[] = [];
    lines.push(`# ${projectName}`);
    lines.push("");
    lines.push(`*Draft exported on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`);
    lines.push("");

    for (const section of orderedSections) {
      const content = draft.contentBySection[section.id];
      if (!docHasContent(content)) continue;
      lines.push(`## ${section.label}`);
      lines.push("");
      lines.push(jsonToText(content));
      lines.push("");
    }

    const allCitedIds = new Set<string>();
    for (const sectionIds of Object.values(draft.ledgerBySection)) {
      for (const studyId of sectionIds) {
        allCitedIds.add(studyId);
      }
    }

    const citedStudies = studies.filter((s) => allCitedIds.has(s.id));
    if (citedStudies.length > 0) {
      lines.push(`## References`);
      lines.push("");
      citedStudies
        .sort((a, b) => a.authors.localeCompare(b.authors))
        .forEach((study, idx) => {
          const journalInfo = study.details?.journal ? ` *${study.details.journal}*.` : "";
          const doiInfo = study.details?.doi ? ` https://doi.org/${study.details.doi}` : "";
          lines.push(`${idx + 1}. ${study.authors} (${study.year}). ${study.title}.${journalInfo}${doiInfo}`);
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
      metadata: { sections: orderedSections.length },
    });
    if (!createResult.success) throw new Error(createResult.error);
    const newExport = createResult.data;

    setExportHistory((prev) => [newExport, ...prev]);
    setLatestExport(newExport);

    return newExport;
  }, [projectName, projectId, flushContentCommit, orderedSections, draft.contentBySection, draft.ledgerBySection, latestExport, studies]);

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

    flushContentCommit();

    const lines: string[] = [];
    lines.push(`# ${projectName}`);
    lines.push("");
    lines.push(`*Draft exported on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`);
    lines.push("");
    lines.push("---");
    lines.push("");

    for (const section of orderedSections) {
      const content = draft.contentBySection[section.id];
      if (!docHasContent(content)) continue;

      lines.push(`## ${section.label}`);
      lines.push("");
      lines.push(jsonToText(content));
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
  }, [projectName, projectId, draft.contentBySection, orderedSections, flushContentCommit]);

  return {
    isExportModalOpen,
    setExportModalOpen,
    exportHistory,
    latestExport,
    hasDraftContent,
    handleExportDocx,
    handleDeleteExport,
    handleExportDraft,
  };
}
