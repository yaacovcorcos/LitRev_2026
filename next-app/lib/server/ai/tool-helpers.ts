/**
 * Pure helper functions for tool → artifact mapping, ledger context,
 * scoping workflows, and tool definition filtering.
 *
 * Extracted from ai-service.ts — no dependency on AIService class.
 */

import type { AgentMode } from "@/types/agent";
import type { ToolCall, ToolDefinition } from "@/types/ai";
import type { ArtifactType } from "@/types/artifacts";
import type {
    PlanPayload,
    ScopingEntryIntent,
    ScopingReportPayload,
    ScopingWorkflowSnapshot,
} from "@/types/artifacts";
import { getEffectiveAllowedTools } from "@/lib/agent/router";
import { hashToolCall } from "@/lib/agent/loop-controller";
import { getToolDefinitions, getTool, resolveAutonomyLevel } from "./tools";
import { getToolAutonomyLevel } from "@/lib/server/agent/autonomy";
import {
    DEFAULT_SEARCH_SOURCE_POLICY,
    deriveSearchSourcePolicy,
    filterToolDefinitionsBySearchSourcePolicy,
    type SearchSourcePolicy,
} from "@/lib/agent/search-source-policy";
import { normalizeAndClassifyProtocolMutation } from "@/lib/protocol-fields";
import {
    appendScopingReportComment,
    buildFallbackScopingReport,
    extractScopingReportFromText,
    stripScopingReportMarkup,
} from "./scoping";
import type { LedgerCounts, StudyLedgerSnapshot } from "@/lib/server/ledger-utils";

// ── Tool → Artifact Mapping ─────────────────────────────────────────────────

/**
 * Map tool name → artifact type (null if tool doesn't produce artifacts).
 *
 * Only proposal tools belong here — tools whose execute() returns a payload
 * for user review WITHOUT persisting side effects. Action tools (search_pubmed,
 * add_to_ledger, extract_pdf, read_study_content) communicate results through
 * the AI's text response, not artifacts.
 */
export function mapToolToArtifactType(toolName: string): ArtifactType | null {
    const mapping: Record<string, ArtifactType> = {
        bulk_screening: "screening_batch",
        update_protocol: "protocol_suggestion",
        update_criteria: "criteria_card",
        store_memory: "memory_proposal",
        forget_memory: "memory_forget_proposal",
        update_note: "draft_diff",
        exclude_study: "study_proposal",
        update_study: "study_update",
        update_study_direct: "study_update",
        delete_study: "study_deletion",
    };
    return mapping[toolName] ?? null;
}

/** Map tool name → human-readable artifact title */
export function mapToolToArtifactTitle(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
        case "bulk_screening":
            return "Batch screening results";
        case "update_protocol":
            return `Protocol: ${args.field ?? "update"}`;
        case "update_criteria":
            return `Criteria: ${args.type ?? "eligibility"} ${args.action ?? "update"}`;
        case "store_memory":
            return `Remember: ${args.key ?? "preference"}`;
        case "forget_memory":
            return `Forget: ${args.key ?? "memory"}`;
        case "update_note":
            return `Draft: ${args.section ?? "section"}`;
        case "exclude_study":
            return `Exclude: ${args.reason ?? "study"}`;
        case "update_study":
        case "update_study_direct":
            return "Study metadata update";
        case "delete_study":
            return "Delete study from ledger";
        default:
            return toolName;
    }
}

