/**
 * CopilotInputCore
 * Reusable input shell for copilot-like chat surfaces.
 * It is context-agnostic and receives all behavior via props.
 */

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { CopilotPage, ChoiceOption, UserInputRequest } from "@/types/ai";
import type { ContextCaptureHistoryEntry, ContextCaptureTarget } from "@/types/context-capture";
import { USER_SELECTABLE_MODELS, type SelectableModelId } from "@/lib/ai/config";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { routeToAgent, type RouterPage } from "@/lib/agent/router";
import { getUserSelectableAgentModes } from "@/lib/agent/feature-flags";
import { recordContextCaptureMetric } from "@/lib/context-capture/telemetry";
import { AGENT_MODE_META, type AgentMode, type AutonomyPreset } from "@/types/agent";
import type { RetryModelExpectation } from "@/types/chat-unification";
import { getContextTargetKey } from "@/lib/context-capture/targets";
import { UserInputCard } from "../artifacts/UserInputCard";
import styles from "./CopilotInput.module.css";

const CopilotAttachmentButton = dynamic(() =>
    import("./CopilotAttachmentButton").then((module) => module.CopilotAttachmentButton)
);
const CopilotAutonomyPresetButton = dynamic(() =>
    import("./CopilotAutonomyPresetButton").then((module) => module.CopilotAutonomyPresetButton)
);

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
    prefillCommand?: { text: string; id: string } | null;
    onPrefillConsumed?: () => void;

    isLoading: boolean;
    sendMessage: (
        text: string,
        page: CopilotPage,
        section?: string,
        model?: string,
        agentMode?: AgentMode,
        studyId?: string,
        retryModelExpectation?: RetryModelExpectation,
        contextTargets?: ContextCaptureTarget[],
    ) => void | Promise<void>;
    cancelStream: () => void;

    pendingAttachment?: InputAttachment | null;
    isAttaching?: boolean;
    attachFile?: (file: File) => void | Promise<void>;
    attachExistingFile?: (fileAssetId: string) => void | Promise<void>;
    clearAttachment?: () => void;
    projectId?: string;
    attachedContextTargets?: ContextCaptureTarget[];
    recentContextHistory?: ContextCaptureHistoryEntry[];
    removeAttachedContextTarget?: (targetKey: string) => void;
    clearAttachedContextTargets?: () => void;
    addAttachedContextTargets?: (targets: ContextCaptureTarget[]) => void;
    hasProtocol?: boolean;

    autonomyPreset?: AutonomyPreset;
    updateAutonomyPreset?: (preset: AutonomyPreset) => void | Promise<void>;
    setShowAutonomySettings?: (show: boolean) => void;

    pendingChoices?: ChoiceOption[];
    clearChoices?: () => void;

    /** Selected model ID (controlled externally via context) */
    selectedModel?: SelectableModelId;
    /** Callback when user changes the model */
    onModelChange?: (modelId: SelectableModelId) => void;
    /** @deprecated Use selectedModel/onModelChange instead. Only used for fallback local state. */
    modelStorageKey?: string;
    showAutonomyPreset?: boolean;
    showAttachments?: boolean;
    showVoice?: boolean;

    onCompress?: () => void | Promise<void>;
    canCompress?: boolean;
    isCompressing?: boolean;

    /** Active ask_user question to render as overlay above the input */
    pendingUserInput?: UserInputRequest | null;
    /** Callback when user answers the pending ask_user question */
    onAnswerUserInput?: (callId: string, answer: string, page?: CopilotPage, section?: string) => void;
    /** Render ask_user inside the input shell (disabled by default to avoid duplicate UI with timeline cards). */
    showUserInputOverlay?: boolean;
    onReady?: () => void;
};

