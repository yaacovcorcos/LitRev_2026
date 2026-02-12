export type PopupChatContext =
    | { type: "study"; studyId: string; title: string; abstract?: string; authors?: string }
    | { type: "criterion"; text: string; criterionType: "inclusion" | "exclusion" }
    | { type: "draft_selection"; section: string; selectedText: string }
    | { type: "protocol_section"; section: string; currentContent: string };

export type PopupMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
};
