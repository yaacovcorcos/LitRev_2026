"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listProjectFilesAction } from "@/app/actions/files";
import type { FileAsset } from "@/types/files";

function sortExportsByCreatedAt(exports: FileAsset[]): FileAsset[] {
  return [...exports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function filterDraftExports(files: FileAsset[]): FileAsset[] {
  return sortExportsByCreatedAt(files.filter((file) => file.kind === "export" && file.format === "docx"));
}

type ExportHistoryState = {
  projectId: string | null;
  items: FileAsset[];
};

export function useProjectExportHistory(projectId: string) {
  const [historyState, setHistoryState] = useState<ExportHistoryState>({
    projectId: projectId || null,
    items: [],
  });
  const exportHistory = useMemo(
    () => (historyState.projectId === projectId ? historyState.items : []),
    [historyState.items, historyState.projectId, projectId],
  );
  const latestExport = useMemo(() => exportHistory[0] ?? null, [exportHistory]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let isActive = true;

    const loadExports = async () => {
      try {
        const result = await listProjectFilesAction(projectId);
        if (!isActive) return;
        if (!result.success) {
          console.error("Failed to load exports:", result.error);
          setHistoryState({ projectId, items: [] });
          return;
        }
        const nextExports = filterDraftExports(result.data);
        setHistoryState({ projectId, items: nextExports });
      } catch (error) {
        if (!isActive) return;
        console.error("Failed to load exports", error);
        setHistoryState({ projectId, items: [] });
      }
    };

    void loadExports();

    return () => {
      isActive = false;
    };
  }, [projectId]);

  const prependExport = useCallback((file: FileAsset) => {
    setHistoryState((prev) =>
      prev.projectId === projectId
        ? {
            projectId,
            items: sortExportsByCreatedAt([file, ...prev.items.filter((entry) => entry.id !== file.id)]),
          }
        : prev,
    );
  }, [projectId]);

  const removeExport = useCallback((fileId: string) => {
    setHistoryState((prev) =>
      prev.projectId === projectId
        ? {
            projectId,
            items: prev.items.filter((entry) => entry.id !== fileId),
          }
        : prev,
    );
  }, [projectId]);

  return {
    exportHistory,
    latestExport,
    prependExport,
    removeExport,
  };
}
