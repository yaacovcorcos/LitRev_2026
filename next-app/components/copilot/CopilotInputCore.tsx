/**
 * CopilotInputCore
 * Reusable input shell for copilot-like chat surfaces.
 * It is context-agnostic and receives all behavior via props.
 */

"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import type { CopilotPage, ChoiceOption } from "@/types/ai";
import { USER_SELECTABLE_MODELS, type SelectableModelId } from "@/lib/ai/config";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { listProjectFilesAction } from "@/app/actions/files";
import { routeToAgent, type RouterPage } from "@/lib/agent/router";
import { AGENT_MODE_META, type AgentMode, type AutonomyPreset } from "@/types/agent";
import type { FileAsset } from "@/types/files";
import styles from "../ProjectCopilot.module.css";

export type InputAttachment = {
    fileAssetId: string;
    filename: string;
    size: number;
    mimeType: string;
    extractedText: string;
    isExisting: boolean;
};

export type CopilotInputCoreProps = {
    page: CopilotPage;
    section?: string;
    studyId?: string;
    inputPlaceholder: string;
    prefill?: string;
    onPrefillConsumed?: () => void;

    isLoading: boolean;
    sendMessage: (
        text: string,
        page: CopilotPage,
        section?: string,
        model?: string,
        agentMode?: AgentMode,
        studyId?: string
    ) => void | Promise<void>;
    cancelStream: () => void;

    pendingAttachment?: InputAttachment | null;
    isAttaching?: boolean;
    attachFile?: (file: File) => void | Promise<void>;
    attachExistingFile?: (fileAssetId: string) => void | Promise<void>;
    clearAttachment?: () => void;
    projectId?: string;

    autonomyPreset?: AutonomyPreset;
    updateAutonomyPreset?: (preset: AutonomyPreset) => void | Promise<void>;
    setShowAutonomySettings?: (show: boolean) => void;

    pendingChoices?: ChoiceOption[];
    clearChoices?: () => void;

    modelStorageKey?: string;
    showAutonomyPreset?: boolean;
    showAttachments?: boolean;
    showVoice?: boolean;
};

