"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ExportModal.module.css";
import type { FileAsset } from "@/types/files";

type ExportStatus = "idle" | "exporting" | "success" | "error";

type ExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => Promise<FileAsset>;
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
  latestExport,
  exportHistory,
  onDeleteExport,
}: ExportModalProps) {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newExport, setNewExport] = useState<FileAsset | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const resetState = useCallback(() => {
    setStatus("idle");
    setErrorMsg(null);
    setNewExport(null);
    setShowHistory(false);
    setCopiedId(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleExport = async () => {
    setStatus("exporting");
    setErrorMsg(null);
    try {
      const result = await onExport();
      setNewExport(result);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Export failed");
      setStatus("error");
    }
  };

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

  const handleDeleteExport = async (fileId: string) => {
    if (!onDeleteExport) return;
    if (!confirm("Delete this export version?")) return;
    try {
      await onDeleteExport(fileId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (!isOpen) return null;

  const displayExport = newExport || latestExport;
  const olderExports = exportHistory.filter((f) => f.id !== displayExport?.id);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className={styles.header}>
          <h2 id="export-modal-title" className={styles.title}>
            <span className="material-icons-round">description</span>
            Export Draft
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className={styles.body}>
          {status === "idle" && (
            <>
              <p className={styles.desc}>
                Export your draft as a Word document (.docx). You can download it
                immediately or access it later from the export history.
              </p>
              <button
                type="button"
                className={styles.exportBtn}
                onClick={handleExport}
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
                onClick={handleExport}
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
                  <a
                    href={displayExport.publicUrl || displayExport.storagePath}
                    download={displayExport.filename}
                    className={styles.downloadBtn}
                  >
                    <span className="material-icons-round">download</span>
                    Download
                  </a>
                </div>
              </div>

              {displayExport.publicUrl && (
                <div className={styles.linkSection}>
                  <div className={styles.linkHeader}>
                    <span className="material-icons-round">link</span>
                    <span>Public Link</span>
                  </div>
                  <div className={styles.linkRow}>
                    <input
                      type="text"
                      readOnly
                      value={displayExport.publicUrl}
                      className={styles.linkInput}
                    />
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => handleCopyLink(displayExport.publicUrl!, displayExport.id)}
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
                        <a
                          href={file.publicUrl || file.storagePath}
                          download={file.filename}
                          className={styles.historyBtn}
                          title="Download"
                        >
                          <span className="material-icons-round">download</span>
                        </a>
                        {file.publicUrl && (
                          <button
                            type="button"
                            className={styles.historyBtn}
                            onClick={() => handleCopyLink(file.publicUrl!, file.id)}
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
                            onClick={() => handleDeleteExport(file.id)}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
