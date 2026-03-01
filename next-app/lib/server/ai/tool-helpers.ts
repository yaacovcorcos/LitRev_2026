/**
 * Pure helper functions for tool → artifact mapping, ledger context,
 * scoping workflows, and tool definition filtering.
 *
 * Extracted from ai-service.ts — no dependency on AIService class.
 */

import type { ArtifactType } from "@/types/artifacts";
import type { AgentMode } from "@/types/agent";
import type { ToolCall, ToolDefinition } from "@/types/ai";
import type { PlanPayload, ScopingReportPayload } from "@/types/artifacts";
import { getEffectiveAllowedTools } from "@/lib/agent/router";
import { getToolDefinitions, getTool, resolveAutonomyLevel } from "./tools";
import { getToolAutonomyLevel } from "@/lib/server/agent/autonomy";
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
        store_memory: "memory_proposal",
        forget_memory: "memory_forget_proposal",
        update_note: "draft_diff",
        exclude_study: "study_proposal",
        update_study: "study_update",
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
        case "store_memory":
            return `Remember: ${args.key ?? "preference"}`;
        case "forget_memory":
            return `Forget: ${args.key ?? "memory"}`;
        case "update_note":
            return `Draft: ${args.section ?? "section"}`;
        case "exclude_study":
            return `Exclude: ${args.reason ?? "study"}`;
        case "update_study":
            return "Study metadata update";
        default:
            return toolName;
    }
}

/** Map tool name → progress message for streaming indicator */
export function mapToolToProgressMessage(toolName: string): string {
    const messages: Record<string, string> = {
        search_pubmed: "Searching PubMed...",
        add_to_ledger: "Adding study to ledger...",
        exclude_study: "Excluding study...",
        delete_study: "Deleting study from ledger...",
        fetch_open_pdf: "Fetching free full-text PDF...",
        extract_pdf: "Extracting PDF data...",
        bulk_screening: "Screening studies...",
        update_protocol: "Updating protocol...",
        update_note: "Writing draft...",
        update_study: "Preparing study update...",
        retrieve_memory: "Retrieving memories...",
        create_note: "Creating note...",
        read_study_content: "Reading study PDF...",
        read_protocol: "Reading protocol...",
        read_ledger: "Reading ledger...",
        store_memory: "Saving to memory...",
        forget_memory: "Preparing forget proposal...",
        inspect_memory: "Inspecting memory...",
        search_semantic_scholar: "Searching Semantic Scholar...",
        recommend_studies: "Finding recommendations...",
        delegate_search: "Delegating search workflow...",
        delegate_screening: "Delegating screening workflow...",
        delegate_protocol: "Delegating protocol workflow...",
    };
    return messages[toolName] ?? `Running ${toolName}...`;
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
}): ToolDefinition[] {
    const { agentMode, scope, studyLedger } = params;
    const defs = getToolDefinitions(agentMode, scope);
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

export function shouldUseScopingBatchPlan(params: {
    agentMode: AgentMode;
    userMessage: string;
    autonomyConfig: { preset: string; toolOverrides: unknown };
}): boolean {
    const { agentMode, userMessage, autonomyConfig } = params;
    if (agentMode !== "scoping") return false;

    const trimmed = userMessage.trim();
    if (!trimmed) return false;
    if (/^(yes|yep|yeah|go ahead|proceed|ok|okay|question\s*#?\d+|option\s*#?\d+)$/i.test(trimmed)) {
        return false;
    }

    const normalizedAutonomy = {
        preset: autonomyConfig.preset,
        toolOverrides: (autonomyConfig.toolOverrides ?? {}) as Record<string, unknown>,
    };

    const pubmedLevel = resolveAutonomyLevel(
        "search_pubmed",
        getToolAutonomyLevel("search_pubmed", normalizedAutonomy),
        getTool("search_pubmed")?.autonomy
    );
    const semanticLevel = resolveAutonomyLevel(
        "search_semantic_scholar",
        getToolAutonomyLevel("search_semantic_scholar", normalizedAutonomy),
        getTool("search_semantic_scholar")?.autonomy
    );

    return pubmedLevel <= 1 || semanticLevel <= 1;
}

export function buildScopingSearchPackPlan(params: { includeRecommendations: boolean }): PlanPayload {
    const steps: PlanPayload["steps"] = [
        {
            label: "Run broad landscape search in PubMed",
            toolName: "search_pubmed",
            description: "High-recall query with topic synonyms and broad framing",
            status: "pending",
        },
        {
            label: "Run interdisciplinary landscape search",
            toolName: "search_semantic_scholar",
            description: "Cross-domain query to capture non-biomedical coverage",
            status: "pending",
        },
        {
            label: "Run method-focused search",
            toolName: "search_pubmed",
            description: "Target trial/review design patterns and methodology signals",
            status: "pending",
        },
        {
            label: "Run gap-focused follow-up search",
            toolName: "search_semantic_scholar",
            description: "Probe likely evidence gaps by population/outcome variants",
            status: "pending",
        },
    ];
    if (params.includeRecommendations) {
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
}): { content: string; report: ScopingReportPayload | null } {
    const { agentMode, fullContent, userMessage, hasHandoffSelection } = params;
    if (agentMode !== "scoping" || !fullContent.trim() || hasHandoffSelection) {
        return { content: fullContent, report: null };
    }

    const extractedReport = extractScopingReportFromText(fullContent);
    const report = extractedReport ?? buildFallbackScopingReport(userMessage);
    const content = appendScopingReportComment(stripScopingReportMarkup(fullContent), report);
    return { content, report };
}
