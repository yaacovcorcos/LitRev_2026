import type { JSONContent } from "@tiptap/core";
import type { PopupChatContext } from "@/types/popup-chat";
import type {
    AssistantMessageTarget,
    ArtifactTarget,
    ContextCaptureTarget,
    DraftSelectionTarget,
    NoteSelectionTarget,
    NoteTarget,
    ProtocolCriterionTarget,
    ProtocolFieldTarget,
    ProtocolSectionTarget,
    StudySetTarget,
    StudySnapshot,
    StudyTarget,
} from "@/types/context-capture";
import { extractTextFromJsonContent, sanitizeContextCaptureText, summarizeStudyLabels } from "@/lib/context-capture/format";

export const CONTEXT_CAPTURE_STUDY_SET_MAX = 6;

type ProtocolSectionTargetArgs = {
    projectId: string;
    section: string;
    sectionKey?: string;
    currentContent: string;
    sourceSurface?: ProtocolSectionTarget["sourceSurface"];
    allowedProtocolFields?: string[];
};

type ProtocolFieldTargetArgs = {
    projectId: string;
    section: string;
    sectionKey: string;
    fieldPath: string;
    fieldLabel: string;
    value: string;
    sourceSurface?: ProtocolFieldTarget["sourceSurface"];
    allowedProtocolFields?: string[];
};

type ProtocolCriterionTargetArgs = {
    projectId: string;
    criterionType: ProtocolCriterionTarget["criterionType"];
    criterionIndex: number;
    text: string;
    sourceSurface?: ProtocolCriterionTarget["sourceSurface"];
};

type DraftSelectionTargetArgs = {
    projectId: string;
    section: string;
    selectedText: string;
    surroundingText?: string;
    citedStudyIds?: string[];
    sourceSurface?: DraftSelectionTarget["sourceSurface"];
};

type NoteTargetArgs = {
    projectId: string;
    noteId: string;
    title?: string | null;
    content: JSONContent | null | undefined;
    tags?: string[];
    linkedStudyId?: string | null;
    linkedSection?: string | null;
    sourceSurface?: NoteTarget["sourceSurface"];
};

type NoteSelectionTargetArgs = {
    projectId: string;
    noteId: string;
    title?: string | null;
    selectedText: string;
    content: JSONContent | null | undefined;
    tags?: string[];
    sourceSurface?: NoteSelectionTarget["sourceSurface"];
};

type ArtifactTargetArgs = {
    projectId: string;
    artifactId: string;
    artifactType: string;
    title: string;
    summary?: string;
    sourceSurface?: ArtifactTarget["sourceSurface"];
};

type AssistantMessageTargetArgs = {
    projectId: string;
    messageId: string;
    conversationId?: string;
    content: string;
    sourceSurface?: AssistantMessageTarget["sourceSurface"];
};

function buildStudyPreview(study: StudySnapshot): string {
    const author = sanitizeContextCaptureText(study.authors, 60);
    const year = typeof study.year === "number" ? String(study.year) : null;
    return [author, year].filter(Boolean).join(", ");
}

function sanitizeStudySnapshot(study: StudySnapshot): StudySnapshot {
    return {
        studyId: study.studyId,
        title: sanitizeContextCaptureText(study.title, 180),
        authors: sanitizeContextCaptureText(study.authors, 120),
        year: study.year,
        abstract: sanitizeContextCaptureText(study.abstract ?? study.aiSummary, 1_200),
        journal: sanitizeContextCaptureText(study.journal, 120),
        quality: sanitizeContextCaptureText(study.quality, 40),
        aiSummary: sanitizeContextCaptureText(study.aiSummary, 1_000),
    };
}

