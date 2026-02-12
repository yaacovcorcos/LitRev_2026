/**
 * CopilotInput
 * Extracted input area: textarea, model selector, attachments, voice, send button
 * Now with agent mode indicator pill (planC Phase 4.1)
 */

"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
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
    studyId?: string;
    inputPlaceholder: string;
    prefill?: string;
    onPrefillConsumed?: () => void;
};

export function CopilotInput({ page, section, studyId, inputPlaceholder, prefill, onPrefillConsumed }: CopilotInputProps) {
    const {
        isLoading,
        sendMessage,
        cancelStream,
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
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const sendLockRef = useRef(false);

    // Agent mode state (Phase 4.1)
    const [currentMode, setCurrentMode] = useState<AgentMode>("general");
    const [modeOverride, setModeOverride] = useState<AgentMode | null>(null);

    const effectiveMode = modeOverride || currentMode;
    const modeMeta = AGENT_MODE_META[effectiveMode];

    // Debounced mode computation from input text
    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentMode(routeToAgent(input, page as RouterPage));
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
    const { state: voiceState, error: voiceError, toggleRecording, clearError: clearVoiceError } = useVoiceInput(handleTranscription);

    // Persist model preference
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem("litrev_copilot_model", selectedModel);
        }
    }, [selectedModel]);

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

    const handleSend = useCallback(() => {
        if (sendLockRef.current) return;
        const text = input.trim();
        if (!text && !pendingAttachment) return;
        sendLockRef.current = true;
        sendMessage(text, page, section, selectedModel, effectiveMode, studyId);
        setInput("");
        setModeOverride(null);
    }, [input, page, section, studyId, sendMessage, selectedModel, pendingAttachment, effectiveMode]);

    const handleStop = useCallback(() => cancelStream(), [cancelStream]);

    const handleUploadNew = useCallback(() => {
        setShowAttachPicker(false);
        requestAnimationFrame(() => fileInputRef.current?.click());
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
                    <div className={styles.modePill}>
                        <span className={`material-icons-round ${styles.modePillIcon}`}>
                            {modeMeta.icon}
                        </span>
                        <span className={styles.modePillLabel}>
                            {modeMeta.label}
                            {modeOverride && " (manual)"}
                        </span>
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
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    type="button"
                                    className={styles.modelBtn}
                                >
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

                        {/* Autonomy preset selector */}
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
                                        onValueChange={(v) => updateAutonomyPreset(v as AutonomyPreset)}
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
                                        onSelect={() => setShowAutonomySettings(true)}
                                    >
                                        <span className={`material-icons-round ${styles.presetItemIcon}`}>tune</span>
                                        <span className={styles.presetItemName}>Customize...</span>
                                        <span className={styles.presetItemDesc}>Per-tool settings</span>
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>

                        {/* File attachment */}
                        <Popover.Root
                            open={showAttachPicker}
                            onOpenChange={(open) => {
                                if (open && projectFiles.length === 0 && !loadingProjectFiles) {
                                    setLoadingProjectFiles(true);
                                    listProjectFilesAction(projectId)
                                        .then((files) => {
                                            const pdfs = files.filter((f) => f.format === "pdf" || f.mimeType.includes("pdf"));
                                            setProjectFiles(pdfs);
                                        })
                                        .catch(console.error)
                                        .finally(() => setLoadingProjectFiles(false));
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

                        {/* Voice input */}
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
                    </div>

                    {/* Send / Stop button */}
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
