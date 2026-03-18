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

export function useProjectExportHistory(projectId: string) {
  const [exportHistory, setExportHistory] = useState<FileAsset[]>([]);
  const latestExport = useMemo(() => exportHistory[0] ?? null, [exportHistory]);

  useEffect(() => {
    if (!projectId) {
      setExportHistory([]);
      return;
    }

    let isActive = true;
    setExportHistory([]);

    const loadExports = async () => {
      try {
        const result = await listProjectFilesAction(projectId);
        if (!isActive) return;
        if (!result.success) {
          console.error("Failed to load exports:", result.error);
          setExportHistory([]);
          return;
        }
        const nextExports = filterDraftExports(result.data);
        setExportHistory(nextExports);
      } catch (error) {
        if (!isActive) return;
        console.error("Failed to load exports", error);
        setExportHistory([]);
      }
    };

    void loadExports();

    return () => {
      isActive = false;
    };
  }, [projectId]);

  const prependExport = useCallback((file: FileAsset) => {
    setExportHistory((prev) => sortExportsByCreatedAt([file, ...prev.filter((entry) => entry.id !== file.id)]));
  }, []);

  const removeExport = useCallback((fileId: string) => {
    setExportHistory((prev) => prev.filter((entry) => entry.id !== fileId));
  }, []);

  return {
    exportHistory,
    latestExport,
    prependExport,
    removeExport,
  };
}
