"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./StudyFilesPanel.module.css";
import type { FileAsset } from "@/types/files";
import { validateStudyFile } from "@/lib/fileValidation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type StudyFilesPanelProps = {
  projectId: string;
  studyId: string;
  studyTitle: string;
  files: FileAsset[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
  onClose: () => void;
  /** Optional: callback to extract study data from a PDF */
  onExtract?: (fileId: string) => Promise<void>;
  /** Optional: ID of file currently being extracted */
  extractingFileId?: string;
  processingLabel?: string;
  processingDescription?: string;
  disableExtract?: boolean;
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

export function StudyFilesPanel({
  studyTitle,
  files,
  onUpload,
  onDelete,
  onClose,
  onExtract,
  extractingFileId,
  processingLabel,
  processingDescription,
  disableExtract,
}: StudyFilesPanelProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sortedFiles = [...files].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleUpload = useCallback(
    async (file: File) => {
      const error = validateStudyFile(file);
      if (error) {
        setUploadError(error);
        return;
      }
      setUploadError(null);
      setIsUploading(true);
      try {
        await onUpload(file);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteFileId) return;
    const id = deleteFileId;
    setDeleteFileId(null);
    try {
      await onDelete(id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>Study Files</span>
          <h3 className={styles.title}>{studyTitle}</h3>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close files panel"
        >
          <span className="material-icons-round">close</span>
        </button>
      </div>

      <div
        className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""} ${isUploading ? styles.dropZoneUploading : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          className={styles.fileInput}
          disabled={isUploading}
        />
        {isUploading ? (
          <>
            <span className={`material-icons-round ${styles.spinIcon}`}>sync</span>
            <span>Uploading...</span>
          </>
        ) : (
          <>
            <span className="material-icons-round">cloud_upload</span>
            <span>Drop PDF or DOCX here, or click to browse</span>
            <span className={styles.sizeHint}>Max 100MB</span>
          </>
        )}
      </div>

      {uploadError && (
        <div className={styles.errorBanner}>
          <span className="material-icons-round">error</span>
          {uploadError}
        </div>
      )}

      {processingLabel && processingDescription && (
        <div className={styles.infoBanner}>
          <span className="material-icons-round">schedule</span>
          <div className={styles.infoBannerText}>
            <strong>{processingLabel}</strong>
            <span>{processingDescription}</span>
          </div>
        </div>
      )}

      <div className={styles.fileList}>
        {sortedFiles.length === 0 ? (
          <div className={styles.emptyState}>
            <span className="material-icons-round">folder_open</span>
            <p>No files attached to this study yet.</p>
          </div>
        ) : (
          sortedFiles.map((file) => (
            <div key={file.id} className={styles.fileItem}>
              <div className={styles.fileIcon}>
                <span className="material-icons-round">
                  {file.format === "pdf" ? "picture_as_pdf" : "description"}
                </span>
              </div>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{file.filename}</span>
                <span className={styles.fileMeta}>
                  {formatFileSize(file.size)} · {formatDate(file.createdAt)}
                </span>
              </div>
              <div className={styles.fileActions}>
                {/* Extract button for PDF files */}
                {file.format === "pdf" && onExtract && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.extractBtn}`}
                    onClick={() => onExtract(file.id)}
                    disabled={Boolean(extractingFileId) || Boolean(disableExtract)}
                    aria-label={extractingFileId === file.id ? "Extracting file" : disableExtract ? "Processing already running" : "Extract study data from PDF"}
                    title={extractingFileId === file.id ? "Extracting..." : disableExtract ? "Processing already running" : "Extract study data from PDF"}
                  >
                    <span className={`material-icons-round ${extractingFileId === file.id ? styles.spinIcon : ""}`}>
                      {extractingFileId === file.id || disableExtract ? "sync" : "auto_awesome"}
                    </span>
                  </button>
                )}
                {file.publicUrl && (
                  <a
                    href={file.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.actionBtn}
                    aria-label="Open file"
                    title="Open file"
                  >
                    <span className="material-icons-round">open_in_new</span>
                  </a>
                )}
                <a
                  href={file.publicUrl || file.storagePath}
                  download={file.filename}
                  className={styles.actionBtn}
                  aria-label="Download file"
                  title="Download"
                >
                  <span className="material-icons-round">download</span>
                </a>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.deleteBtn}`}
                  onClick={() => setDeleteFileId(file.id)}
                  aria-label="Delete file"
                  title="Delete file"
                >
                  <span className="material-icons-round">delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteFileId !== null}
        title="Delete file"
        message="Are you sure you want to delete this file? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteFileId(null)}
      />
    </div>
  );
}
