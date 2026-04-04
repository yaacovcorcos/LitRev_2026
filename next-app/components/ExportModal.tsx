"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import styles from "./ExportModal.module.css";
import type { FileAsset } from "@/types/files";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type ExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => Promise<FileAsset>;
  exportMode: "warn" | "strict";
  onExportModeChange: (mode: "warn" | "strict") => void;
  citationIssuesCount: number;
  blockingCitationIssuesCount: number;
  latestExport?: FileAsset | null;
  exportHistory: FileAsset[];
  onDeleteExport?: (fileId: string) => Promise<void>;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  exportMode,
  onExportModeChange,
  citationIssuesCount,
  blockingCitationIssuesCount,
  latestExport,
  exportHistory,
  onDeleteExport,
}: ExportModalProps) {
  const [newExport, setNewExport] = useState<FileAsset | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteExportId, setDeleteExportId] = useState<string | null>(null);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  const exportAction = useAsyncAction(
    async () => {
      const result = await onExport();
      setNewExport(result);
      return result;
    },
    {
      successMessage: "Export ready!",
      errorMessage: "Export failed",
      resetDelay: 0,
    },
  );

  // Map hook status to the legacy names used in the template
  const status = exportAction.status === "loading" ? "exporting" : exportAction.status;
  const errorMsg = exportAction.error;

  const resetState = useCallback(() => {
    exportAction.reset();
    setNewExport(null);
    setShowHistory(false);
    setCopiedId(null);
    setDeleteExportId(null);
    setDeleteErrorMsg(null);
  }, [exportAction]);

  useEffect(() => {
    if (!isOpen) {
      const timer = window.setTimeout(() => {
        resetState();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, resetState]);

  const handleCopyLink = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDeleteExportConfirm = async () => {
    if (!onDeleteExport || !deleteExportId) return;
    const id = deleteExportId;
    setDeleteExportId(null);
    setDeleteErrorMsg(null);
    try {
      await onDeleteExport(id);
    } catch (err) {
      setDeleteErrorMsg(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const displayExport = newExport || latestExport;
  const olderExports = exportHistory.filter((f) => f.id !== displayExport?.id);
  const displayExportLink = displayExport
    ? (displayExport.downloadUrl ?? displayExport.publicUrl)
    : undefined;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.modal}
          aria-labelledby="export-modal-title"
        >
          <div className={styles.header}>
            <h2 id="export-modal-title" className={styles.title}>
              <span className="material-icons-round">description</span>
              Export Draft
            </h2>
            <Dialog.Close asChild>
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="Close"
              >
                <span className="material-icons-round">close</span>
              </button>
            </Dialog.Close>
          </div>

          <div className={styles.body}>
            {status === "idle" && (
              <>
                <p className={styles.desc}>
                  Export your draft as a Word document (.docx). You can download it
                  immediately or access it later from the export history.
                </p>
                <div className={styles.modeSwitch} role="group" aria-label="Export integrity mode">
                  <label className={styles.modeOption}>
                    <input
                      type="radio"
                      name="export-mode"
                      checked={exportMode === "warn"}
                      onChange={() => onExportModeChange("warn")}
                    />
                    <span>Warn</span>
                  </label>
                  <label className={styles.modeOption}>
                    <input
                      type="radio"
                      name="export-mode"
                      checked={exportMode === "strict"}
                      onChange={() => onExportModeChange("strict")}
                    />
                    <span>Strict</span>
                  </label>
                </div>
                {citationIssuesCount > 0 ? (
                  <p className={styles.modeHint}>
                    Citation issues: {citationIssuesCount}
                    {blockingCitationIssuesCount > 0 ? ` (${blockingCitationIssuesCount} blocking in strict mode)` : ""}
                  </p>
                ) : (
                  <p className={styles.modeHint}>No citation issues detected.</p>
                )}
                <button
                  type="button"
                  className={styles.exportBtn}
                  onClick={() => { void exportAction.execute(); }}
                >
                  <span className="material-icons-round">file_download</span>
                  Generate DOCX Export
                </button>
              </>
            )}

            {status === "exporting" && (
              <div className={styles.statusBox}>
                <span className={`material-icons-round ${styles.spinIcon}`}>sync</span>
                <span className={styles.statusText}>Generating document...</span>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} />
                </div>
              </div>
            )}

            {status === "error" && (
              <div className={styles.statusBox}>
                <span className={`material-icons-round ${styles.errorIcon}`}>error</span>
                <span className={styles.statusText}>{errorMsg || "Export failed"}</span>
                <button
                  type="button"
                  className={styles.retryBtn}
                  onClick={() => { void exportAction.execute(); }}
                >
                  Try Again
                </button>
              </div>
            )}

            {status === "success" && displayExport && (
              <div className={styles.successBox}>
                <div className={styles.successIcon}>
                  <span className="material-icons-round">check_circle</span>
                </div>
                <span className={styles.successText}>Export ready!</span>
                <div className={styles.exportCard}>
                  <div className={styles.exportInfo}>
                    <span className={styles.exportName}>{displayExport.filename}</span>
                    <span className={styles.exportMeta}>
                      {formatFileSize(displayExport.size)} · v{displayExport.version} · {formatDate(displayExport.createdAt)}
                    </span>
                  </div>
                  <div className={styles.exportActions}>
                    {displayExport.downloadUrl ? (
                      <a
                        href={displayExport.downloadUrl}
                        download={displayExport.filename}
                        className={styles.downloadBtn}
                      >
                        <span className="material-icons-round">download</span>
                        Download
                      </a>
                    ) : (
                      <button
                        type="button"
                        className={styles.downloadBtn}
                        disabled
                      >
                        <span className="material-icons-round">download</span>
                        Download Unavailable
                      </button>
                    )}
                  </div>
                </div>

                {displayExportLink && (
                  <div className={styles.linkSection}>
                    <div className={styles.linkHeader}>
                      <span className="material-icons-round">link</span>
                      <span>Link</span>
                    </div>
                    <div className={styles.linkRow}>
                      <input
                        type="text"
                        readOnly
                        value={displayExportLink}
                        className={styles.linkInput}
                      />
                      <button
                        type="button"
                        className={styles.copyBtn}
                        onClick={() => handleCopyLink(displayExportLink, displayExport.id)}
                      >
                        <span className="material-icons-round">
                          {copiedId === displayExport.id ? "check" : "content_copy"}
                        </span>
                        {copiedId === displayExport.id ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(displayExport || olderExports.length > 0) && status !== "exporting" && (
              <div className={styles.historySection}>
                <button
                  type="button"
                  className={styles.historyToggle}
                  onClick={() => setShowHistory(!showHistory)}
                  aria-expanded={showHistory}
                >
                  <span className="material-icons-round">
                    {showHistory ? "expand_less" : "expand_more"}
                  </span>
                  {showHistory ? "Hide" : "Show"} Version History
                  {olderExports.length > 0 && (
                    <span className={styles.historyCount}>({olderExports.length})</span>
                  )}
                </button>

                {showHistory && olderExports.length > 0 && (
                  <div className={styles.historyList}>
                    {olderExports.map((file) => (
                      <div key={file.id} className={styles.historyItem}>
                        <div className={styles.historyInfo}>
                          <span className={styles.historyName}>{file.filename}</span>
                          <span className={styles.historyMeta}>
                            v{file.version} · {formatFileSize(file.size)} · {formatDate(file.createdAt)}
                          </span>
                        </div>
                        <div className={styles.historyActions}>
                          {file.downloadUrl ? (
                            <a
                              href={file.downloadUrl}
                              download={file.filename}
                              className={styles.historyBtn}
                              aria-label="Download export"
                              title="Download"
                            >
                              <span className="material-icons-round">download</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              className={styles.historyBtn}
                              disabled
                              aria-label="Download unavailable"
                              title="Download unavailable"
                            >
                              <span className="material-icons-round">download</span>
                            </button>
                          )}
                          {(file.downloadUrl ?? file.publicUrl) && (
                            <button
                              type="button"
                              className={styles.historyBtn}
                              onClick={() => handleCopyLink(file.downloadUrl ?? file.publicUrl!, file.id)}
                              aria-label={copiedId === file.id ? "Copied export link" : "Copy export link"}
                              title={copiedId === file.id ? "Copied!" : "Copy link"}
                            >
                              <span className="material-icons-round">
                                {copiedId === file.id ? "check" : "link"}
                              </span>
                            </button>
                          )}
                          {onDeleteExport && (
                            <button
                              type="button"
                              className={`${styles.historyBtn} ${styles.historyDeleteBtn}`}
                              onClick={() => setDeleteExportId(file.id)}
                              aria-label="Delete export"
                              title="Delete"
                            >
                              <span className="material-icons-round">delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showHistory && olderExports.length === 0 && (
                  <p className={styles.noHistory}>No previous versions available.</p>
                )}
                {deleteErrorMsg ? (
                  <p className={styles.historyError} role="alert">{deleteErrorMsg}</p>
                ) : null}
              </div>
            )}
          </div>

          <ConfirmDialog
            isOpen={deleteExportId !== null}
            title="Delete export"
            message="Delete this export version? This action cannot be undone."
            confirmLabel="Delete"
            cancelLabel="Cancel"
            variant="danger"
            onConfirm={handleDeleteExportConfirm}
            onCancel={() => setDeleteExportId(null)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
