import type { JSONContent } from "@tiptap/core";

const STRIP_TAGS_RE = /<[^>]+>/g;

export function collapseWhitespace(value: string | undefined): string {
    if (!value) return "";
    return value.replace(/\s+/g, " ").trim();
}

export function sanitizeContextCaptureText(value: string | undefined, maxChars: number): string {
    const normalized = collapseWhitespace(value)
        .replace(STRIP_TAGS_RE, "")
        .replace(/^#{1,6}\s/gm, "")
        .replace(/system:/gi, "")
        .replace(/user:/gi, "")
        .replace(/assistant:/gi, "")
        .replace(/\[INST\]/gi, "")
        .replace(/\[\/INST\]/gi, "");
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function extractTextFromJsonContent(content: JSONContent | null | undefined): string {
    if (!content || typeof content !== "object") return "";
    if (content.type === "text" && typeof content.text === "string") {
        return content.text;
    }
    if (content.type === "hardBreak") {
        return "\n";
    }
    if (!Array.isArray(content.content)) return "";
    return content.content.map((child) => extractTextFromJsonContent(child)).join(" ");
}

export function summarizeStudyLabels(labels: string[], maxVisible: number = 3): string {
    const visible = labels.slice(0, maxVisible);
    if (labels.length <= maxVisible) return visible.join(", ");
    return `${visible.join(", ")} +${labels.length - maxVisible} more`;
}
