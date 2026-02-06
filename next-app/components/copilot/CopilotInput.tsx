/**
 * CopilotInput
 * Extracted input area: textarea, model selector, attachments, voice, send button
 * (planC Phase 0.6)
 */

"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useProjectCopilot, type CopilotPage } from "@/contexts/ProjectCopilotContext";
import { USER_SELECTABLE_MODELS, type SelectableModelId } from "@/lib/ai/config";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { listProjectFilesAction } from "@/app/actions/files";
import type { FileAsset } from "@/types/files";
import styles from "../ProjectCopilot.module.css";

export type CopilotInputProps = {
    page: CopilotPage;
    section?: string;
    inputPlaceholder: string;
};

export function CopilotInput({ page, section, inputPlaceholder }: CopilotInputProps) {
    const {
        isLoading,
        sendMessage,
        pendingAttachment,
        isAttaching,
        attachFile,
        attachExistingFile,
        clearAttachment,
        projectId,
    } = useProjectCopilot();

    const [input, setInput] = useState("");
    const [selectedModel, setSelectedModel] = useState<SelectableModelId>(() => {
        if (typeof window === "undefined") return "gpt-5.2";
        const stored = window.localStorage.getItem("litrev_copilot_model");
        const valid = USER_SELECTABLE_MODELS.some(m => m.id === stored);
        return valid ? (stored as SelectableModelId) : "gpt-5.2";
    });
    const [showModelMenu, setShowModelMenu] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const modelMenuRef = useRef<HTMLDivElement | null>(null);

    // Voice input
    const handleTranscription = useCallback((text: string) => {
        setInput((prev) => {
            const separator = prev.trim() ? " " : "";
            return prev + separator + text;
        });
    }, []);
    const { state: voiceState, error: voiceError, toggleRecording, clearError: clearVoiceError } = useVoiceInput(handleTranscription);

    // Persist model preference
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem("litrev_copilot_model", selectedModel);
        }
    }, [selectedModel]);

    // Close model menu on click outside
    useEffect(() => {
        if (!showModelMenu) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
                setShowModelMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showModelMenu]);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }, [input]);

    // Attachment state
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [showAttachPicker, setShowAttachPicker] = useState(false);
    const [projectFiles, setProjectFiles] = useState<FileAsset[]>([]);
    const [loadingProjectFiles, setLoadingProjectFiles] = useState(false);
    const attachPickerRef = useRef<HTMLDivElement | null>(null);

    // Close attachment picker on click outside
    useEffect(() => {
        if (!showAttachPicker) return;
        const handleClick = (e: MouseEvent) => {
            if (attachPickerRef.current && !attachPickerRef.current.contains(e.target as Node)) {
                setShowAttachPicker(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showAttachPicker]);

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text && !pendingAttachment) return;
        sendMessage(text, page, section, selectedModel);
        setInput("");
    }, [input, page, section, sendMessage, selectedModel, pendingAttachment]);

    const handleFileAttach = useCallback(() => {
        setShowAttachPicker((prev) => {
            if (!prev && projectFiles.length === 0 && !loadingProjectFiles) {
                setLoadingProjectFiles(true);
                listProjectFilesAction(projectId)
                    .then((files) => {
                        const pdfs = files.filter((f) => f.format === "pdf" || f.mimeType.includes("pdf"));
                        setProjectFiles(pdfs);
                    })
                    .catch(console.error)
                    .finally(() => setLoadingProjectFiles(false));
            }
            return !prev;
        });
    }, [projectId, projectFiles.length, loadingProjectFiles]);

    const handleUploadNew = useCallback(() => {
        setShowAttachPicker(false);
        fileInputRef.current?.click();
    }, []);

    const handleFileSelected = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".pdf")) return;
        attachFile(file);
        e.target.value = "";
    }, [attachFile]);

    const handleAttachExisting = useCallback((fileAssetId: string) => {
        setShowAttachPicker(false);
        attachExistingFile(fileAssetId);
    }, [attachExistingFile]);

    const selectedModelInfo = USER_SELECTABLE_MODELS.find(m => m.id === selectedModel);

    return (
        <>
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />

            <form
                className={styles.inputBox}
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                }}
            >
                {/* Pending attachment chip */}
                {(pendingAttachment || isAttaching) && (
                    <div className={styles.pendingAttachment}>
                        <span className="material-icons-round" style={{ fontSize: 16 }}>description</span>
                        {isAttaching ? (
                            <span className={styles.pendingAttachmentName}>Uploading...</span>
                        ) : pendingAttachment ? (
                            <>
                                <span className={styles.pendingAttachmentName}>{pendingAttachment.filename}</span>
                                <button
                                    type="button"
                                    className={styles.pendingAttachmentRemove}
                                    onClick={clearAttachment}
                                    aria-label="Remove attachment"
                                >
                                    <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
                                </button>
                            </>
                        ) : null}
                    </div>
                )}

                {/* Text input */}
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={isLoading ? "Thinking..." : inputPlaceholder}
                    aria-label="Copilot prompt"
                    disabled={isLoading}
                    className={styles.inputTextarea}
                    rows={1}
                />

                {/* Actions bar */}
                <div className={styles.inputBar}>
                    <div className={styles.inputBarLeft}>
                        {/* Model selector */}
                        <div className={styles.modelSelector} ref={modelMenuRef}>
                            <button
                                type="button"
                                className={styles.modelBtn}
                                onClick={() => setShowModelMenu(!showModelMenu)}
                                aria-haspopup="listbox"
                                aria-expanded={showModelMenu}
                            >
                                {selectedModelInfo?.name || "GPT-5.2"}
                                <span className="material-icons-round">expand_more</span>
                            </button>
                            {showModelMenu && (
                                <div className={styles.modelDropdown} role="listbox">
                                    {USER_SELECTABLE_MODELS.map((model) => (
                                        <button
                                            key={model.id}
                                            type="button"
                                            className={`${styles.modelItem} ${selectedModel === model.id ? styles.modelItemActive : ""}`}
                                            onClick={() => {
                                                setSelectedModel(model.id);
                                                setShowModelMenu(false);
                                            }}
                                            role="option"
                                            aria-selected={selectedModel === model.id}
                                        >
                                            <div className={styles.modelItemInner}>
                                                <span className={`material-icons-round ${styles.modelItemIcon}`}>
                                                    {model.icon}
                                                </span>
                                                <span className={styles.modelItemName}>{model.name}</span>
                                                <span className={styles.modelItemDesc}>{model.description}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* File attachment */}
                        <div className={styles.attachPickerWrapper} ref={attachPickerRef}>
                            <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={handleFileAttach}
                                aria-label="Attach file"
                                title="Attach file"
                                disabled={isAttaching}
                            >
                                <span className="material-icons-round">
                                    {isAttaching ? "hourglass_top" : "add"}
                                </span>
                            </button>
                            {showAttachPicker && (
                                <div className={styles.attachPicker}>
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
                                            <div className={styles.attachPickerLabel}>From project studies</div>
                                            {projectFiles.slice(0, 10).map((file) => (
                                                <button
                                                    key={file.id}
                                                    type="button"
                                                    className={styles.attachPickerItem}
                                                    onClick={() => handleAttachExisting(file.id)}
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: 16 }}>description</span>
                                                    <span className={styles.attachPickerFileName}>
                                                        {file.filename}
                                                    </span>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                    {loadingProjectFiles && (
                                        <div className={styles.attachPickerLoading}>Loading...</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Voice input */}
                        <button
                            type="button"
                            className={`${styles.actionBtn} ${voiceState === "recording" ? styles.actionBtnRecording : ""}`}
                            onClick={toggleRecording}
                            disabled={voiceState === "transcribing" || isLoading}
                            aria-label={voiceState === "recording" ? "Stop recording" : voiceState === "transcribing" ? "Transcribing..." : "Voice input"}
                            title={voiceState === "recording" ? "Stop recording" : voiceState === "transcribing" ? "Transcribing..." : "Voice input"}
                        >
                            <span className="material-icons-round">
                                {voiceState === "recording" ? "stop_circle" : voiceState === "transcribing" ? "hourglass_top" : "mic"}
                            </span>
                        </button>
                    </div>

                    {/* Send button */}
                    <button
                        type="submit"
                        className={`${styles.sendBtn} ${(input.trim() || pendingAttachment) ? styles.sendBtnActive : ""}`}
                        aria-label="Send"
                        disabled={isLoading || (!input.trim() && !pendingAttachment)}
                    >
                        <span className="material-icons-round">
                            {isLoading ? "more_horiz" : "arrow_upward"}
                        </span>
                    </button>
                </div>

                {voiceError && (
                    <div className={styles.voiceError}>
                        <span>{voiceError}</span>
                        <button type="button" onClick={clearVoiceError} aria-label="Dismiss">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                )}
            </form>
        </>
    );
}
