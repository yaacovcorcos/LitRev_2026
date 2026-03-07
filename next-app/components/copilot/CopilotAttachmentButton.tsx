"use client";

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { FileAsset } from "@/types/files";
import { listProjectFilesAction } from "@/app/actions/files";
import styles from "./CopilotInput.module.css";

type CopilotAttachmentButtonProps = {
    projectId: string;
    studyId?: string;
    isAttaching: boolean;
    onAttachFile: (file: File) => void | Promise<void>;
    onAttachExistingFile: (fileAssetId: string) => void | Promise<void>;
};

const FILE_LIST_TTL_MS = 30_000;

export function CopilotAttachmentButton({
    projectId,
    studyId,
    isAttaching,
    onAttachFile,
    onAttachExistingFile,
}: CopilotAttachmentButtonProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [showAttachPicker, setShowAttachPicker] = useState(false);
    const [projectFiles, setProjectFiles] = useState<FileAsset[]>([]);
    const [loadingProjectFiles, setLoadingProjectFiles] = useState(false);
    const fileListCacheRef = useRef<{ files: FileAsset[]; fetchedAt: number } | null>(null);

    const handleUploadNew = useCallback(() => {
        setShowAttachPicker(false);
        requestAnimationFrame(() => fileInputRef.current?.click());
    }, []);

    const handleFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".pdf")) return;
        onAttachFile(file);
        event.target.value = "";
    }, [onAttachFile]);

    const handleAttachExisting = useCallback((fileAssetId: string) => {
        setShowAttachPicker(false);
        onAttachExistingFile(fileAssetId);
    }, [onAttachExistingFile]);

    const handleOpenChange = useCallback((open: boolean) => {
        if (open) {
            const cache = fileListCacheRef.current;
            const isFresh = cache && (Date.now() - cache.fetchedAt) < FILE_LIST_TTL_MS;
            if (isFresh) {
                setProjectFiles(cache.files);
            } else if (!loadingProjectFiles) {
                setLoadingProjectFiles(true);
                listProjectFilesAction(projectId)
                    .then((result) => {
                        if (!result.success) {
                            console.error(result.error);
                            return;
                        }
                        const pdfs = result.data.filter((file) => file.format === "pdf" || file.mimeType.includes("pdf"));
                        fileListCacheRef.current = { files: pdfs, fetchedAt: Date.now() };
                        setProjectFiles(pdfs);
                    })
                    .catch(console.error)
                    .finally(() => setLoadingProjectFiles(false));
            }
        }
        setShowAttachPicker(open);
    }, [loadingProjectFiles, projectId]);

    const studyFiles = studyId
        ? projectFiles.filter((file) => file.studyId === studyId)
        : [];
    const otherFiles = studyId
        ? projectFiles.filter((file) => file.studyId !== studyId)
        : projectFiles;

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />
            <Popover.Root open={showAttachPicker} onOpenChange={handleOpenChange}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.attachBtn}`}
                        aria-label="Attach file"
                        title="Attach file"
                        disabled={isAttaching}
                    >
                        <span className="material-icons-round">
                            {isAttaching ? "hourglass_top" : "attach_file"}
                        </span>
                    </button>
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content className={styles.attachPicker} side="top" align="start" sideOffset={6}>
                        <button
                            type="button"
                            className={styles.attachPickerItem}
                            onClick={handleUploadNew}
                        >
                            <span className="material-icons-round" style={{ fontSize: 16 }}>upload_file</span>
                            <span>Upload PDF</span>
                        </button>
                        {projectFiles.length > 0 && (
                            <>
                                <div className={styles.attachPickerDivider} />
                                {studyFiles.length > 0 && (
                                    <>
                                        <div className={styles.attachPickerLabel}>This study</div>
                                        {studyFiles.map((file) => (
                                            <button
                                                key={file.id}
                                                type="button"
                                                className={styles.attachPickerItem}
                                                onClick={() => handleAttachExisting(file.id)}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: 16 }}>description</span>
                                                <span className={styles.attachPickerFileName}>{file.filename}</span>
                                            </button>
                                        ))}
                                    </>
                                )}
                                {otherFiles.length > 0 && (
                                    <>
                                        <div className={styles.attachPickerLabel}>
                                            {studyFiles.length > 0 ? "Other studies" : "From project studies"}
                                        </div>
                                        {otherFiles.slice(0, 10).map((file) => (
                                            <button
                                                key={file.id}
                                                type="button"
                                                className={styles.attachPickerItem}
                                                onClick={() => handleAttachExisting(file.id)}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: 16 }}>description</span>
                                                <span className={styles.attachPickerFileName}>{file.filename}</span>
                                            </button>
                                        ))}
                                    </>
                                )}
                            </>
                        )}
                        {loadingProjectFiles && (
                            <div className={styles.attachPickerLoading}>Loading...</div>
                        )}
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
        </>
    );
}