/** Map tool name → progress message for streaming indicator */
export function mapToolToProgressMessage(toolName: string): string {
    const messages: Record<string, string> = {
        search_pubmed: "Searching PubMed",
        add_to_ledger: "Adding study to ledger...",
        exclude_study: "Excluding study...",
        delete_study: "Deleting study from ledger...",
        extract_pdf: "Extracting PDF data...",
        bulk_screening: "Screening studies...",
        update_protocol: "Preparing protocol proposal...",
        update_note: "Preparing draft proposal...",
        update_study: "Preparing study update...",
        update_study_direct: "Applying study update...",
        preview_study_pdf_update: "Previewing PDF study updates...",
        retrieve_memory: "Retrieving memories...",
        create_note: "Creating note...",
        read_study_content: "Reading study PDF...",
        read_protocol: "Reading protocol...",
        read_ledger: "Reading ledger...",
        store_memory: "Saving to memory...",
        forget_memory: "Preparing forget proposal...",
        inspect_memory: "Inspecting memory...",
        search_semantic_scholar: "Searching Semantic Scholar...",
        search_openalex: "Searching OpenAlex...",
        recommend_studies: "Finding recommendations...",
        delegate_search: "Delegating search workflow...",
        delegate_screening: "Delegating screening workflow...",
        delegate_protocol: "Delegating protocol workflow...",
    };
    return messages[toolName] ?? `Running ${toolName}...`;
}

export type DroppedToolCall = {
    id: string;
    name: string;
    reason: string;
};

type UpdateProtocolArgsValidation =
    | { success: true; field: string; repeatKey: string }
    | { success: false; field?: string; error: string; repeatKey: string };

/**
 * Some providers occasionally emit both malformed and valid update_protocol
 * calls in the same turn. When that happens, executing the malformed sibling
 * only adds a noisy failure card while the valid proposal still succeeds.
 *
 * Drop invalid siblings when a valid proposal for the same field exists, and
 * collapse duplicate malformed siblings by semantic failure key so one bad
 * mutation intent does not become a stack of failed cards.
 */
export function dropShadowedInvalidToolCalls(toolCalls: ToolCall[]): {
    toolCalls: ToolCall[];
    dropped: DroppedToolCall[];
} {
    const updateProtocolValidations = new Map<string, UpdateProtocolArgsValidation>();
    const validFields = new Set<string>();
    for (const toolCall of toolCalls) {
        if (toolCall.name !== "update_protocol") continue;
        const validation = validateUpdateProtocolArgs(toolCall.arguments);
        updateProtocolValidations.set(toolCall.id, validation);
        if (validation.success) {
            validFields.add(validation.field);
        }
    }

    const kept: ToolCall[] = [];
    const dropped: DroppedToolCall[] = [];
    const seenInvalidRepeatKeys = new Set<string>();

    for (const toolCall of toolCalls) {
        if (toolCall.name !== "update_protocol") {
            kept.push(toolCall);
            continue;
        }

        const validation = updateProtocolValidations.get(toolCall.id) ?? validateUpdateProtocolArgs(toolCall.arguments);
        if (validation.success) {
            kept.push(toolCall);
            continue;
        }

        if (validation.field && validFields.has(validation.field)) {
            dropped.push({
                id: toolCall.id,
                name: toolCall.name,
                reason: validation.error,
            });
            continue;
        }

        if (seenInvalidRepeatKeys.has(validation.repeatKey)) {
            dropped.push({
                id: toolCall.id,
                name: toolCall.name,
                reason: validation.error,
            });
            continue;
        }

        seenInvalidRepeatKeys.add(validation.repeatKey);
        kept.push(toolCall);
    }

    return { toolCalls: kept, dropped };
}

export function getToolCallRepeatKey(toolCall: ToolCall): string {
    if (toolCall.name !== "update_protocol") {
        return hashToolCall(toolCall.name, toolCall.arguments);
    }

    const validation = validateUpdateProtocolArgs(toolCall.arguments);
    return validation.repeatKey;
}

function validateUpdateProtocolArgs(args: Record<string, unknown>): UpdateProtocolArgsValidation {
    const field = typeof args.field === "string" ? args.field.trim() : "";
    if (!field) {
        return {
            success: false,
            error: "Input validation failed: field is required",
            repeatKey: "update_protocol:__missing_field__:FIELD_REQUIRED",
        };
    }

    const rationale = typeof args.rationale === "string" ? args.rationale.trim() : "";
    if (!rationale) {
        return {
            success: false,
            field,
            error: "Input validation failed: rationale is required",
            repeatKey: `update_protocol:${field}:RATIONALE_REQUIRED`,
        };
    }

    const classification = normalizeAndClassifyProtocolMutation(field, args.value);
    if (!classification.valid) {
        return {
            success: false,
            field,
            error: classification.error,
            repeatKey: classification.repeatKey,
        };
    }

    return { success: true, field, repeatKey: classification.repeatKey };
}

