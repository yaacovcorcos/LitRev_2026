"use client";

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { listProjectFilesAction } from "@/app/actions/files";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PHONE_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import type { FileAsset } from "@/types/files";
import styles from "./CopilotInput.module.css";

type CopilotActionsMenuButtonProps = {
    projectId?: string;
    studyId?: string;
    isAttaching?: boolean;
    onAttachFile?: (file: File) => void | Promise<void>;
    onAttachExistingFile?: (fileAssetId: string) => void | Promise<void>;
    onCompress?: () => void | Promise<void>;
    canCompress?: boolean;
    isCompressing?: boolean;
    disabled?: boolean;
};

const FILE_LIST_TTL_MS = 30_000;

export function CopilotActionsMenuButton({
    projectId,
    studyId,
    isAttaching = false,
    onAttachFile,
    onAttachExistingFile,
    onCompress,
    canCompress = false,
    isCompressing = false,
    disabled = false,
}: CopilotActionsMenuButtonProps) {
    const canShowAttachments = !!projectId && !!onAttachFile && !!onAttachExistingFile;
    const canShowCompress = !!onCompress;
    const hasActions = canShowAttachments || canShowCompress;
    const [open, setOpen] = useState(false);
    const isPhoneViewport = useMediaQuery(PHONE_MEDIA_QUERY);
    const [projectFiles, setProjectFiles] = useState<FileAsset[]>([]);
    const [loadingProjectFiles, setLoadingProjectFiles] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const fileListCacheRef = useRef<{ files: FileAsset[]; fetchedAt: number } | null>(null);

    const loadProjectFiles = useCallback(async () => {
        if (!canShowAttachments || loadingProjectFiles || !projectId) return;
        const cache = fileListCacheRef.current;
        const isFresh = cache && (Date.now() - cache.fetchedAt) < FILE_LIST_TTL_MS;
        if (isFresh) {
            setProjectFiles(cache.files);
            return;
        }

        setLoadingProjectFiles(true);
        try {
            const result = await listProjectFilesAction(projectId);
            if (!result.success) {
                console.error(result.error);
                return;
            }
            const pdfs = result.data.filter((file) => file.format === "pdf" || file.mimeType.includes("pdf"));
            fileListCacheRef.current = { files: pdfs, fetchedAt: Date.now() };
            setProjectFiles(pdfs);
        } catch (error) {
            console.error("Failed to load project files", error);
        } finally {
            setLoadingProjectFiles(false);
        }
    }, [canShowAttachments, loadingProjectFiles, projectId]);

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        if (disabled) {
            setOpen(false);
            return;
        }
        if (nextOpen && canShowAttachments) {
            void loadProjectFiles();
        }
        setOpen(nextOpen);
    }, [canShowAttachments, disabled, loadProjectFiles]);

    const handleUploadNew = useCallback(() => {
        setOpen(false);
        requestAnimationFrame(() => fileInputRef.current?.click());
    }, []);

    const handleFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".pdf")) return;
        onAttachFile?.(file);
        event.target.value = "";
    }, [onAttachFile]);

    const handleAttachExisting = useCallback((fileAssetId: string) => {
        setOpen(false);
        onAttachExistingFile?.(fileAssetId);
    }, [onAttachExistingFile]);

    const handleCompress = useCallback(() => {
        if (!canShowCompress || !canCompress || isCompressing) return;
        setOpen(false);
        void onCompress?.();
    }, [canCompress, canShowCompress, isCompressing, onCompress]);

    if (!hasActions) return null;

    const studyFiles = studyId
        ? projectFiles.filter((file) => file.studyId === studyId)
        : [];
    const otherFiles = studyId
        ? projectFiles.filter((file) => file.studyId !== studyId)
        : projectFiles;

    const trigger = (
        <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionMenuBtn}`}
            aria-label="More actions"
            title="More actions"
            disabled={disabled}
        >
            <span className="material-icons-round">add</span>
        </button>
    );

    const content = (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />
            <div className={styles.actionsMenuSection}>
                {canShowAttachments && (
                    <button
                        type="button"
                        className={styles.actionsMenuItem}
                        onClick={handleUploadNew}
                        disabled={isAttaching}
                    >
                        <span className="material-icons-round">{isAttaching ? "hourglass_top" : "upload_file"}</span>
                        <span>{isAttaching ? "Uploading PDF..." : "Upload PDF"}</span>
                    </button>
                )}
                {canShowCompress && (
                    <button
                        type="button"
                        className={`${styles.actionsMenuItem} ${(!canCompress || isCompressing) ? styles.actionsMenuItemDisabled : ""}`}
                        onClick={handleCompress}
                        disabled={!canCompress || isCompressing}
                        title={canCompress ? "Compress history" : "Compress (available after longer chats)"}
                    >
                        <span className="material-icons-round">{isCompressing ? "hourglass_top" : "compress"}</span>
                        <span>{isCompressing ? "Compressing history..." : "Compress history"}</span>
                    </button>
                )}
            </div>

            {canShowAttachments && (
                <div className={styles.actionsMenuFiles}>
                    {loadingProjectFiles ? (
                        <div className={styles.actionsMenuLoading}>Loading project PDFs...</div>
                    ) : projectFiles.length > 0 ? (
                        <>
                            {studyFiles.length > 0 && (
                                <div className={styles.actionsMenuSection}>
                                    <div className={styles.actionsMenuLabel}>This study</div>
                                    {studyFiles.map((file) => (
                                        <button
                                            key={file.id}
                                            type="button"
                                            className={styles.actionsMenuItem}
                                            onClick={() => handleAttachExisting(file.id)}
                                        >
                                            <span className="material-icons-round">description</span>
                                            <span className={styles.actionsMenuFileName}>{file.filename}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {otherFiles.length > 0 && (
                                <div className={styles.actionsMenuSection}>
                                    <div className={styles.actionsMenuLabel}>
                                        {studyFiles.length > 0 ? "Other studies" : "Project PDFs"}
                                    </div>
                                    {otherFiles.slice(0, 10).map((file) => (
                                        <button
                                            key={file.id}
                                            type="button"
                                            className={styles.actionsMenuItem}
                                            onClick={() => handleAttachExisting(file.id)}
                                        >
                                            <span className="material-icons-round">description</span>
                                            <span className={styles.actionsMenuFileName}>{file.filename}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={styles.actionsMenuEmpty}>No project PDFs yet.</div>
                    )}
                </div>
            )}
        </>
    );

    if (isPhoneViewport) {
        return (
            <Dialog.Root open={open} onOpenChange={handleOpenChange}>
                <Dialog.Trigger asChild>
                    {trigger}
                </Dialog.Trigger>
                <Dialog.Portal>
                    <Dialog.Overlay className={styles.actionsSheetOverlay} />
                    <Dialog.Content className={styles.actionsSheetContent} aria-describedby={undefined}>
                        <VisuallyHidden>
                            <Dialog.Title>More actions</Dialog.Title>
                        </VisuallyHidden>
                        <div className={styles.actionsSheetHandle} aria-hidden="true" />
                        <div className={styles.actionsSheetHeader}>More actions</div>
                        {content}
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        );
    }

    return (
        <DropdownMenu.Root open={open} onOpenChange={handleOpenChange}>
            <DropdownMenu.Trigger asChild>
                {trigger}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content className={styles.actionsMenuDropdown} side="top" align="start" sideOffset={6}>
                    {content}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
