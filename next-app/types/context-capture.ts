export type ContextCaptureTargetKind =
    | "protocol_section"
    | "protocol_field"
    | "protocol_criterion"
    | "draft_selection"
    | "study"
    | "study_set"
    | "note"
    | "note_selection"
    | "artifact"
    | "assistant_message";

export type ContextCaptureSurface =
    | "protocol"
    | "draft"
    | "ledger"
    | "study"
    | "notes"
    | "memory"
    | "ai"
    | "copilot"
    | "popup"
    | "overview";

export type ContextCaptureLaunchMode = "popup" | "prefill" | "immediate_send";

export type ContextCaptureBase<TKind extends ContextCaptureTargetKind> = {
    kind: TKind;
    projectId: string;
    label: string;
    icon: string;
    preview?: string;
    sourceSurface?: ContextCaptureSurface;
};

export type ProtocolSectionTarget = ContextCaptureBase<"protocol_section"> & {
    section: string;
    sectionKey?: string;
    currentContent: string;
    allowedProtocolFields?: string[];
};

export type ProtocolFieldTarget = ContextCaptureBase<"protocol_field"> & {
    section: string;
    sectionKey: string;
    fieldPath: string;
    fieldLabel: string;
    value: string;
    allowedProtocolFields?: string[];
};

export type ProtocolCriterionTarget = ContextCaptureBase<"protocol_criterion"> & {
    section: "Eligibility Criteria";
    criterionType: "inclusion" | "exclusion";
    criterionIndex: number;
    text: string;
    allowedProtocolFields?: string[];
};

export type DraftSelectionTarget = ContextCaptureBase<"draft_selection"> & {
    section: string;
    selectedText: string;
    surroundingText?: string;
    citedStudyIds?: string[];
};

export type StudySnapshot = {
    studyId: string;
    title: string;
    authors?: string;
    year?: number;
    abstract?: string;
    journal?: string;
    quality?: string;
    aiSummary?: string;
};

export type StudyTarget = ContextCaptureBase<"study"> & StudySnapshot;

export type StudySetTarget = ContextCaptureBase<"study_set"> & {
    studyIds: string[];
    studies: StudySnapshot[];
};

export type NoteTarget = ContextCaptureBase<"note"> & {
    noteId: string;
    title?: string | null;
    excerpt: string;
    tags: string[];
    linkedStudyId?: string | null;
    linkedSection?: string | null;
};

export type NoteSelectionTarget = ContextCaptureBase<"note_selection"> & {
    noteId: string;
    title?: string | null;
    selectedText: string;
    excerpt: string;
    tags: string[];
};

export type ArtifactTarget = ContextCaptureBase<"artifact"> & {
    artifactId: string;
    artifactType: string;
    title: string;
    summary?: string;
};

export type AssistantMessageTarget = ContextCaptureBase<"assistant_message"> & {
    messageId: string;
    conversationId?: string;
    excerpt: string;
};

export type ContextCaptureTarget =
    | ProtocolSectionTarget
    | ProtocolFieldTarget
    | ProtocolCriterionTarget
    | DraftSelectionTarget
    | StudyTarget
    | StudySetTarget
    | NoteTarget
    | NoteSelectionTarget
    | ArtifactTarget
    | AssistantMessageTarget;

export type ContextCaptureActionId =
    | "ask_ai"
    | "send_to_copilot"
    | "compare_selected_studies"
    | "summarize_for_notes"
    | "refine_protocol_field"
    | "check_claim_support"
    | "rewrite_selection";

export type ContextCaptureAction = {
    id: ContextCaptureActionId;
    label: string;
    icon: string;
    launchMode: ContextCaptureLaunchMode;
    telemetryName: string;
    supportedKinds: ContextCaptureTargetKind[];
    defaultPrompt?: string;
};

export type ContextCaptureHistoryEntry = {
    id: string;
    createdAt: string;
    target: ContextCaptureTarget;
};