// ── Ledger helper functions for prompt context ───────────────────────────────

export function isStudyLedgerSnapshot(
    ledger: LedgerCounts | StudyLedgerSnapshot | null
): ledger is StudyLedgerSnapshot {
    return !!ledger && typeof ledger === "object" && "counts" in ledger;
}

export function getLedgerCounts(
    ledger: LedgerCounts | StudyLedgerSnapshot | null
): LedgerCounts | null {
    if (!ledger) return null;
    return isStudyLedgerSnapshot(ledger) ? ledger.counts : ledger;
}

export function emptyLedgerCounts(): LedgerCounts {
    return { total: 0, included: 0, excluded: 0, maybe: 0, unscreened: 0 };
}

// ── Context-aware tool definitions ───────────────────────────────────────────

export function getLazyContextPointerCapabilities(agentMode: AgentMode): {
    canReadProtocol: boolean;
    canReadLedger: boolean;
} {
    const allowedTools = getEffectiveAllowedTools(agentMode);
    const unrestricted = allowedTools.length === 0;
    return {
        canReadProtocol: unrestricted || allowedTools.includes("read_protocol"),
        canReadLedger: unrestricted || allowedTools.includes("read_ledger"),
    };
}

export function getContextualToolDefinitions(params: {
    agentMode: AgentMode;
    scope: "project" | "global";
    studyLedger: (LedgerCounts | StudyLedgerSnapshot) | null;
    studyId?: string | null;
    userMessage?: string | null;
    explicitSearchSourceToolNames?: readonly string[] | null;
}): ToolDefinition[] {
    const { agentMode, scope, studyLedger, studyId } = params;
    let defs = getToolDefinitions(agentMode, scope);
    defs = filterToolDefinitionsBySearchSourcePolicy(
        defs,
        deriveSearchSourcePolicy({
            text: params.userMessage,
            explicitToolNames: params.explicitSearchSourceToolNames,
        }),
    );
    if (!studyId) {
        defs = defs.filter((def) => def.name !== "update_study_direct" && def.name !== "preview_study_pdf_update");
    }
    if (agentMode !== "scoping") return defs;
    if (!isStudyLedgerSnapshot(studyLedger)) return defs;
    if (studyLedger.hasRecommendationSeeds) return defs;
    return defs.filter((d) => d.name !== "recommend_studies");
}

// ── Scoping helpers ──────────────────────────────────────────────────────────

export function buildScopingHandoffToolCall(question: string): ToolCall {
    return {
        id: `scoping-handoff-${Date.now()}`,
        name: "update_protocol",
        arguments: {
            field: "researchQuestion",
            value: question,
            rationale: "Selected by user during scoping handoff",
        },
    };
}

