/**
 * CopilotInput
 * Extracted input area: textarea, model selector, attachments, voice, send button
 * Now with agent mode indicator pill (planC Phase 4.1)
 */

"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useProjectCopilot, type CopilotPage } from "@/contexts/ProjectCopilotContext";
import { USER_SELECTABLE_MODELS, type SelectableModelId } from "@/lib/ai/config";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { listProjectFilesAction } from "@/app/actions/files";
import { routeToAgent, type RouterPage } from "@/lib/agent/router";
import { AGENT_MODE_META, type AgentMode, type AutonomyPreset } from "@/types/agent";
import type { FileAsset } from "@/types/files";
import styles from "../ProjectCopilot.module.css";

export type CopilotInputProps = {
    page: CopilotPage;
    section?: string;
    inputPlaceholder: string;
    prefill?: string;
    onPrefillConsumed?: () => void;
};

export function CopilotInput({ page, section, inputPlaceholder, prefill, onPrefillConsumed }: CopilotInputProps) {
    const {
        isLoading,
        sendMessage,
        pendingAttachment,
        isAttaching,
        attachFile,
        attachExistingFile,
        clearAttachment,
        projectId,
        autonomyPreset,
        updateAutonomyPreset,
        setShowAutonomySettings,
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
    const sendLockRef = useRef(false);

    // Agent mode state (Phase 4.1)
    const [currentMode, setCurrentMode] = useState<AgentMode>("general");
    const [modeOverride, setModeOverride] = useState<AgentMode | null>(null);
    const [showModeMenu, setShowModeMenu] = useState(false);
    const modeMenuRef = useRef<HTMLDivElement | null>(null);

    // Autonomy preset state (Phase 7.2)
    const [showPresetMenu, setShowPresetMenu] = useState(false);
    const presetMenuRef = useRef<HTMLDivElement | null>(null);

    const effectiveMode = modeOverride || currentMode;
    const modeMeta = AGENT_MODE_META[effectiveMode];

    // Debounced mode computation from input text
    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentMode(routeToAgent(input, page as RouterPage));
        }, 200);
        return () => clearTimeout(timer);
    }, [input, page]);

    // Close mode menu on click outside
    useEffect(() => {
        if (!showModeMenu) return;
        const handleClick = (e: MouseEvent) => {
            if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
                setShowModeMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showModeMenu]);

    // Close preset menu on click outside
    useEffect(() => {
        if (!showPresetMenu) return;
        const handleClick = (e: MouseEvent) => {
            if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
                setShowPresetMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showPresetMenu]);

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

    // Consume prefill from parent (suggestion chips)
    useEffect(() => {
        if (!prefill) return;
        setInput(prefill);
        onPrefillConsumed?.();
        // Focus textarea and move cursor to end
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (el) {
                el.focus();
                el.selectionStart = el.selectionEnd = el.value.length;
            }
        });
    }, [prefill, onPrefillConsumed]);

    // Prevent double-sends within the same event loop before isLoading flips true.
    useEffect(() => {
        if (!isLoading) sendLockRef.current = false;
    }, [isLoading]);

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
        // Allow composing while the model is responding, but keep sends serialized.
        if (isLoading || sendLockRef.current) return;
        const text = input.trim();
        if (!text && !pendingAttachment) return;
        sendLockRef.current = true;
        sendMessage(text, page, section, selectedModel, effectiveMode);
        setInput("");
        setModeOverride(null);
    }, [input, isLoading, page, section, sendMessage, selectedModel, pendingAttachment, effectiveMode]);

    const handleFileAttach = useCallback(() => {
        const shouldFetch = !showAttachPicker && projectFiles.length === 0 && !loadingProjectFiles;
        setShowAttachPicker((prev) => !prev);
        if (shouldFetch) {
            setLoadingProjectFiles(true);
            listProjectFilesAction(projectId)
                .then((files) => {
                    const pdfs = files.filter((f) => f.format === "pdf" || f.mimeType.includes("pdf"));
                    setProjectFiles(pdfs);
                })
                .catch(console.error)
                .finally(() => setLoadingProjectFiles(false));
        }
    }, [projectId, showAttachPicker, projectFiles.length, loadingProjectFiles]);

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

    const ALL_MODES: AgentMode[] = ["general", "protocol", "search", "screening", "drafting", "qa"];

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
                {/* Mode indicator pill — shown when input has text */}
                {input.trim() && (
                    <div className={styles.modePill} ref={modeMenuRef}>
                        <span className={`material-icons-round ${styles.modePillIcon}`}>
                            {modeMeta.icon}
                        </span>
                        <span className={styles.modePillLabel}>
                            {modeMeta.label}
                            {modeOverride && " (manual)"}
                        </span>
                        <button
                            type="button"
                            className={styles.modePillChevron}
                            onClick={() => setShowModeMenu(!showModeMenu)}
                            aria-haspopup="listbox"
                            aria-expanded={showModeMenu}
                            aria-label="Change agent mode"
                        >
                            <span className="material-icons-round">expand_more</span>
                        </button>
                        {showModeMenu && (
                            <div className={styles.modeDropdown} role="listbox">
                                {ALL_MODES.map((mode) => {
                                    const meta = AGENT_MODE_META[mode];
                                    const isActive = mode === effectiveMode;
                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            className={`${styles.modeItem} ${isActive ? styles.modeItemActive : ""}`}
                                            role="option"
                                            aria-selected={isActive}
                                            onClick={() => {
                                                setModeOverride(mode === currentMode ? null : mode);
                                                setShowModeMenu(false);
                                            }}
                                        >
                                            <span className={`material-icons-round ${styles.modeItemIcon}`}>
                                                {meta.icon}
                                            </span>
                                            <span className={styles.modeItemName}>{meta.label}</span>
                                            <span className={styles.modeItemDesc}>{meta.description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

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
                    placeholder={isLoading ? "Keep typing..." : inputPlaceholder}
                    aria-label="Copilot prompt"
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

                        {/* Autonomy preset selector */}
                        <div className={styles.presetSelector} ref={presetMenuRef}>
                            <button
                                type="button"
                                className={styles.presetBtn}
                                onClick={() => setShowPresetMenu(!showPresetMenu)}
                                aria-haspopup="listbox"
                                aria-expanded={showPresetMenu}
                                title={`Autonomy: ${autonomyPreset}`}
                            >
                                <span className="material-icons-round" style={{ fontSize: 14 }}>
                                    {autonomyPreset === "manual" ? "back_hand"
                                        : autonomyPreset === "autonomous" ? "smart_toy"
                                        : autonomyPreset === "custom" ? "tune"
                                        : "handshake"}
                                </span>
                                <span>
                                    {autonomyPreset === "manual" ? "Manual"
                                        : autonomyPreset === "autonomous" ? "Auto"
                                        : autonomyPreset === "custom" ? "Custom"
                                        : "Assisted"}
                                </span>
                                <span className="material-icons-round" style={{ fontSize: 14 }}>expand_more</span>
                            </button>
                            {showPresetMenu && (
                                <div className={styles.presetDropdown} role="listbox">
                                    {([
                                        { key: "manual" as const, icon: "back_hand", label: "Manual", desc: "Suggest only" },
                                        { key: "assisted" as const, icon: "handshake", label: "Assisted", desc: "Propose & confirm" },
                                        { key: "autonomous" as const, icon: "smart_toy", label: "Auto", desc: "Act & notify" },
                                    ]).map((preset) => (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            className={`${styles.presetItem} ${autonomyPreset === preset.key ? styles.presetItemActive : ""}`}
                                            role="option"
                                            aria-selected={autonomyPreset === preset.key}
                                            onClick={() => {
                                                updateAutonomyPreset(preset.key);
                                                setShowPresetMenu(false);
                                            }}
                                        >
                                            <span className={`material-icons-round ${styles.presetItemIcon}`}>
                                                {preset.icon}
                                            </span>
                                            <span className={styles.presetItemName}>{preset.label}</span>
                                            <span className={styles.presetItemDesc}>{preset.desc}</span>
                                        </button>
                                    ))}
                                    <div className={styles.presetDivider} />
                                    <button
                                        type="button"
                                        className={`${styles.presetItem} ${autonomyPreset === "custom" ? styles.presetItemActive : ""}`}
                                        onClick={() => {
                                            setShowPresetMenu(false);
                                            setShowAutonomySettings(true);
                                        }}
                                    >
                                        <span className={`material-icons-round ${styles.presetItemIcon}`}>tune</span>
                                        <span className={styles.presetItemName}>Customize...</span>
                                        <span className={styles.presetItemDesc}>Per-tool settings</span>
                                    </button>
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
