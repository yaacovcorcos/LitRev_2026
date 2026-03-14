/**
 * CopilotInputCore
 * Reusable input shell for copilot-like chat surfaces.
 * It is context-agnostic and receives all behavior via props.
 */

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent } from "react";
import type { CopilotPage, ChoiceOption, UserInputRequest } from "@/types/ai";
import type { ContextCaptureHistoryEntry, ContextCaptureTarget } from "@/types/context-capture";
import { USER_SELECTABLE_MODELS, type SelectableModelId } from "@/lib/ai/config";
import { useVoiceInput, type VoiceTranscriptionSettlement } from "@/hooks/useVoiceInput";
import { getUserSelectableAgentModes } from "@/lib/agent/feature-flags";
import {
    AUTO_COMPOSER_MODE_SELECTION,
    isManualComposerModeSelection,
    resolveComposerAutoMode,
    resolveComposerMode,
    type ComposerModeSelection,
} from "@/lib/agent/composer-mode-selection";
import type { RouterPage } from "@/lib/agent/router";
import { recordContextCaptureMetric } from "@/lib/context-capture/telemetry";
import { AGENT_MODE_META, type AgentMode, type AutonomyPreset } from "@/types/agent";
import type { RetryModelExpectation } from "@/types/chat-unification";
import { getContextTargetKey } from "@/lib/context-capture/targets";
import { UserInputCard } from "../artifacts/UserInputCard";
import styles from "./CopilotInput.module.css";
import { VoiceLevelVisualizer } from "./VoiceLevelVisualizer";

