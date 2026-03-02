export type PopupChatContext =
    | { type: "study"; projectId: string; studyId: string; title: string; abstract?: string; authors?: string }
    | { type: "criterion"; projectId: string; text: string; criterionType: "inclusion" | "exclusion" }
    | { type: "draft_selection"; projectId: string; section: string; selectedText: string }
    | { type: "protocol_section"; projectId: string; section: string; sectionKey?: string; currentContent: string };

export type PopupMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
};
