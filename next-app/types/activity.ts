export type ProjectActivityKind =
    | "study_created"
    | "note_created"
    | "note_updated"
    | "file_uploaded"
    | "protocol_updated"
    | "draft_updated"
    | "artifact_applied"
    | "conversation_updated";

export type ProjectActivityItem = {
    id: string;
    kind: ProjectActivityKind;
    label: string;
    timestamp: string;
    icon: string;
    href: string;
    coalescedCount?: number;
};