export function shouldShowScopingSearchPackPreview(params: {
    agentMode: AgentMode;
    userMessage: string;
    autonomyConfig: { preset: string; toolOverrides: unknown };
    entryIntent?: ScopingEntryIntent;
}): boolean {
    const { agentMode, userMessage, autonomyConfig, entryIntent } = params;
    if (agentMode !== "scoping") return false;
    if (entryIntent === "draft_bootstrap") return false;

    const trimmed = userMessage.trim();
    if (!trimmed) return false;
    if (/^(yes|yep|yeah|go ahead|proceed|ok|okay|question\s*#?\d+|option\s*#?\d+)$/i.test(trimmed)) {
        return false;
    }

    const normalizedAutonomy = {
        preset: autonomyConfig.preset,
        toolOverrides: (autonomyConfig.toolOverrides ?? {}) as Record<string, unknown>,
    };

    const searchSourcePolicy = deriveSearchSourcePolicy(params.userMessage);
    const levels = [
        resolveAutonomyLevel(
            "search_pubmed",
            getToolAutonomyLevel("search_pubmed", normalizedAutonomy),
            getTool("search_pubmed")?.autonomy,
        ),
        ...(searchSourcePolicy.allowSemanticScholar
            ? [resolveAutonomyLevel(
                "search_semantic_scholar",
                getToolAutonomyLevel("search_semantic_scholar", normalizedAutonomy),
                getTool("search_semantic_scholar")?.autonomy,
            )]
            : []),
        ...(searchSourcePolicy.allowOpenAlex
            ? [resolveAutonomyLevel(
                "search_openalex",
                getToolAutonomyLevel("search_openalex", normalizedAutonomy),
                getTool("search_openalex")?.autonomy,
            )]
            : []),
    ];

    return levels.some((level) => level <= 1);
}

/**
 * Deprecated alias retained for backward compatibility with older tests.
 * Blocking search-pack approval is no longer the scoping runtime policy.
 */
export function shouldUseScopingBatchPlan(params: {
    agentMode: AgentMode;
    userMessage: string;
    autonomyConfig: { preset: string; toolOverrides: unknown };
    entryIntent?: ScopingEntryIntent;
}): boolean {
    return shouldShowScopingSearchPackPreview(params);
}

export function buildScopingSearchPackPlan(params: {
    includeRecommendations: boolean;
    sourcePolicy?: SearchSourcePolicy;
}): PlanPayload {
    const sourcePolicy = params.sourcePolicy ?? DEFAULT_SEARCH_SOURCE_POLICY;
    const steps: PlanPayload["steps"] = [
        {
            label: "Run broad landscape search in PubMed",
            toolName: "search_pubmed",
            description: "High-recall query with topic synonyms and broad framing",
            status: "pending",
        },
        {
            label: sourcePolicy.allowOpenAlex
                ? "Run explicitly requested OpenAlex search"
                : "Run focused landscape search in PubMed",
            toolName: sourcePolicy.allowOpenAlex ? "search_openalex" : "search_pubmed",
            description: sourcePolicy.allowOpenAlex
                ? "Use OpenAlex because the user named that source"
                : "Probe exposure, population, or outcome variants in PubMed",
            status: "pending",
        },
        {
            label: "Run method-focused search",
            toolName: "search_pubmed",
            description: "Target trial/review design patterns and methodology signals",
            status: "pending",
        },
        {
            label: sourcePolicy.allowSemanticScholar
                ? "Run explicitly requested Semantic Scholar search"
                : "Run gap-focused follow-up search in PubMed",
            toolName: sourcePolicy.allowSemanticScholar ? "search_semantic_scholar" : "search_pubmed",
            description: sourcePolicy.allowSemanticScholar
                ? "Use Semantic Scholar because the user named that source"
                : "Probe likely evidence gaps by population/outcome variants in PubMed",
            status: "pending",
        },
    ];
    if (params.includeRecommendations && sourcePolicy.allowSemanticScholar) {
        steps.push({
            label: "Expand with recommendation seeding",
            toolName: "recommend_studies",
            description: "Use identifier-backed seeds from the current ledger",
            status: "pending",
        });
    }
    return {
        steps,
        estimatedActions: steps.length,
    };
}

export function finalizeScopingResponse(params: {
    agentMode: AgentMode;
    fullContent: string;
    userMessage: string;
    hasHandoffSelection: boolean;
    workflowSnapshot?: ScopingWorkflowSnapshot;
}): { content: string; report: ScopingReportPayload | null } {
    const { agentMode, fullContent, userMessage, hasHandoffSelection, workflowSnapshot } = params;
    if (agentMode !== "scoping" || !fullContent.trim() || hasHandoffSelection) {
        return { content: fullContent, report: null };
    }

    const extractedReport = extractScopingReportFromText(fullContent);
    const report = extractedReport ?? buildFallbackScopingReport(userMessage);
    const finalReport = workflowSnapshot ? { ...report, workflow: workflowSnapshot } : report;
    const content = appendScopingReportComment(stripScopingReportMarkup(fullContent), finalReport);
    return { content, report: finalReport };
}
