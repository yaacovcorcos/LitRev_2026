import type { ContextCaptureAction, ContextCaptureActionId, ContextCaptureTarget, ContextCaptureTargetKind } from "@/types/context-capture";

export const CONTEXT_CAPTURE_ACTIONS: Record<ContextCaptureActionId, ContextCaptureAction> = {
    ask_ai: {
        id: "ask_ai",
        label: "Ask AI",
        icon: "smart_toy",
        launchMode: "popup",
        telemetryName: "context_capture_opened",
        supportedKinds: ["protocol_section", "protocol_criterion", "draft_selection", "study"],
        defaultPrompt: "Help me with this context.",
    },
    send_to_copilot: {
        id: "send_to_copilot",
        label: "Use in Copilot",
        icon: "chat",
        launchMode: "prefill",
        telemetryName: "context_capture_opened",
        supportedKinds: ["protocol_field", "draft_selection", "note", "note_selection", "artifact", "assistant_message"],
        defaultPrompt: "Use this context in your answer.",
    },
    compare_selected_studies: {
        id: "compare_selected_studies",
        label: "Compare Studies",
        icon: "compare_arrows",
        launchMode: "immediate_send",
        telemetryName: "context_capture_sent",
        supportedKinds: ["study_set"],
        defaultPrompt: "Compare these selected studies and highlight the main agreements, disagreements, and screening implications.",
    },
    summarize_for_notes: {
        id: "summarize_for_notes",
        label: "Summarize for Notes",
        icon: "note_add",
        launchMode: "immediate_send",
        telemetryName: "context_capture_sent",
        supportedKinds: ["study_set", "note", "artifact", "assistant_message"],
        defaultPrompt: "Summarize this context into concise note-ready bullets.",
    },
    refine_protocol_field: {
        id: "refine_protocol_field",
        label: "Refine Field",
        icon: "tune",
        launchMode: "prefill",
        telemetryName: "context_capture_opened",
        supportedKinds: ["protocol_field"],
        defaultPrompt: "Refine this protocol field so it is clearer, more measurable, and easier to apply consistently.",
    },
    check_claim_support: {
        id: "check_claim_support",
        label: "Check Support",
        icon: "fact_check",
        launchMode: "prefill",
        telemetryName: "context_capture_opened",
        supportedKinds: ["draft_selection", "assistant_message"],
        defaultPrompt: "Check whether this claim is supported and point out any missing or weak evidence.",
    },
    rewrite_selection: {
        id: "rewrite_selection",
        label: "Rewrite",
        icon: "edit_note",
        launchMode: "prefill",
        telemetryName: "context_capture_opened",
        supportedKinds: ["draft_selection", "note_selection"],
        defaultPrompt: "Rewrite this text for clarity while preserving the meaning and staying conservative.",
    },
};

export function getContextCaptureAction(actionId: ContextCaptureActionId): ContextCaptureAction {
    return CONTEXT_CAPTURE_ACTIONS[actionId];
}

export function canActionApplyToTargets(actionId: ContextCaptureActionId, targets: ContextCaptureTarget[]): boolean {
    if (targets.length === 0) return false;
    const action = getContextCaptureAction(actionId);
    return targets.every((target) => action.supportedKinds.includes(target.kind));
}

export function actionSupportsKind(actionId: ContextCaptureActionId, kind: ContextCaptureTargetKind): boolean {
    return getContextCaptureAction(actionId).supportedKinds.includes(kind);
}