export function CopilotInputCore({
    page,
    section,
    studyId,
    inputPlaceholder,
    prefill,
    onPrefillConsumed,
    isLoading,
    sendMessage,
    cancelStream,
    pendingAttachment = null,
    isAttaching = false,
    attachFile,
    attachExistingFile,
    clearAttachment,
    projectId,
    autonomyPreset,
    updateAutonomyPreset,
    setShowAutonomySettings,
    pendingChoices = [],
    clearChoices,
    modelStorageKey = "litrev_copilot_model",
    showAutonomyPreset,
    showAttachments,
    showVoice = true,
}: CopilotInputCoreProps) {
    const [hasMounted, setHasMounted] = useState(false);
    const [input, setInput] = useState("");
    const [selectedModel, setSelectedModel] = useState<SelectableModelId>("gpt-5.2");

    // Radix generates runtime IDs; defer Radix-driven controls until after mount
    // so server markup always matches the first client render.
    useEffect(() => {
        setHasMounted(true);
    }, []);

    // Sync model selection from localStorage after hydration
    useEffect(() => {
        const stored = window.localStorage.getItem(modelStorageKey);
        const valid = USER_SELECTABLE_MODELS.some((m) => m.id === stored);
        if (valid && stored !== selectedModel) {
            setSelectedModel(stored as SelectableModelId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const sendLockRef = useRef(false);

    // Agent mode state
    const [currentMode, setCurrentMode] = useState<AgentMode>("general");
    const [modeOverride, setModeOverride] = useState<AgentMode | null>(null);

    const effectiveMode = modeOverride || currentMode;
    const modeMeta = AGENT_MODE_META[effectiveMode];

    // Debounced mode computation from input text
    useEffect(() => {
        const timer = setTimeout(() => {
            const routerPage: RouterPage = page === "ai" ? "overview" : (page as RouterPage);
            setCurrentMode(routeToAgent(input, routerPage));
        }, 200);
        return () => clearTimeout(timer);
    }, [input, page]);

    // Voice input
    const handleTranscription = useCallback((text: string) => {
        setInput((prev) => {
            const separator = prev.trim() ? " " : "";
            return prev + separator + text;
        });
    }, []);
    const {
        state: voiceState,
        error: voiceError,
        toggleRecording,
        stopRecording,
        clearError: clearVoiceError,
    } = useVoiceInput(handleTranscription);

    // Persist model preference
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(modelStorageKey, selectedModel);
        }
    }, [selectedModel, modelStorageKey]);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }, [input]);

    // Consume prefill from parent (suggestion chips).
    // Guarded by sendLockRef to prevent a double-send when a chip click and
    // the prefill effect race within the same React batching cycle.
    useEffect(() => {
        if (!prefill) return;
        if (sendLockRef.current) return;
        setInput(prefill);
        onPrefillConsumed?.();
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

    const canShowAutonomy =
        (showAutonomyPreset ?? true) && !!autonomyPreset && !!updateAutonomyPreset && !!setShowAutonomySettings;

    const canShowAttachments =
        (showAttachments ?? true) && !!projectId && !!attachFile && !!attachExistingFile && !!clearAttachment;

    // Attachment state
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [showAttachPicker, setShowAttachPicker] = useState(false);
    const [projectFiles, setProjectFiles] = useState<FileAsset[]>([]);
    const [loadingProjectFiles, setLoadingProjectFiles] = useState(false);
    // 30-second TTL cache for the project file list so repeated popover opens are instant
    const fileListCacheRef = useRef<{ files: FileAsset[]; fetchedAt: number } | null>(null);
    const FILE_LIST_TTL_MS = 30_000;

    const handleSend = useCallback(() => {
        if (sendLockRef.current) return;
        const text = input.trim();
        if (!text && !pendingAttachment) return;
        sendLockRef.current = true;
        sendMessage(text, page, section, selectedModel, effectiveMode, studyId);
        setInput("");
        setModeOverride(null);
    }, [input, page, section, studyId, sendMessage, selectedModel, pendingAttachment, effectiveMode]);

    const handleStop = useCallback(() => {
        if (voiceState === "recording" || voiceState === "transcribing") {
            stopRecording();
        }
        cancelStream();
    }, [cancelStream, voiceState, stopRecording]);

    const handleUploadNew = useCallback(() => {
        if (!canShowAttachments) return;
        setShowAttachPicker(false);
        requestAnimationFrame(() => fileInputRef.current?.click());
    }, [canShowAttachments]);

    const handleFileSelected = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        if (!attachFile) return;
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".pdf")) return;
        attachFile(file);
        e.target.value = "";
    }, [attachFile]);

    const handleAttachExisting = useCallback((fileAssetId: string) => {
        if (!attachExistingFile) return;
        setShowAttachPicker(false);
        attachExistingFile(fileAssetId);
    }, [attachExistingFile]);

    const selectedModelInfo = USER_SELECTABLE_MODELS.find((m) => m.id === selectedModel);
    const ALL_MODES: AgentMode[] = ["general", "protocol", "search", "screening", "drafting", "qa"];

    return (
        <>
            {canShowAttachments && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    style={{ display: "none" }}
                    onChange={handleFileSelected}
                />
            )}

            <form
                className={styles.inputBox}
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                }}
            >
                {/* Mode indicator pill — shown when input has text */}
                {input.trim() && (
                    <div className={styles.modePill}>
                        <span className={`material-icons-round ${styles.modePillIcon}`}>
                            {modeMeta.icon}
                        </span>
                        <span className={styles.modePillLabel}>
                            {modeMeta.label}
                            {modeOverride && " (manual)"}
                        </span>
                        {hasMounted ? (
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <button
                                        type="button"
                                        className={styles.modePillChevron}
                                        aria-label="Change agent mode"
                                    >
                                        <span className="material-icons-round">expand_more</span>
                                    </button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                    <DropdownMenu.Content className={styles.modeDropdown} side="bottom" align="start" sideOffset={4}>
                                        {ALL_MODES.map((mode) => {
                                            const meta = AGENT_MODE_META[mode];
                                            const isActive = mode === effectiveMode;
                                            return (
                                                <DropdownMenu.Item
                                                    key={mode}
                                                    className={`${styles.modeItem} ${isActive ? styles.modeItemActive : ""}`}
                                                    onSelect={() => setModeOverride(mode === currentMode ? null : mode)}
                                                >
                                                    <span className={`material-icons-round ${styles.modeItemIcon}`}>
                                                        {meta.icon}
                                                    </span>
                                                    <span className={styles.modeItemName}>{meta.label}</span>
                                                    <span className={styles.modeItemDesc}>{meta.description}</span>
                                                </DropdownMenu.Item>
                                            );
                                        })}
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        ) : (
                            <button
                                type="button"
                                className={styles.modePillChevron}
                                aria-label="Change agent mode"
                                disabled
                            >
                                <span className="material-icons-round">expand_more</span>
                            </button>
                        )}
                    </div>
                )}

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

                {/* AI-generated choice chips */}
                <div
                    className={`${styles.choicesSlot} ${pendingChoices.length > 0 && !isLoading ? styles.choicesSlotOpen : ""}`}
                    role={pendingChoices.length > 0 ? "group" : undefined}
                    aria-label={pendingChoices.length > 0 ? "Suggested responses" : undefined}
                >
                    <div className={styles.choicesRow}>
                        {pendingChoices.map((choice) => (
                            <button
                                key={choice.value}
                                type="button"
                                className={styles.choiceChip}
                                onClick={() => {
                                    if (sendLockRef.current) return;
                                    sendLockRef.current = true;
                                    clearChoices?.();
                                    sendMessage(choice.value, page, section, selectedModel, effectiveMode, studyId);
                                    setInput("");
                                }}
                            >
                                {choice.icon && (
                                    <span className="material-icons-round" style={{ fontSize: 14 }} aria-hidden="true">
                                        {choice.icon}
                                    </span>
                                )}
                                {choice.label}
                            </button>
                        ))}
                    </div>
                </div>

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

                <div className={styles.inputBar}>
                    <div className={styles.inputBarLeft}>
                        {hasMounted ? (
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <button type="button" className={styles.modelBtn}>
                                        {selectedModelInfo?.name || "GPT-5.2"}
                                        <span className="material-icons-round">expand_more</span>
                                    </button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                    <DropdownMenu.Content className={styles.modelDropdown} side="top" align="start" sideOffset={4}>
                                        <DropdownMenu.RadioGroup
                                            value={selectedModel}
                                            onValueChange={(v) => setSelectedModel(v as SelectableModelId)}
                                        >
                                            {USER_SELECTABLE_MODELS.map((model) => (
                                                <DropdownMenu.RadioItem
                                                    key={model.id}
                                                    value={model.id}
                                                    className={`${styles.modelItem} ${selectedModel === model.id ? styles.modelItemActive : ""}`}
                                                >
                                                    <div className={styles.modelItemInner}>
                                                        <span className={`material-icons-round ${styles.modelItemIcon}`}>
                                                            {model.icon}
                                                        </span>
                                                        <span className={styles.modelItemName}>{model.name}</span>
                                                        <span className={styles.modelItemDesc}>{model.description}</span>
                                                    </div>
                                                </DropdownMenu.RadioItem>
                                            ))}
                                        </DropdownMenu.RadioGroup>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        ) : (
                            <button type="button" className={styles.modelBtn} disabled>
                                {selectedModelInfo?.name || "GPT-5.2"}
                                <span className="material-icons-round">expand_more</span>
                            </button>
                        )}

                        {canShowAutonomy && (hasMounted ? (
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <button
                                        type="button"
                                        className={styles.presetBtn}
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
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                    <DropdownMenu.Content className={styles.presetDropdown} side="top" align="start" sideOffset={4}>
                                        <DropdownMenu.RadioGroup
                                            value={autonomyPreset}
                                            onValueChange={(v) => updateAutonomyPreset?.(v as AutonomyPreset)}
                                        >
                                            {([
                                                { key: "manual" as const, icon: "back_hand", label: "Manual", desc: "Suggest only" },
                                                { key: "assisted" as const, icon: "handshake", label: "Assisted", desc: "Propose & confirm" },
                                                { key: "autonomous" as const, icon: "smart_toy", label: "Auto", desc: "Act & notify" },
                                            ]).map((preset) => (
                                                <DropdownMenu.RadioItem
                                                    key={preset.key}
                                                    value={preset.key}
                                                    className={`${styles.presetItem} ${autonomyPreset === preset.key ? styles.presetItemActive : ""}`}
                                                >
                                                    <span className={`material-icons-round ${styles.presetItemIcon}`}>
                                                        {preset.icon}
                                                    </span>
                                                    <span className={styles.presetItemName}>{preset.label}</span>
                                                    <span className={styles.presetItemDesc}>{preset.desc}</span>
                                                </DropdownMenu.RadioItem>
                                            ))}
                                        </DropdownMenu.RadioGroup>
                                        <DropdownMenu.Separator className={styles.presetDivider} />
                                        <DropdownMenu.Item
                                            className={`${styles.presetItem} ${autonomyPreset === "custom" ? styles.presetItemActive : ""}`}
                                            onSelect={() => setShowAutonomySettings?.(true)}
                                        >
                                            <span className={`material-icons-round ${styles.presetItemIcon}`}>tune</span>
                                            <span className={styles.presetItemName}>Customize...</span>
                                            <span className={styles.presetItemDesc}>Per-tool settings</span>
                                        </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        ) : (
                            <button
                                type="button"
                                className={styles.presetBtn}
                                title={`Autonomy: ${autonomyPreset}`}
                                disabled
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
                        ))}

                        {canShowAttachments && (hasMounted ? (
                            <Popover.Root
                                open={showAttachPicker}
                                onOpenChange={(open) => {
                                    if (open && projectId) {
                                        const cache = fileListCacheRef.current;
                                        const isFresh = cache && (Date.now() - cache.fetchedAt) < FILE_LIST_TTL_MS;
                                        if (isFresh) {
                                            // Cache hit — show instantly, no loading state
                                            setProjectFiles(cache.files);
                                        } else if (!loadingProjectFiles) {
                                            setLoadingProjectFiles(true);
                                            listProjectFilesAction(projectId)
                                                .then((files) => {
                                                    const pdfs = files.filter((f) => f.format === "pdf" || f.mimeType.includes("pdf"));
                                                    fileListCacheRef.current = { files: pdfs, fetchedAt: Date.now() };
                                                    setProjectFiles(pdfs);
                                                })
                                                .catch(console.error)
                                                .finally(() => setLoadingProjectFiles(false));
                                        }
                                    }
                                    setShowAttachPicker(open);
                                }}
                            >
                                <Popover.Trigger asChild>
                                    <button
                                        type="button"
                                        className={styles.actionBtn}
                                        aria-label="Attach file"
                                        title="Attach file"
                                        disabled={isAttaching}
                                    >
                                        <span className="material-icons-round">
                                            {isAttaching ? "hourglass_top" : "add"}
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
                                        {projectFiles.length > 0 && (() => {
                                            const thisStudyFiles = studyId
                                                ? projectFiles.filter((f) => f.studyId === studyId)
                                                : [];
                                            const otherFiles = studyId
                                                ? projectFiles.filter((f) => f.studyId !== studyId)
                                                : projectFiles;
                                            return (
                                                <>
                                                    <div className={styles.attachPickerDivider} />
                                                    {thisStudyFiles.length > 0 && (
                                                        <>
                                                            <div className={styles.attachPickerLabel}>This study</div>
                                                            {thisStudyFiles.map((file) => (
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
                                                                {thisStudyFiles.length > 0 ? "Other studies" : "From project studies"}
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
                                            );
                                        })()}
                                        {loadingProjectFiles && (
                                            <div className={styles.attachPickerLoading}>Loading...</div>
                                        )}
                                    </Popover.Content>
                                </Popover.Portal>
                            </Popover.Root>
                        ) : (
                            <button
                                type="button"
                                className={styles.actionBtn}
                                aria-label="Attach file"
                                title="Attach file"
                                disabled={isAttaching}
                                onClick={handleUploadNew}
                            >
                                <span className="material-icons-round">
                                    {isAttaching ? "hourglass_top" : "add"}
                                </span>
                            </button>
                        ))}

                        {showVoice && (
                            <>
                                {/* Screen-reader live region for voice state (V8 / A11y) */}
                                <span
                                    className="sr-only"
                                    aria-live="polite"
                                    aria-atomic="true"
                                >
                                    {voiceState === "recording"
                                        ? "Recording in progress"
                                        : voiceState === "transcribing"
                                        ? "Transcribing..."
                                        : ""}
                                </span>
                                <button
                                    type="button"
                                    className={`${styles.actionBtn} ${voiceState === "recording" ? styles.actionBtnRecording : ""}`}
                                    onClick={toggleRecording}
                                    disabled={voiceState === "transcribing"}
                                    aria-label={voiceState === "recording" ? "Stop recording" : voiceState === "transcribing" ? "Transcribing..." : "Voice input"}
                                    title={voiceState === "recording" ? "Stop recording" : voiceState === "transcribing" ? "Transcribing..." : "Voice input"}
                                >
                                    <span className="material-icons-round">
                                        {voiceState === "recording" ? "stop_circle" : voiceState === "transcribing" ? "hourglass_top" : "mic"}
                                    </span>
                                </button>
                            </>
                        )}
                    </div>

                    {isLoading && !input.trim() && !pendingAttachment ? (
                        <button
                            type="button"
                            className={`${styles.sendBtn} ${styles.sendBtnStop}`}
                            aria-label="Stop generating"
                            onClick={handleStop}
                        >
                            <span className="material-icons-round">stop</span>
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className={`${styles.sendBtn} ${(input.trim() || pendingAttachment) ? styles.sendBtnActive : ""}`}
                            aria-label={isLoading ? "Send and interrupt" : "Send"}
                            disabled={!input.trim() && !pendingAttachment}
                        >
                            <span className="material-icons-round">arrow_upward</span>
                        </button>
                    )}
                </div>

                {showVoice && voiceError && (
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