const CopilotActionsMenuButton = dynamic(() =>
    import("./CopilotActionsMenuButton").then((module) => module.CopilotActionsMenuButton)
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
    hasQueuedFollowUp?: boolean;
    attachedStack?: "none" | "attached";
    onQueueFollowUp?: (payload: {
        text: string;
        page: CopilotPage;
        section?: string;
        studyId?: string;
        model?: SelectableModelId;
        agentMode?: AgentMode;
    }) => void | Promise<void>;

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

function formatElapsedVoiceTime(elapsedMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

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
    hasQueuedFollowUp = false,
    attachedStack = "none",
    onQueueFollowUp,
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
    const inputBoxRef = useRef<HTMLFormElement | null>(null);
    const [hasMounted, setHasMounted] = useState(false);
    const [input, setInput] = useState("");
    const [uncontrolledSelectedModel, setUncontrolledSelectedModel] = useState<SelectableModelId>("gpt-5.2");
    const [answeredUserInput, setAnsweredUserInput] = useState<{
        request: UserInputRequest;
        answer: string;
    } | null>(null);

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
    const latestInputRef = useRef("");
    const latestPendingAttachmentRef = useRef<InputAttachment | null>(pendingAttachment);
    const latestAttachedContextTargetsRef = useRef<ContextCaptureTarget[]>(attachedContextTargets);
    const latestSendContextRef = useRef<{
        page: CopilotPage;
        section?: string;
        studyId?: string;
        selectedModel: SelectableModelId;
        selection: ComposerModeSelection;
        autoMode: AgentMode;
        hasProtocol?: boolean;
    }>({
        page,
        section,
        studyId,
        selectedModel,
        selection: AUTO_COMPOSER_MODE_SELECTION,
        autoMode: "general",
        hasProtocol,
    });
    const queuedVoiceSendRef = useRef(false);

    const [autoMode, setAutoMode] = useState<AgentMode>("general");
    const [modeSelection, setModeSelection] = useState<ComposerModeSelection>(AUTO_COMPOSER_MODE_SELECTION);
    const [queuedVoiceSend, setQueuedVoiceSend] = useState(false);
    const [recordingHint, setRecordingHint] = useState<{ label: string; x: number } | null>(null);

    const effectiveMode = isManualComposerModeSelection(modeSelection) ? modeSelection.mode : autoMode;
    const modeMeta = AGENT_MODE_META[effectiveMode];
    const resolveCurrentComposerMode = useCallback((message: string) => {
        const routerPage: RouterPage = page === "ai" ? "overview" : (page as RouterPage);
        return resolveComposerMode({
            selection: modeSelection,
            message,
            page: routerPage,
            hasProtocol,
            previousAutoMode: autoMode,
        });
    }, [autoMode, hasProtocol, modeSelection, page]);

    const setQueuedVoiceSendState = useCallback((next: boolean) => {
        queuedVoiceSendRef.current = next;
        setQueuedVoiceSend(next);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            const routerPage: RouterPage = page === "ai" ? "overview" : (page as RouterPage);
            setAutoMode((previousAutoMode) => resolveComposerAutoMode({
                message: input,
                page: routerPage,
                hasProtocol,
                previousAutoMode,
            }));
        }, 200);
        return () => clearTimeout(timer);
    }, [input, page, hasProtocol]);

    useEffect(() => {
        latestInputRef.current = input;
    }, [input]);

    useEffect(() => {
        latestPendingAttachmentRef.current = pendingAttachment;
    }, [pendingAttachment]);

    useEffect(() => {
        latestAttachedContextTargetsRef.current = attachedContextTargets;
    }, [attachedContextTargets]);

    useEffect(() => {
        latestSendContextRef.current = {
            page,
            section,
            studyId,
            selectedModel,
            selection: modeSelection,
            autoMode,
            hasProtocol,
        };
    }, [autoMode, hasProtocol, modeSelection, page, section, selectedModel, studyId]);

    const dispatchSend = useCallback((rawText: string) => {
        if (sendLockRef.current) return false;
        const text = rawText.trim();
        const activeAttachment = latestPendingAttachmentRef.current;
        if (!text && !activeAttachment) return false;

        const {
            page: currentPage,
            section: currentSection,
            studyId: currentStudyId,
            selectedModel: currentSelectedModel,
            selection: currentSelection,
            autoMode: currentAutoMode,
            hasProtocol: currentHasProtocol,
        } = latestSendContextRef.current;
        const nextContextTargets = latestAttachedContextTargetsRef.current.length > 0
            ? latestAttachedContextTargetsRef.current
            : undefined;
        const routerPage: RouterPage = currentPage === "ai" ? "overview" : (currentPage as RouterPage);
        const currentEffectiveMode = resolveComposerMode({
            selection: currentSelection,
            message: text,
            page: routerPage,
            hasProtocol: currentHasProtocol,
            previousAutoMode: currentAutoMode,
        });

        sendLockRef.current = true;
        sendMessage(
            text,
            currentPage,
            currentSection,
            currentSelectedModel,
            currentEffectiveMode,
            currentStudyId,
            undefined,
            nextContextTargets,
        );
        if (nextContextTargets?.length) {
            clearAttachedContextTargets?.();
        }
        setInput("");
        requestAnimationFrame(() => textareaRef.current?.focus());
        return true;
    }, [clearAttachedContextTargets, sendMessage]);

    const handleTranscription = useCallback((text: string) => {
        const currentInput = latestInputRef.current;
        const separator = currentInput.trim() ? " " : "";
        const nextText = currentInput + separator + text;

        if (queuedVoiceSendRef.current) {
            const didSend = dispatchSend(nextText);
            setQueuedVoiceSendState(false);
            if (!didSend) {
                setInput(nextText);
            }
            return;
        }

        setInput(nextText);
    }, [dispatchSend, setQueuedVoiceSendState]);

    const handleTranscriptionSettled = useCallback((result: VoiceTranscriptionSettlement) => {
        if (!queuedVoiceSendRef.current) return;

        if (result.status === "success") {
            if (result.text) {
                return;
            }

            const didSend = dispatchSend(latestInputRef.current);
            setQueuedVoiceSendState(false);
            if (!didSend) {
                requestAnimationFrame(() => textareaRef.current?.focus());
            }
            return;
        }

        setQueuedVoiceSendState(false);
    }, [dispatchSend, setQueuedVoiceSendState]);

    const {
        state: voiceState,
        error: voiceError,
        elapsedMs,
        visualizerAnalyser,
        toggleRecording,
        stopRecording,
        clearError: clearVoiceError,
    } = useVoiceInput(handleTranscription, handleTranscriptionSettled);

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

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }, [input]);

    useEffect(() => {
        if (!pendingUserInput) return;
        if (!answeredUserInput) return;
        if (pendingUserInput.callId !== answeredUserInput.request.callId) {
            setAnsweredUserInput(null);
        }
    }, [pendingUserInput, answeredUserInput]);

    const ANSWER_CONFIRMATION_MS = 1200;
    useEffect(() => {
        if (!answeredUserInput) return;
        const timeout = window.setTimeout(() => {
            setAnsweredUserInput(null);
        }, ANSWER_CONFIRMATION_MS);
        return () => window.clearTimeout(timeout);
    }, [answeredUserInput]);

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

    useEffect(() => {
        if (!isLoading) sendLockRef.current = false;
    }, [isLoading]);

    const canShowAutonomy =
        (showAutonomyPreset ?? true) && !!autonomyPreset && !!updateAutonomyPreset && !!setShowAutonomySettings;

    const canShowAttachments =
        (showAttachments ?? true) && !!projectId && !!attachFile && !!attachExistingFile && !!clearAttachment;

    const hasSecondaryActions = canShowAttachments || !!onCompress;
    const isVoiceBusy = voiceState !== "idle";
    const canSubmit = voiceState === "recording"
        ? !queuedVoiceSend
        : voiceState === "idle" && (!!input.trim() || !!pendingAttachment);
    const showVoiceStatusPresentation = showVoice && isVoiceBusy;
    const canQueueNext = isLoading
        && !!input.trim()
        && !pendingAttachment
        && !isVoiceBusy
        && !hasQueuedFollowUp
        && !!onQueueFollowUp;

    const handleSend = useCallback(() => {
        if (voiceState === "recording") {
            if (queuedVoiceSendRef.current) return;
            setQueuedVoiceSendState(true);
            stopRecording();
            return;
        }
        if (voiceState === "requesting_permission" || voiceState === "transcribing") return;
        void dispatchSend(latestInputRef.current);
    }, [
        dispatchSend,
        setQueuedVoiceSendState,
        stopRecording,
        voiceState,
    ]);

    const handleStopDictation = useCallback(() => {
        setQueuedVoiceSendState(false);
        stopRecording();
    }, [setQueuedVoiceSendState, stopRecording]);

    const handleStop = useCallback(() => {
        if (voiceState === "recording" || voiceState === "transcribing") {
            stopRecording();
        }
        cancelStream();
    }, [cancelStream, voiceState, stopRecording]);

    const handleQueueNext = useCallback(() => {
        const text = input.trim();
        if (!text || !onQueueFollowUp) return;
        void onQueueFollowUp({
            text,
            page,
            section,
            studyId,
            model: selectedModel,
            agentMode: resolveCurrentComposerMode(text),
        });
        setInput("");
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, [input, onQueueFollowUp, page, resolveCurrentComposerMode, section, selectedModel, studyId]);

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

    const showRecordingHint = useCallback((target: HTMLElement, label: string) => {
        const container = inputBoxRef.current;
        if (!container) return;
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        setRecordingHint({
            label,
            x: targetRect.left - containerRect.left + targetRect.width / 2,
        });
    }, []);

    const hideRecordingHint = useCallback(() => {
        setRecordingHint(null);
    }, []);

    useEffect(() => {
        if (voiceState !== "recording") {
            setRecordingHint(null);
        }
    }, [voiceState]);

    const stopRecordingHintHandlers = voiceState === "recording" && !queuedVoiceSend
        ? {
            onMouseEnter: (event: ReactMouseEvent<HTMLButtonElement>) => {
                showRecordingHint(event.currentTarget, "Stop dictation");
            },
            onMouseLeave: hideRecordingHint,
            onFocus: (event: ReactFocusEvent<HTMLButtonElement>) => {
                showRecordingHint(event.currentTarget, "Stop dictation");
            },
            onBlur: hideRecordingHint,
        }
        : {};

    const sendRecordingHintHandlers = voiceState === "recording" && !queuedVoiceSend
        ? {
            onMouseEnter: (event: ReactMouseEvent<HTMLButtonElement>) => {
                showRecordingHint(event.currentTarget, "Transcribe and send");
            },
            onMouseLeave: hideRecordingHint,
            onFocus: (event: ReactFocusEvent<HTMLButtonElement>) => {
                showRecordingHint(event.currentTarget, "Transcribe and send");
            },
            onBlur: hideRecordingHint,
        }
        : {};

    const selectedModelInfo = USER_SELECTABLE_MODELS.find((m) => m.id === selectedModel);
    const ALL_MODES: AgentMode[] = getUserSelectableAgentModes();
    const isManualMode = isManualComposerModeSelection(modeSelection);

    const modelControl = hasMounted ? (
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
    );

    const autonomyControl = canShowAutonomy ? (hasMounted ? (
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
    )) : null;

    const voiceControl = showVoice ? (
        <>
            <span
                className="sr-only"
                aria-live="polite"
                aria-atomic="true"
            >
                    {voiceState === "recording"
                        ? "Recording in progress"
                        : voiceState === "requesting_permission"
                        ? "Waiting for microphone permission"
                        : voiceState === "transcribing"
                        ? queuedVoiceSend
                            ? "Transcribing and sending"
                            : "Transcribing..."
                        : ""}
            </span>
            <button
                type="button"
                className={`${styles.actionBtn} ${styles.voiceActionBtn} ${voiceState === "recording" ? styles.voiceActionBtnRecording : ""}`}
                onClick={voiceState === "recording" ? handleStopDictation : toggleRecording}
                disabled={voiceState === "requesting_permission" || voiceState === "transcribing" || queuedVoiceSend}
                aria-label={
                    voiceState === "recording"
                        ? "Stop dictation"
                        : voiceState === "requesting_permission"
                        ? "Waiting for microphone permission"
                        : voiceState === "transcribing"
                        ? "Transcribing..."
                        : "Voice input"
                }
                {...stopRecordingHintHandlers}
            >
                <span className="material-icons-round">
                    {voiceState === "recording"
                        ? "stop_circle"
                        : voiceState === "requesting_permission" || voiceState === "transcribing"
                        ? "hourglass_top"
                        : "mic"}
                </span>
            </button>
        </>
    ) : null;

    return (
        <>
            <form
                ref={inputBoxRef}
                className={styles.inputBox}
                data-attached-stack={attachedStack}
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                }}
            >
                {(input.trim() || isManualMode) && (
                    <div className={styles.modePill}>
                        <span className={`material-icons-round ${styles.modePillIcon}`}>
                            {modeMeta.icon}
                        </span>
                        <span className={styles.modePillLabel}>
                            {modeMeta.label}
                            {isManualMode ? " (manual)" : " (auto)"}
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
                                        <DropdownMenu.Item
                                            className={`${styles.modeItem} ${!isManualMode ? styles.modeItemActive : ""}`}
                                            onSelect={() => setModeSelection(AUTO_COMPOSER_MODE_SELECTION)}
                                        >
                                            <span className={`material-icons-round ${styles.modeItemIcon}`}>
                                                auto_awesome
                                            </span>
                                            <span className={styles.modeItemName}>Auto</span>
                                            <span className={styles.modeItemDesc}>Choose the mode automatically from the current request</span>
                                        </DropdownMenu.Item>
                                        {ALL_MODES.map((mode) => {
                                            const meta = AGENT_MODE_META[mode];
                                            const isActive = isManualMode && mode === effectiveMode;
                                            return (
                                                <DropdownMenu.Item
                                                    key={mode}
                                                    className={`${styles.modeItem} ${isActive ? styles.modeItemActive : ""}`}
                                                    onSelect={() => setModeSelection({ kind: "manual", mode })}
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
                                    sendMessage(
                                        choice.value,
                                        page,
                                        section,
                                        selectedModel,
                                        resolveCurrentComposerMode(choice.value),
                                        studyId,
                                    );
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

                <div className={`${styles.inputBar} ${showVoiceStatusPresentation ? styles.inputBarRecording : ""}`}>
                    <div className={styles.inputBarLeft}>
                        {hasSecondaryActions ? (
                            hasMounted ? (
                                <CopilotActionsMenuButton
                                    projectId={projectId}
                                    studyId={studyId}
                                    isAttaching={isAttaching}
                                    onAttachFile={attachFile}
                                    onAttachExistingFile={attachExistingFile}
                                    onCompress={onCompress}
                                    canCompress={canCompress}
                                    isCompressing={isCompressing}
                                    disabled={isVoiceBusy}
                                />
                            ) : (
                                <button
                                    type="button"
                                    className={`${styles.actionBtn} ${styles.actionMenuBtn} ${styles.mountPlaceholder}`}
                                    aria-hidden="true"
                                    tabIndex={-1}
                                >
                                    <span className="material-icons-round">add</span>
                                </button>
                            )
                        ) : null}

                        {!showVoiceStatusPresentation ? (
                            <>
                                {modelControl}
                                {autonomyControl}
                            </>
                        ) : (
                            <div className={styles.recordingStatus} aria-live="polite" aria-atomic="true">
                                {voiceState === "recording" ? (
                                    <>
                                        <VoiceLevelVisualizer analyser={visualizerAnalyser} isRecording={true} />
                                        <span className={styles.recordingTimer}>{formatElapsedVoiceTime(elapsedMs)}</span>
                                    </>
                                ) : voiceState === "requesting_permission" ? (
                                    <div className={styles.transcribingStatus}>
                                        <span className="material-icons-round" aria-hidden="true">mic</span>
                                        <span>Waiting for microphone permission</span>
                                    </div>
                                ) : (
                                    <div className={styles.transcribingStatus}>
                                        <span className={styles.transcribingDots} aria-hidden="true">
                                            <span className={styles.transcribingDot} />
                                            <span className={styles.transcribingDot} />
                                            <span className={styles.transcribingDot} />
                                        </span>
                                        <span>{queuedVoiceSend ? "Transcribing and sending" : "Transcribing audio"}</span>
                                        <span className={styles.recordingTimer}>{formatElapsedVoiceTime(elapsedMs)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={styles.inputBarRight}>
                        {canQueueNext ? (
                            <button
                                type="button"
                                className={styles.queueNextBtn}
                                onClick={handleQueueNext}
                            >
                                Queue next
                            </button>
                        ) : null}
                        {voiceControl}
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
                                type={voiceState === "idle" ? "submit" : "button"}
                                className={`${styles.sendBtn} ${canSubmit ? styles.sendBtnActive : ""}`}
                                aria-label={voiceState === "recording" ? "Transcribe and send" : "Send"}
                                disabled={!canSubmit}
                                onClick={voiceState === "idle" ? undefined : handleSend}
                                {...sendRecordingHintHandlers}
                            >
                                <span className="material-icons-round">arrow_upward</span>
                            </button>
                        )}
                    </div>
                </div>

                {showVoice && voiceError && (
                    <div className={styles.voiceError}>
                        <span>{voiceError}</span>
                        <button type="button" onClick={clearVoiceError} aria-label="Dismiss">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                )}
                {recordingHint && voiceState === "recording" ? (
                    <div
                        className={styles.recordingControlHint}
                        style={{ left: `${recordingHint.x}px` }}
                        role="tooltip"
                    >
                        {recordingHint.label}
                    </div>
                ) : null}
            </form>
        </>
    );
}
