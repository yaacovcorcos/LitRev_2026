"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./StudyFilesPanel.module.css";
import type { FileAsset } from "@/types/files";
import { validateStudyFile } from "@/lib/fileValidation";

type StudyFilesPanelProps = {
  projectId: string;
  studyId: string;
  studyTitle: string;
  files: FileAsset[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
  onClose: () => void;
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
}: StudyFilesPanelProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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

  const handleDelete = async (fileId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await onDelete(fileId);
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
                {file.publicUrl && (
                  <a
                    href={file.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.actionBtn}
                    title="Open file"
                  >
                    <span className="material-icons-round">open_in_new</span>
                  </a>
                )}
                <a
                  href={file.publicUrl || file.storagePath}
                  download={file.filename}
                  className={styles.actionBtn}
                  title="Download"
                >
                  <span className="material-icons-round">download</span>
                </a>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.deleteBtn}`}
                  onClick={() => handleDelete(file.id)}
                  title="Delete file"
                >
                  <span className="material-icons-round">delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
