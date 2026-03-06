import { getFieldLabel, isValidFieldPath } from "@/lib/protocol-fields";
import type { CriteriaCardPayload, ProtocolSuggestionPayload } from "@/types/artifacts";
import type { ProtocolData } from "@/types/protocol";

export type ProtocolSaveState = "idle" | "saving" | "saved" | "local-only" | "error";

export type ProtocolArtifactPatch =
    | {
        type: "protocol_suggestion";
        fieldPath: string;
        fieldLabel: string;
        value: string | string[];
        rationale?: string;
        sourceLabel: string;
        affectedPaths: string[];
    }
    | {
        type: "criteria_card";
        inclusion: string[];
        exclusion: string[];
        rationale?: string;
        sourceLabel: string;
        affectedPaths: string[];
    };

const ARRAY_INDEX_PATTERN = /\[\d+\]/g;

export function cloneProtocolData(protocol: ProtocolData): ProtocolData {
    return {
        researchQuestion: protocol.researchQuestion,
        pico: { ...protocol.pico },
        eligibility: {
            inclusion: [...protocol.eligibility.inclusion],
            exclusion: [...protocol.eligibility.exclusion],
        },
        searchStrategy: {
            query: protocol.searchStrategy.query,
            databases: [...protocol.searchStrategy.databases],
        },
        methodology: {
            studyDesigns: [...protocol.methodology.studyDesigns],
            timeFrameStart: protocol.methodology.timeFrameStart,
            timeFrameEnd: protocol.methodology.timeFrameEnd,
            qualityAssessmentTool: protocol.methodology.qualityAssessmentTool,
            qualityAssessmentNotes: protocol.methodology.qualityAssessmentNotes,
        },
    };
}

function setNestedValue(target: Record<string, unknown>, path: string, value: string | string[]) {
    const parts = path.split(".");
    let current: Record<string, unknown> = target;

    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        const next = current[key];
        if (next && typeof next === "object" && !Array.isArray(next)) {
            current = next as Record<string, unknown>;
            continue;
        }
        const replacement: Record<string, unknown> = {};
        current[key] = replacement;
        current = replacement;
    }

    current[parts[parts.length - 1]] = Array.isArray(value) ? [...value] : value;
}

export function applyProtocolArtifactPatch(
    protocol: ProtocolData,
    patch: ProtocolArtifactPatch
): ProtocolData {
    const next = cloneProtocolData(protocol);

    if (patch.type === "criteria_card") {
        next.eligibility.inclusion = [...patch.inclusion];
        next.eligibility.exclusion = [...patch.exclusion];
        return next;
    }

    setNestedValue(next as unknown as Record<string, unknown>, patch.fieldPath, patch.value);
    return next;
}

export function buildProtocolArtifactPatch(
    artifactType: string,
    payload: unknown
): ProtocolArtifactPatch | null {
    if (artifactType === "protocol_suggestion") {
        const suggestion = payload as Partial<ProtocolSuggestionPayload> | null;
        if (!suggestion?.field || !isValidFieldPath(suggestion.field)) {
            return null;
        }
        return {
            type: "protocol_suggestion",
            fieldPath: suggestion.field,
            fieldLabel: getFieldLabel(suggestion.field),
            value: Array.isArray(suggestion.value)
                ? suggestion.value.map((item) => String(item))
                : String(suggestion.value ?? ""),
            rationale: typeof suggestion.rationale === "string" ? suggestion.rationale : undefined,
            sourceLabel: "Copilot protocol update",
            affectedPaths: [suggestion.field],
        };
    }

    if (artifactType === "criteria_card") {
        const criteria = payload as Partial<CriteriaCardPayload> | null;
        if (!Array.isArray(criteria?.inclusion) || !Array.isArray(criteria?.exclusion)) {
            return null;
        }
        return {
            type: "criteria_card",
            inclusion: criteria.inclusion.map((item) => String(item)),
            exclusion: criteria.exclusion.map((item) => String(item)),
            rationale: typeof criteria.rationale === "string" ? criteria.rationale : undefined,
            sourceLabel: "Copilot criteria update",
            affectedPaths: ["eligibility.inclusion", "eligibility.exclusion"],
        };
    }

    return null;
}

export function getProtocolPatchSummary(patch: ProtocolArtifactPatch): string {
    if (patch.type === "criteria_card") {
        return "New inclusion and exclusion criteria are ready to apply.";
    }

    return `${patch.fieldLabel} is ready to update.`;
}

export function normalizeProtocolFieldPath(path: string): string {
    return path.replace(ARRAY_INDEX_PATTERN, "");
}

function pathSegments(path: string): string[] {
    return normalizeProtocolFieldPath(path)
        .split(".")
        .filter(Boolean);
}

export function protocolPathsOverlap(left: string, right: string): boolean {
    const leftSegments = pathSegments(left);
    const rightSegments = pathSegments(right);
    const shortest = Math.min(leftSegments.length, rightSegments.length);

    for (let index = 0; index < shortest; index += 1) {
        if (leftSegments[index] !== rightSegments[index]) {
            return false;
        }
    }

    return true;
}

export function protocolPatchConflictsWithTrackedPaths(
    patch: ProtocolArtifactPatch,
    trackedPaths: Iterable<string>
): boolean {
    const tracked = Array.from(trackedPaths);
    return patch.affectedPaths.some((affectedPath) =>
        tracked.some((trackedPath) => protocolPathsOverlap(affectedPath, trackedPath))
    );
}
