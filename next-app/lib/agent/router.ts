/**
 * Agent Mode Router
 * Rule-based routing that classifies user messages into agent modes.
 * Pure module — no server-only, no DB imports. Importable from client + server.
 * (planC Phase 4.1)
 */

import type { AgentMode } from "@/types/agent";

export type RouterPage = "draft" | "protocol" | "ledger" | "study" | "overview" | "notes";

export interface AgentModeConfig {
    systemPromptKey: AgentMode;
    /** Tool names allowed in this mode. Empty array = all tools (no restriction). */
    allowedTools: string[];
    memoryScope: "project" | "study" | "user";
    description: string;
}

export const AGENT_MODE_CONFIG: Record<AgentMode, AgentModeConfig> = {
    protocol: { systemPromptKey: "protocol", allowedTools: ["update_protocol", "update_study", "search_pubmed", "search_semantic_scholar", "store_memory"], memoryScope: "project", description: "Defining PICO and criteria" },
    search: { systemPromptKey: "search", allowedTools: ["search_pubmed", "search_semantic_scholar", "add_to_ledger", "recommend_studies", "update_study", "store_memory"], memoryScope: "project", description: "Finding studies" },
    screening: { systemPromptKey: "screening", allowedTools: ["bulk_screening", "exclude_study", "extract_pdf", "read_study_content", "update_study", "store_memory"], memoryScope: "study", description: "Evaluating studies" },
    drafting: { systemPromptKey: "drafting", allowedTools: ["update_note", "read_study_content", "update_study", "store_memory"], memoryScope: "project", description: "Writing sections" },
    qa: { systemPromptKey: "qa", allowedTools: ["search_pubmed", "search_semantic_scholar", "read_study_content", "update_study", "store_memory"], memoryScope: "project", description: "Checking citations" },
    general: { systemPromptKey: "general", allowedTools: [], memoryScope: "project", description: "General conversation" },
};

/**
 * Rule-based routing. Page takes priority for "protocol" only;
 * everything else is message-driven, checked in priority order.
 */
export function routeToAgent(message: string, currentPage: RouterPage): AgentMode {
    // 1. Page-driven: protocol page always → protocol mode
    if (currentPage === "protocol") return "protocol";

    // 2. Message-driven rules (priority order)
    const msg = message.toLowerCase();
    if (/pico|criteria|inclusion|exclusion|eligib/.test(msg)) return "protocol";
    if (/search|find stud|pubmed|semantic scholar|look for|literature|recommend/.test(msg)) return "search";
    if (/screen|triage|evaluat|review against|match criteria/.test(msg)) return "screening";
    if (/write|draft|compose|methods|results|discussion|introduction/.test(msg)) return "drafting";
    if (/check|verify|cite|unsupported|claim|conflict/.test(msg)) return "qa";

    return "general";
}
