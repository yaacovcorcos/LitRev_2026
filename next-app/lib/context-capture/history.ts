import type { ContextCaptureHistoryEntry, ContextCaptureTarget } from "@/types/context-capture";
import { sanitizeContextCaptureText } from "@/lib/context-capture/format";

const STORAGE_KEY_PREFIX = "litrev:context-capture-history:v1";
const HISTORY_TTL_MS = 60 * 60 * 1000;
const HISTORY_LIMIT = 8;

function storageKey(projectId: string): string {
    return `${STORAGE_KEY_PREFIX}:${projectId}`;
}

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function toIsoNow(): string {
    return new Date().toISOString();
}

function getHistoryEntryId(target: ContextCaptureTarget): string {
    switch (target.kind) {
        case "study":
            return `study:${target.studyId}`;
        case "study_set":
            return `study_set:${target.studyIds.join(",")}`;
        case "note":
            return `note:${target.noteId}`;
        case "note_selection":
            return `note_selection:${target.noteId}:${target.preview ?? ""}`;
        case "draft_selection":
            return `draft_selection:${target.section}:${target.preview ?? ""}`;
        case "protocol_field":
            return `protocol_field:${target.fieldPath}`;
        case "protocol_section":
            return `protocol_section:${target.sectionKey ?? target.section}`;
        case "protocol_criterion":
            return `protocol_criterion:${target.criterionType}:${target.criterionIndex}`;
        case "artifact":
            return `artifact:${target.artifactId}`;
        case "assistant_message":
            return `assistant_message:${target.messageId}`;
    }
}

function sanitizeTargetForHistory(target: ContextCaptureTarget): ContextCaptureTarget {
    switch (target.kind) {
        case "study":
            return {
                ...target,
                abstract: undefined,
                aiSummary: undefined,
                preview: sanitizeContextCaptureText(target.preview, 80),
            };
        case "study_set":
            return {
                ...target,
                preview: sanitizeContextCaptureText(target.preview, 80),
                studies: target.studies.slice(0, 3).map((study) => ({
                    studyId: study.studyId,
                    title: study.title,
                    authors: study.authors,
                    year: study.year,
                    journal: study.journal,
                    quality: study.quality,
                })),
            };
        case "protocol_section":
            return {
                ...target,
                currentContent: "",
                preview: sanitizeContextCaptureText(target.preview, 80),
            };
        case "protocol_field":
            return {
                ...target,
                value: "",
                preview: sanitizeContextCaptureText(target.preview, 80),
            };
        case "protocol_criterion":
            return {
                ...target,
                text: sanitizeContextCaptureText(target.text, 80),
                preview: sanitizeContextCaptureText(target.preview, 80),
            };
        case "draft_selection":
            return {
                ...target,
                selectedText: sanitizeContextCaptureText(target.selectedText, 120),
                surroundingText: undefined,
                preview: sanitizeContextCaptureText(target.preview ?? target.selectedText, 120),
            };
        case "note":
            return {
                ...target,
                excerpt: sanitizeContextCaptureText(target.excerpt, 80),
                preview: sanitizeContextCaptureText(target.preview ?? target.excerpt, 80),
            };
        case "note_selection":
            return {
                ...target,
                selectedText: sanitizeContextCaptureText(target.selectedText, 80),
                excerpt: sanitizeContextCaptureText(target.excerpt, 80),
                preview: sanitizeContextCaptureText(target.preview ?? target.selectedText, 80),
            };
        case "artifact":
            return {
                ...target,
                summary: sanitizeContextCaptureText(target.summary, 80),
                preview: sanitizeContextCaptureText(target.preview ?? target.summary, 80),
            };
        case "assistant_message":
            return {
                ...target,
                excerpt: sanitizeContextCaptureText(target.excerpt, 80),
                preview: sanitizeContextCaptureText(target.preview ?? target.excerpt, 80),
            };
    }
}

function dropExpired(entries: ContextCaptureHistoryEntry[]): ContextCaptureHistoryEntry[] {
    const now = Date.now();
    return entries.filter((entry) => {
        const createdAt = Date.parse(entry.createdAt);
        if (!Number.isFinite(createdAt)) return false;
        return now - createdAt <= HISTORY_TTL_MS;
    });
}

export function loadContextCaptureHistory(projectId: string): ContextCaptureHistoryEntry[] {
    if (!isBrowser()) return [];
    try {
        const raw = window.sessionStorage.getItem(storageKey(projectId));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as ContextCaptureHistoryEntry[] | null;
        if (!Array.isArray(parsed)) return [];
        const pruned = dropExpired(parsed);
        if (pruned.length !== parsed.length) {
            window.sessionStorage.setItem(storageKey(projectId), JSON.stringify(pruned));
        }
        return pruned;
    } catch {
        return [];
    }
}

export function saveContextCaptureHistory(projectId: string, entries: ContextCaptureHistoryEntry[]): void {
    if (!isBrowser()) return;
    try {
        const bounded = dropExpired(entries).slice(0, HISTORY_LIMIT);
        window.sessionStorage.setItem(storageKey(projectId), JSON.stringify(bounded));
    } catch {
        // Best-effort session history only.
    }
}

export function pushContextCaptureHistory(
    projectId: string,
    targets: ContextCaptureTarget[],
): ContextCaptureHistoryEntry[] {
    const nextEntries = [...loadContextCaptureHistory(projectId)];
    for (const target of targets) {
        const entry: ContextCaptureHistoryEntry = {
            id: getHistoryEntryId(target),
            createdAt: toIsoNow(),
            target: sanitizeTargetForHistory(target),
        };
        const deduped = nextEntries.filter((existing) => existing.id !== entry.id);
        nextEntries.length = 0;
        nextEntries.push(entry, ...deduped);
    }
    const bounded = nextEntries.slice(0, HISTORY_LIMIT);
    saveContextCaptureHistory(projectId, bounded);
    return bounded;
}

export function clearContextCaptureHistory(projectId: string): void {
    if (!isBrowser()) return;
    try {
        window.sessionStorage.removeItem(storageKey(projectId));
    } catch {
        // Best-effort cleanup only.
    }
}

export function clearAllContextCaptureHistory(): void {
    if (!isBrowser()) return;
    try {
        const keysToRemove: string[] = [];
        for (let index = 0; index < window.sessionStorage.length; index += 1) {
            const key = window.sessionStorage.key(index);
            if (key?.startsWith(STORAGE_KEY_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        for (const key of keysToRemove) {
            window.sessionStorage.removeItem(key);
        }
    } catch {
        // Best-effort cleanup only.
    }
}