export function CopilotInputCore({
    page,
    section,
    studyId,
    inputPlaceholder,
    prefillCommand,
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
    attachedContextTargets = [],
    recentContextHistory = [],
    removeAttachedContextTarget,
    clearAttachedContextTargets,
    addAttachedContextTargets,
    hasProtocol,
    autonomyPreset,
    updateAutonomyPreset,
    setShowAutonomySettings,
    pendingChoices = [],
    clearChoices,
    selectedModel: selectedModelProp,
    onModelChange,
    modelStorageKey = "litrev_copilot_model",
    showAutonomyPreset,
    showAttachments,
    showVoice = true,
    onCompress,
    canCompress = false,
    isCompressing = false,
    pendingUserInput = null,
    onAnswerUserInput,
    showUserInputOverlay = false,
    onReady,
}: CopilotInputCoreProps) {
    const [hasMounted, setHasMounted] = useState(false);
    const [input, setInput] = useState("");
    const [uncontrolledSelectedModel, setUncontrolledSelectedModel] = useState<SelectableModelId>("gpt-5.2");
    const [answeredUserInput, setAnsweredUserInput] = useState<{
        request: UserInputRequest;
        answer: string;
    } | null>(null);

    // Radix generates runtime IDs; defer Radix-driven controls until after mount
    // so server markup always matches the first client render.
    useEffect(() => {
        setHasMounted(true);
    }, []);

    useEffect(() => {
        if (!hasMounted) return;
        if (!textareaRef.current) return;
        onReady?.();
    }, [hasMounted, onReady]);

    const selectedModel = selectedModelProp ?? uncontrolledSelectedModel;
    const isModelControlled = typeof selectedModelProp !== "undefined";

    // Sync model selection from localStorage after hydration for uncontrolled mode only
    useEffect(() => {
        if (isModelControlled) return;
        const stored = window.localStorage.getItem(modelStorageKey);
        const valid = USER_SELECTABLE_MODELS.some((m) => m.id === stored);
        if (valid && stored !== selectedModel) {
            setUncontrolledSelectedModel(stored as SelectableModelId);
        }
    }, [isModelControlled, modelStorageKey, selectedModel]);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const sendLockRef = useRef(false);

    // Agent mode state
    const [currentMode, setCurrentMode] = useState<AgentMode>("general");
    const [modeOverride, setModeOverride] = useState<AgentMode | null>(null);

    const effectiveMode = modeOverride || currentMode;
    const modeMeta = AGENT_MODE_META[effectiveMode];

    const PROTOCOL_SWITCH_INTENT_RE = /\b(?:switch|move|go|start|enter)\b[\w\s]{0,24}\bprotocol\b|\bprotocol mode\b|\bupdate protocol\b/i;

    // Debounced mode computation from input text
    useEffect(() => {
        const timer = setTimeout(() => {
            const trimmed = input.trim();
            // Keep the last inferred mode when input is empty; avoids noisy
            // reset-to-general and keeps scoping stable across turns.
            if (!trimmed) return;

            const routerPage: RouterPage = page === "ai" ? "overview" : (page as RouterPage);
            const nextMode = routeToAgent(trimmed, routerPage, { hasProtocol });

            // Transition policy for scoping: don't silently jump into protocol
            // from protocol-like phrasing; require explicit transition wording.
            if (
                currentMode === "scoping" &&
                nextMode === "protocol" &&
                !PROTOCOL_SWITCH_INTENT_RE.test(trimmed)
            ) {
                setCurrentMode("scoping");
                return;
            }

            setCurrentMode(nextMode);
        }, 200);
        return () => clearTimeout(timer);
    }, [input, page, hasProtocol, currentMode]);

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

    // Persist model preference for uncontrolled mode only
    useEffect(() => {
        if (isModelControlled) return;
        if (typeof window !== "undefined") {
            window.localStorage.setItem(modelStorageKey, selectedModel);
        }
    }, [isModelControlled, selectedModel, modelStorageKey]);

    const setSelectedModel = useCallback((modelId: SelectableModelId) => {
        onModelChange?.(modelId);
        if (!isModelControlled) {
            setUncontrolledSelectedModel(modelId);
        }
    }, [isModelControlled, onModelChange]);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }, [input]);

    // Drop stale answered snapshots when a different ask_user request arrives.
    useEffect(() => {
        if (!pendingUserInput) return;
        if (!answeredUserInput) return;
        if (pendingUserInput.callId !== answeredUserInput.request.callId) {
            setAnsweredUserInput(null);
        }
    }, [pendingUserInput, answeredUserInput]);

    // Keep the answered state visible briefly for confirmation, then clear.
    const ANSWER_CONFIRMATION_MS = 1200;
    useEffect(() => {
        if (!answeredUserInput) return;
        const timeout = window.setTimeout(() => {
            setAnsweredUserInput(null);
        }, ANSWER_CONFIRMATION_MS);
        return () => window.clearTimeout(timeout);
    }, [answeredUserInput]);

    // Consume prefill command from parent (suggestion chips).
    // Triggers on command ID change, so clicking the same suggestion twice always works.
    // Guarded by sendLockRef to prevent a double-send when a chip click and
    // the prefill effect race within the same React batching cycle.
    useEffect(() => {
        if (!prefillCommand) return;
        if (sendLockRef.current) return;
        setInput(prefillCommand.text);
        onPrefillConsumed?.();
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (el) {
                el.focus();
                el.selectionStart = el.selectionEnd = el.value.length;
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger on command ID, not text
    }, [prefillCommand?.id]);

    // Prevent double-sends within the same event loop before isLoading flips true.
    useEffect(() => {
        if (!isLoading) sendLockRef.current = false;
    }, [isLoading]);

    const canShowAutonomy =
        (showAutonomyPreset ?? true) && !!autonomyPreset && !!updateAutonomyPreset && !!setShowAutonomySettings;

    const canShowAttachments =
        (showAttachments ?? true) && !!projectId && !!attachFile && !!attachExistingFile && !!clearAttachment;

    const handleSend = useCallback(() => {
        if (sendLockRef.current) return;
        const text = input.trim();
        if (!text && !pendingAttachment) return;
        sendLockRef.current = true;
        const nextContextTargets = attachedContextTargets.length > 0 ? attachedContextTargets : undefined;
        sendMessage(text, page, section, selectedModel, effectiveMode, studyId, undefined, nextContextTargets);
        if (nextContextTargets?.length) {
            clearAttachedContextTargets?.();
        }
        setInput("");
        setModeOverride(null);
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, [
        input,
        page,
        section,
        studyId,
        sendMessage,
        selectedModel,
        pendingAttachment,
        effectiveMode,
        attachedContextTargets,
        clearAttachedContextTargets,
    ]);

    const handleStop = useCallback(() => {
        if (voiceState === "recording" || voiceState === "transcribing") {
            stopRecording();
        }
        cancelStream();
    }, [cancelStream, voiceState, stopRecording]);

    useEffect(() => {
        if (!isLoading && voiceState !== "recording" && voiceState !== "transcribing") return;
        const onWindowKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            if (event.key !== "Escape") return;
            event.preventDefault();
            handleStop();
        };
        window.addEventListener("keydown", onWindowKeyDown);
        return () => window.removeEventListener("keydown", onWindowKeyDown);
    }, [handleStop, isLoading, voiceState]);

    const selectedModelInfo = USER_SELECTABLE_MODELS.find((m) => m.id === selectedModel);
    const ALL_MODES: AgentMode[] = getUserSelectableAgentModes();

    return (
        <>
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
                                className={`${styles.modePillChevron} ${styles.mountPlaceholder}`}
                                aria-hidden="true"
                                tabIndex={-1}
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

                {attachedContextTargets.length > 0 && (
                    <div className={styles.contextReceipts} role="group" aria-label="Attached context">
                        {attachedContextTargets.map((target) => {
                            const targetKey = getContextTargetKey(target);
                            return (
                                <div key={targetKey} className={styles.contextReceipt}>
                                    <span className={`material-icons-round ${styles.contextReceiptIcon}`}>{target.icon}</span>
                                    <span className={styles.contextReceiptLabel}>{target.label}</span>
                                    {target.preview ? (
                                        <span className={styles.contextReceiptPreview}>{target.preview}</span>
                                    ) : null}
                                    <button
                                        type="button"
                                        className={styles.contextReceiptRemove}
                                        onClick={() => {
                                            removeAttachedContextTarget?.(targetKey);
                                            recordContextCaptureMetric({
                                                type: "context_capture_removed",
                                                projectId: target.projectId,
                                                payload: {
                                                    surface: target.sourceSurface ?? page,
                                                    targetKinds: [target.kind],
                                                    actionId: null,
                                                    launchMode: "prefill",
                                                },
                                            });
                                        }}
                                        aria-label={`Remove ${target.label}`}
                                    >
                                        <span className="material-icons-round">close</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {recentContextHistory.length > 0 && attachedContextTargets.length === 0 && !isLoading && (
                    <div className={styles.contextHistory} role="group" aria-label="Recent context">
                        {recentContextHistory.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                className={styles.contextHistoryChip}
                                onClick={() => {
                                    addAttachedContextTargets?.([entry.target]);
                                    recordContextCaptureMetric({
                                        type: "context_capture_reused",
                                        projectId: entry.target.projectId,
                                        payload: {
                                            surface: entry.target.sourceSurface ?? page,
                                            targetKinds: [entry.target.kind],
                                            actionId: null,
                                            launchMode: "prefill",
                                        },
                                    });
                                }}
                            >
                                <span className="material-icons-round">{entry.target.icon}</span>
                                <span>{entry.target.label}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Structured ask_user overlay — appears above choices */}
                {showUserInputOverlay && (() => {
                    const activeRequest = pendingUserInput ?? answeredUserInput?.request;
                    if (!activeRequest || isLoading) return null;
                    const isAnswered = !pendingUserInput && !!answeredUserInput;
                    return (
                    <div className={styles.userInputOverlay}>
                        <UserInputCard
                            question={activeRequest.question}
                            questionType={activeRequest.questionType}
                            options={activeRequest.options}
                            header={activeRequest.header}
                            context={activeRequest.context}
                            answered={isAnswered}
                            answer={isAnswered ? answeredUserInput?.answer : undefined}
                            onAnswer={(answer) => {
                                setAnsweredUserInput({ request: activeRequest, answer });
                                onAnswerUserInput?.(activeRequest.callId, answer, page, section);
                            }}
                            onDismiss={() => {
                                const dismissAnswer = "Dismissed — please proceed without my input.";
                                setAnsweredUserInput({ request: activeRequest, answer: dismissAnswer });
                                onAnswerUserInput?.(activeRequest.callId, dismissAnswer, page, section);
                            }}
                        />
                    </div>
                    );
                })()}
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
                        if (e.key === "Escape" && (isLoading || voiceState === "recording" || voiceState === "transcribing")) {
                            e.preventDefault();
                            e.stopPropagation();
                            handleStop();
                            return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
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
                            <button
                                type="button"
                                className={`${styles.modelBtn} ${styles.mountPlaceholder}`}
                                aria-hidden="true"
                                tabIndex={-1}
                            >
                                {selectedModelInfo?.name || "GPT-5.2"}
                                <span className="material-icons-round">expand_more</span>
                            </button>
                        )}

                        {showVoice && (
                            <>
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

                        {canShowAutonomy && (hasMounted ? (
                            <CopilotAutonomyPresetButton
                                autonomyPreset={autonomyPreset}
                                onUpdateAutonomyPreset={updateAutonomyPreset!}
                                onOpenAutonomySettings={() => setShowAutonomySettings?.(true)}
                            />
                        ) : (
                            <button
                                type="button"
                                className={`${styles.presetBtn} ${styles.mountPlaceholder}`}
                                aria-hidden="true"
                                tabIndex={-1}
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
                            <CopilotAttachmentButton
                                projectId={projectId!}
                                studyId={studyId}
                                isAttaching={isAttaching}
                                onAttachFile={attachFile!}
                                onAttachExistingFile={attachExistingFile!}
                            />
                        ) : (
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
                        ))}

                        {onCompress && (
                            <button
                                type="button"
                                className={styles.compressBtn}
                                onClick={() => { void onCompress(); }}
                                disabled={!canCompress || isCompressing}
                                aria-label="Compress history"
                                title={canCompress ? "Compress" : "Compress (available after longer chats)"}
                            >
                                <span className="material-icons-round">
                                    {isCompressing ? "hourglass_top" : "compress"}
                                </span>
                            </button>
                        )}
                    </div>

                    {isLoading ? (
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