export function getContextTargetKey(target: ContextCaptureTarget): string {
    switch (target.kind) {
        case "study":
            return `study:${target.studyId}`;
        case "study_set":
            return `study_set:${target.studyIds.join(",")}`;
        case "protocol_section":
            return `protocol_section:${target.sectionKey ?? target.section}`;
        case "protocol_field":
            return `protocol_field:${target.fieldPath}`;
        case "protocol_criterion":
            return `protocol_criterion:${target.criterionType}:${target.criterionIndex}`;
        case "draft_selection":
            return `draft_selection:${target.section}:${target.preview ?? target.selectedText}`;
        case "note":
            return `note:${target.noteId}`;
        case "note_selection":
            return `note_selection:${target.noteId}:${target.preview ?? target.selectedText}`;
        case "artifact":
            return `artifact:${target.artifactId}`;
        case "assistant_message":
            return `assistant_message:${target.messageId}`;
    }
}

export function buildProtocolSectionTarget(args: ProtocolSectionTargetArgs): ProtocolSectionTarget {
    return {
        kind: "protocol_section",
        projectId: args.projectId,
        section: args.section,
        sectionKey: args.sectionKey,
        currentContent: sanitizeContextCaptureText(args.currentContent, 1_200),
        label: args.section,
        preview: sanitizeContextCaptureText(args.currentContent, 120),
        icon: "description",
        sourceSurface: args.sourceSurface ?? "protocol",
        allowedProtocolFields: args.allowedProtocolFields,
    };
}

export function buildProtocolFieldTarget(args: ProtocolFieldTargetArgs): ProtocolFieldTarget {
    return {
        kind: "protocol_field",
        projectId: args.projectId,
        section: args.section,
        sectionKey: args.sectionKey,
        fieldPath: args.fieldPath,
        fieldLabel: args.fieldLabel,
        value: sanitizeContextCaptureText(args.value, 1_000),
        label: args.fieldLabel,
        preview: sanitizeContextCaptureText(args.value, 120),
        icon: "tune",
        sourceSurface: args.sourceSurface ?? "protocol",
        allowedProtocolFields: args.allowedProtocolFields ?? [args.fieldPath],
    };
}

export function buildProtocolCriterionTarget(args: ProtocolCriterionTargetArgs): ProtocolCriterionTarget {
    const label = `${args.criterionType === "inclusion" ? "Inclusion" : "Exclusion"} criterion`;
    return {
        kind: "protocol_criterion",
        projectId: args.projectId,
        section: "Eligibility Criteria",
        criterionType: args.criterionType,
        criterionIndex: args.criterionIndex,
        text: sanitizeContextCaptureText(args.text, 900),
        label,
        preview: sanitizeContextCaptureText(args.text, 120),
        icon: "checklist",
        sourceSurface: args.sourceSurface ?? "protocol",
        allowedProtocolFields: [args.criterionType === "inclusion" ? "eligibility.inclusion" : "eligibility.exclusion"],
    };
}

export function buildDraftSelectionTarget(args: DraftSelectionTargetArgs): DraftSelectionTarget {
    const selectedText = sanitizeContextCaptureText(args.selectedText, 1_200);
    const surroundingText = sanitizeContextCaptureText(args.surroundingText, 1_200);
    return {
        kind: "draft_selection",
        projectId: args.projectId,
        section: args.section,
        selectedText,
        surroundingText: surroundingText || undefined,
        citedStudyIds: args.citedStudyIds?.slice(0, 12),
        label: args.section,
        preview: sanitizeContextCaptureText(selectedText || surroundingText, 120),
        icon: "edit_note",
        sourceSurface: args.sourceSurface ?? "draft",
    };
}

export function buildStudyTarget(args: {
    projectId: string;
    study: StudySnapshot;
    sourceSurface?: StudyTarget["sourceSurface"];
}): StudyTarget {
    const study = sanitizeStudySnapshot(args.study);
    return {
        kind: "study",
        projectId: args.projectId,
        label: study.title,
        preview: buildStudyPreview(study),
        icon: "article",
        sourceSurface: args.sourceSurface ?? "ledger",
        ...study,
    };
}

export function buildStudySetTarget(args: {
    projectId: string;
    studies: StudySnapshot[];
    sourceSurface?: StudySetTarget["sourceSurface"];
}): StudySetTarget {
    const studies = args.studies.slice(0, CONTEXT_CAPTURE_STUDY_SET_MAX).map(sanitizeStudySnapshot);
    const studyIds = studies.map((study) => study.studyId);
    return {
        kind: "study_set",
        projectId: args.projectId,
        studyIds,
        studies,
        label: `${studyIds.length} selected studies`,
        preview: summarizeStudyLabels(studies.map((study) => study.title)),
        icon: "library_books",
        sourceSurface: args.sourceSurface ?? "ledger",
    };
}

