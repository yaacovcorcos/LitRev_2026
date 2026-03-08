/**
 * Agent Mode Router
 * Rule-based routing that classifies user messages into agent modes.
 * Pure module — no server-only, no DB imports. Importable from client + server.
 * (planC Phase 4.1)
 */

import type { AgentMode } from "@/types/agent";
import { isScopingModeEnabled, isDelegationEnabled } from "@/lib/agent/feature-flags";

export type RouterPage = "draft" | "protocol" | "ledger" | "study" | "overview" | "notes" | "memory";
export type RouterProjectState = {
    hasProtocol?: boolean;
};

export interface AgentModeConfig {
    systemPromptKey: AgentMode;
    /** Tool names allowed in this mode. General-mode scoping is contextualized separately. */
    allowedTools: string[];
    memoryScope: "project" | "study" | "user";
    description: string;
}

export const GENERAL_PROJECT_CORE_TOOLS: string[] = [
    "read_protocol",
    "read_ledger",
    "read_study_content",
    "inspect_memory",
    "store_memory",
    "forget_memory",
    "list_projects",
    "open_project",
    "create_project",
    "ask_user",
];

export const DELEGATION_TOOL_NAMES = [
    "delegate_search",
    "delegate_screening",
    "delegate_protocol",
] as const;

const GENERAL_PROJECT_DELEGATION_TOOLS: string[] = [...DELEGATION_TOOL_NAMES];

export const GENERAL_GLOBAL_TOOLS: string[] = [
    "search_pubmed",
    "search_semantic_scholar",
    "search_openalex",
    "inspect_memory",
    "store_memory",
    "forget_memory",
    "list_projects",
    "open_project",
    "create_project",
    "ask_user",
];

export const AGENT_MODE_CONFIG: Record<AgentMode, AgentModeConfig> = {
    protocol: { systemPromptKey: "protocol", allowedTools: ["update_protocol", "update_criteria", "update_study", "search_pubmed", "search_semantic_scholar", "search_openalex", "store_memory", "forget_memory", "inspect_memory", "ask_user"], memoryScope: "project", description: "Defining PICO and criteria" },
    scoping: { systemPromptKey: "scoping", allowedTools: ["search_pubmed", "search_semantic_scholar", "search_openalex", "recommend_studies", "store_memory", "forget_memory", "inspect_memory", "list_projects", "open_project", "ask_user"], memoryScope: "project", description: "Exploring the literature landscape" },
    search: { systemPromptKey: "search", allowedTools: ["search_pubmed", "search_semantic_scholar", "search_openalex", "add_to_ledger", "recommend_studies", "read_protocol", "update_study", "store_memory", "forget_memory", "inspect_memory", "ask_user"], memoryScope: "project", description: "Finding studies" },
    screening: { systemPromptKey: "screening", allowedTools: ["bulk_screening", "exclude_study", "delete_study", "extract_pdf", "read_study_content", "update_study", "store_memory", "forget_memory", "inspect_memory", "ask_user"], memoryScope: "study", description: "Evaluating studies" },
    drafting: { systemPromptKey: "drafting", allowedTools: ["update_note", "read_study_content", "read_protocol", "read_ledger", "update_study", "store_memory", "forget_memory", "inspect_memory", "ask_user"], memoryScope: "project", description: "Writing sections" },
    qa: { systemPromptKey: "qa", allowedTools: ["search_pubmed", "search_semantic_scholar", "search_openalex", "read_study_content", "read_protocol", "read_ledger", "update_study", "store_memory", "forget_memory", "inspect_memory", "ask_user"], memoryScope: "project", description: "Checking citations" },
    general: { systemPromptKey: "general", allowedTools: GENERAL_PROJECT_CORE_TOOLS, memoryScope: "project", description: "General conversation" },
};

/**
 * Get the effective allowed tools for a mode in a given scope.
 * General mode is always explicitly scoped; it never falls back to "all tools".
 */
export function getContextualAllowedTools(
    mode: AgentMode,
    scope: "project" | "global",
): string[] {
    if (mode !== "general") {
        return AGENT_MODE_CONFIG[mode].allowedTools;
    }

    if (scope === "global") {
        return GENERAL_GLOBAL_TOOLS;
    }

    if (isDelegationEnabled()) {
        return [...GENERAL_PROJECT_CORE_TOOLS, ...GENERAL_PROJECT_DELEGATION_TOOLS];
    }

    return GENERAL_PROJECT_CORE_TOOLS;
}

/**
 * Backwards-compatible project-scope view of the allowed tool set.
 */
export function getEffectiveAllowedTools(mode: AgentMode): string[] {
    return getContextualAllowedTools(mode, "project");
}

/**
 * Rule-based routing. Page takes priority for "protocol" only;
 * everything else is message-driven, checked in priority order.
 */
export function routeToAgent(message: string, currentPage: RouterPage, projectState?: RouterProjectState): AgentMode {
    // 1. Page-driven: protocol page always → protocol mode
    if (currentPage === "protocol") return "protocol";

    // 2. Message-driven rules (priority order)
    const msg = message.toLowerCase();
    const hasProtocol = projectState?.hasProtocol ?? true;
    const scopingEnabled = isScopingModeEnabled();
    if (/pico|criteria|inclusion|exclusion|eligib/.test(msg)) return "protocol";
    // Explicit ledger-delete intents route to screening mode (delete_study tool surface),
    // rather than relying on general-mode's all-tools fallback.
    if (/\b(?:delete|purge|remove)\b[\s\S]*\b(?:study|ledger)\b/.test(msg)) return "screening";
    if (/landscape|scoping|what.*out there|what.*been (?:done|studied)|research question|exploratory|feasib|is there enough/.test(msg)) {
        return scopingEnabled ? "scoping" : "search";
    }
    if (!hasProtocol && /search|find stud|pubmed|semantic scholar|openalex|look for|literature|recommend/.test(msg)) {
        return scopingEnabled ? "scoping" : "search";
    }
    if (/search|find stud|pubmed|semantic scholar|openalex|look for|literature|recommend/.test(msg)) return "search";
    if (/screen|triage|evaluat|review against|match criteria/.test(msg)) return "screening";
    if (/write|draft|compose|methods|results|discussion|introduction/.test(msg)) return "drafting";
    if (/check|verify|cite|unsupported|claim|conflict/.test(msg)) return "qa";

    return "general";
}
