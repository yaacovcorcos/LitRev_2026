export type TruncationMode = "head" | "tail" | "both";

export type TruncateToolOutputOptions = {
    mode?: TruncationMode;
    maxChars?: number;
    maxLines?: number;
    maxBytes?: number;
    preserveMarkdownFences?: boolean;
};

export const DEFAULT_TRUNCATION_MAX_LINES = 2000;
export const DEFAULT_TRUNCATION_MAX_BYTES = 50 * 1024;
export const DEFAULT_TRUNCATION_MODE: TruncationMode = "head";

export const TOOL_TRUNCATION_MODES: Record<string, TruncationMode> = {
    search_pubmed: "head",
    search_semantic_scholar: "head",
    search_openalex: "head",
    recommend_studies: "head",
    bulk_screening: "tail",
    extract_pdf: "both",
    read_study_content: "both",
    retrieve_memory: "head",
};

type FenceSpan = {
    start: number;
    end: number;
    marker: string;
    indent: string;
    info: string;
};

type TruncationEnvelope = {
    content: string;
    truncated: boolean;
    omittedChars: number;
    omittedLines: number;
    omittedBytes: number;
    mode: TruncationMode;
};

function resolveMode(toolName: string, requested?: TruncationMode): TruncationMode {
    if (requested) return requested;
    return TOOL_TRUNCATION_MODES[toolName] ?? DEFAULT_TRUNCATION_MODE;
}

function parseFenceSpans(text: string): FenceSpan[] {
    const spans: FenceSpan[] = [];
    let open:
        | { start: number; markerChar: string; markerLen: number; marker: string; indent: string; info: string }
        | undefined;

    let offset = 0;
    while (offset <= text.length) {
        const nextNewline = text.indexOf("\n", offset);
        const lineEnd = nextNewline === -1 ? text.length : nextNewline;
        const line = text.slice(offset, lineEnd);
        const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);

        if (match) {
            const indent = match[1];
            const marker = match[2];
            const info = match[3] ?? "";
            const markerChar = marker[0];
            const markerLen = marker.length;

            if (!open) {
                open = { start: offset, markerChar, markerLen, marker, indent, info };
            } else if (open.markerChar === markerChar && markerLen >= open.markerLen) {
                spans.push({
                    start: open.start,
                    end: lineEnd,
                    marker: open.marker,
                    indent: open.indent,
                    info: open.info,
                });
                open = undefined;
            }
        }

        if (nextNewline === -1) break;
        offset = nextNewline + 1;
    }

    if (open) {
        spans.push({
            start: open.start,
            end: text.length,
            marker: open.marker,
            indent: open.indent,
            info: open.info,
        });
    }

    return spans;
}

function findFenceAt(spans: FenceSpan[], index: number): FenceSpan | undefined {
    return spans.find((span) => index > span.start && index < span.end);
}

function buildFenceOpening(span: FenceSpan): string {
    return `${span.indent}${span.marker}${span.info}`;
}

function byteToCharBudget(content: string, maxBytes: number): number {
    if (maxBytes <= 0) return 0;
    const currentBytes = Buffer.byteLength(content, "utf-8");
    if (currentBytes <= maxBytes) return content.length;
    const ratio = maxBytes / currentBytes;
    return Math.max(1, Math.floor(content.length * ratio));
}

function applyLineBudget(content: string, maxLines: number, mode: TruncationMode): string {
    if (maxLines <= 0) return "";
    const lines = content.split("\n");
    if (lines.length <= maxLines) return content;

    if (mode === "tail") {
        return lines.slice(lines.length - maxLines).join("\n");
    }
    if (mode === "both") {
        const headCount = Math.max(1, Math.floor(maxLines / 2));
        const tailCount = Math.max(1, maxLines - headCount);
        return [...lines.slice(0, headCount), ...lines.slice(lines.length - tailCount)].join("\n");
    }
    return lines.slice(0, maxLines).join("\n");
}