export function buildNoteTarget(args: NoteTargetArgs): NoteTarget {
    const excerpt = sanitizeContextCaptureText(extractTextFromJsonContent(args.content), 1_200);
    return {
        kind: "note",
        projectId: args.projectId,
        noteId: args.noteId,
        title: args.title,
        excerpt,
        tags: args.tags?.slice(0, 12) ?? [],
        linkedStudyId: args.linkedStudyId,
        linkedSection: args.linkedSection,
        label: sanitizeContextCaptureText(args.title || "Untitled note", 120),
        preview: sanitizeContextCaptureText(excerpt, 80),
        icon: "sticky_note_2",
        sourceSurface: args.sourceSurface ?? "notes",
    };
}

export function buildNoteSelectionTarget(args: NoteSelectionTargetArgs): NoteSelectionTarget {
    const selectedText = sanitizeContextCaptureText(args.selectedText, 900);
    const excerpt = sanitizeContextCaptureText(extractTextFromJsonContent(args.content), 1_200);
    return {
        kind: "note_selection",
        projectId: args.projectId,
        noteId: args.noteId,
        title: args.title,
        selectedText,
        excerpt,
        tags: args.tags?.slice(0, 12) ?? [],
        label: sanitizeContextCaptureText(args.title || "Untitled note", 120),
        preview: sanitizeContextCaptureText(selectedText || excerpt, 80),
        icon: "sticky_note_2",
        sourceSurface: args.sourceSurface ?? "notes",
    };
}

export function buildArtifactTarget(args: ArtifactTargetArgs): ArtifactTarget {
    return {
        kind: "artifact",
        projectId: args.projectId,
        artifactId: args.artifactId,
        artifactType: args.artifactType,
        title: sanitizeContextCaptureText(args.title, 160),
        summary: sanitizeContextCaptureText(args.summary, 1_000),
        label: sanitizeContextCaptureText(args.title, 160),
        preview: sanitizeContextCaptureText(args.summary, 80),
        icon: "description",
        sourceSurface: args.sourceSurface ?? "copilot",
    };
}

export function buildAssistantMessageTarget(args: AssistantMessageTargetArgs): AssistantMessageTarget {
    const excerpt = sanitizeContextCaptureText(args.content, 1_000);
    return {
        kind: "assistant_message",
        projectId: args.projectId,
        messageId: args.messageId,
        conversationId: args.conversationId,
        excerpt,
        label: "Assistant message",
        preview: sanitizeContextCaptureText(excerpt, 80),
        icon: "chat",
        sourceSurface: args.sourceSurface ?? "copilot",
    };
}

export function contextTargetToPopupContext(target: ContextCaptureTarget): PopupChatContext | null {
    switch (target.kind) {
        case "study":
            return {
                type: "study",
                projectId: target.projectId,
                studyId: target.studyId,
                title: target.title,
                abstract: target.abstract ?? target.aiSummary,
                authors: target.authors,
            };
        case "draft_selection":
            return {
                type: "draft_selection",
                projectId: target.projectId,
                section: target.section,
                selectedText: target.selectedText,
            };
        case "protocol_section":
            return {
                type: "protocol_section",
                projectId: target.projectId,
                section: target.section,
                sectionKey: target.sectionKey,
                currentContent: target.currentContent,
            };
        case "protocol_criterion":
            return {
                type: "criterion",
                projectId: target.projectId,
                text: target.text,
                criterionType: target.criterionType,
            };
        default:
            return null;
    }
}

export function isPopupSafeContextTarget(target: ContextCaptureTarget): boolean {
    return contextTargetToPopupContext(target) !== null;
}

export function getContextTargetSummary(target: ContextCaptureTarget): string {
    return target.preview ?? target.label;
}

export function getContextTargetIcon(target: ContextCaptureTarget): string {
    return target.icon;
}