function truncateByMode(content: string, maxChars: number, mode: TruncationMode): string {
    if (content.length <= maxChars) return content;

    if (mode === "tail") {
        return content.slice(content.length - maxChars);
    }
    if (mode === "both") {
        const headChars = Math.max(1, Math.floor(maxChars / 2));
        const tailChars = Math.max(1, maxChars - headChars);
        return content.slice(0, headChars) + content.slice(content.length - tailChars);
    }
    return content.slice(0, maxChars);
}

function buildTruncationMarker(envelope: TruncationEnvelope): string {
    return `[...truncated ${envelope.omittedChars} chars, ${envelope.omittedLines} lines, ${envelope.omittedBytes} bytes (${envelope.mode})...]`;
}

function applyFenceSafeTruncation(
    original: string,
    kept: string,
    mode: TruncationMode,
    marker: string
): string {
    const spans = parseFenceSpans(original);

    if (mode === "head") {
        const cutIndex = kept.length;
        const activeFence = findFenceAt(spans, cutIndex);
        const closeFence = activeFence ? `\n${activeFence.indent}${activeFence.marker}` : "";
        return `${kept}${closeFence}\n\n${marker}`;
    }

    if (mode === "tail") {
        const startIndex = Math.max(0, original.length - kept.length);
        const activeFence = findFenceAt(spans, startIndex);
        const openFence = activeFence ? `${buildFenceOpening(activeFence)}\n` : "";
        return `${marker}\n\n${openFence}${kept}`;
    }

    const headChars = Math.max(1, Math.floor(kept.length / 2));
    const head = kept.slice(0, headChars);
    const tail = kept.slice(headChars);
    const headCutIndex = head.length;
    const tailStartIndex = Math.max(0, original.length - tail.length);
    const headFence = findFenceAt(spans, headCutIndex);
    const tailFence = findFenceAt(spans, tailStartIndex);
    const closeFence = headFence ? `\n${headFence.indent}${headFence.marker}` : "";
    const openFence = tailFence ? `${buildFenceOpening(tailFence)}\n` : "";

    return `${head}${closeFence}\n\n${marker}\n\n${openFence}${tail}`;
}

export function truncateToolOutput(
    toolName: string,
    content: string,
    options?: TruncateToolOutputOptions
): string {
    const mode = resolveMode(toolName, options?.mode);
    const maxLines = options?.maxLines ?? DEFAULT_TRUNCATION_MAX_LINES;
    const maxBytes = options?.maxBytes ?? DEFAULT_TRUNCATION_MAX_BYTES;
    const preserveMarkdownFences = options?.preserveMarkdownFences ?? true;

    const lineBudgeted = applyLineBudget(content, maxLines, mode);
    const byteCharBudget = byteToCharBudget(lineBudgeted, maxBytes);
    const charBudget = Math.max(1, Math.min(options?.maxChars ?? lineBudgeted.length, byteCharBudget));
    const kept = truncateByMode(lineBudgeted, charBudget, mode);
    const truncated = kept.length < content.length;

    if (!truncated) {
        return content;
    }

    const originalLines = content.split("\n").length;
    const keptLines = kept.split("\n").length;
    const envelope: TruncationEnvelope = {
        content: kept,
        truncated: true,
        omittedChars: Math.max(0, content.length - kept.length),
        omittedLines: Math.max(0, originalLines - keptLines),
        omittedBytes: Math.max(0, Buffer.byteLength(content, "utf-8") - Buffer.byteLength(kept, "utf-8")),
        mode,
    };
    const marker = buildTruncationMarker(envelope);

    if (!preserveMarkdownFences) {
        if (mode === "tail") {
            return `${marker}\n\n${kept}`;
        }
        if (mode === "both") {
            const half = Math.max(1, Math.floor(kept.length / 2));
            return `${kept.slice(0, half)}\n\n${marker}\n\n${kept.slice(half)}`;
        }
        return `${kept}\n\n${marker}`;
    }

    return applyFenceSafeTruncation(content, kept, mode, marker);
}
