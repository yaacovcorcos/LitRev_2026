/**
 * Proactive Suggestion Engine
 * Derives context-aware suggestion chips from project state.
 * Pure module — no server-only, no DB imports.
 * (planC Phase 4.2)
 */

import type { AgentMode } from "@/types/agent";

export interface ProjectStateSnapshot {
    hasProtocol: boolean;
    studyCount: number;
    unscreenedCount: number;
    includedCount: number;
    excludedCount: number;
    maybeCount: number;
}

export interface SuggestionChip {
    label: string;
    prompt: string;
    icon: string;
    mode: AgentMode;
    description: string;
}

const MAX_CHIPS = 4;

/**
 * Returns up to 4 context-aware suggestion chips based on project state.
 * Chips are ordered by priority (most relevant first).
 */
export function getSuggestions(state: ProjectStateSnapshot): SuggestionChip[] {
    const chips: SuggestionChip[] = [];

    if (!state.hasProtocol) {
        chips.push({
            label: "Define PICO",
            prompt: "Help me formulate my PICO criteria for this systematic review",
            icon: "science",
            mode: "protocol",
            description: "Formulate your research question to guide study selection",
        });
    }

    if (state.hasProtocol && state.studyCount === 0) {
        chips.push({
            label: "Search PubMed",
            prompt: "Search PubMed for studies related to my research question",
            icon: "search",
            mode: "search",
            description: "Find studies matching your protocol criteria",
        });
    }

    if (state.studyCount > 0 && state.unscreenedCount > 0) {
        const n = state.unscreenedCount;
        chips.push({
            label: `Screen ${n} ${n === 1 ? "study" : "studies"}`,
            prompt: `Help me screen the ${n} unscreened studies against my protocol criteria`,
            icon: "filter_list",
            mode: "screening",
            description: `Review ${n} ${n === 1 ? "title and abstract" : "titles and abstracts"} against your protocol`,
        });
    }

    if (state.maybeCount > 0) {
        const n = state.maybeCount;
        chips.push({
            label: `Review ${n} ${n === 1 ? "maybe" : "maybes"}`,
            prompt: `Let's review the ${n} studies marked as "maybe" and decide on inclusion or exclusion`,
            icon: "help_outline",
            mode: "screening",
            description: `Decide on inclusion or exclusion for ${n} borderline ${n === 1 ? "study" : "studies"}`,
        });
    }

    if (state.includedCount >= 3) {
        chips.push({
            label: "Start drafting",
            prompt: "Help me start drafting the introduction section of my literature review",
            icon: "edit_note",
            mode: "drafting",
            description: `Begin writing from your ${state.includedCount} included studies`,
        });
    }

    if (state.includedCount >= 3) {
        chips.push({
            label: "Check citations",
            prompt: "Check my draft for unsupported claims and missing citations",
            icon: "fact_check",
            mode: "qa",
            description: "Verify claims are properly supported by evidence",
        });
    }

    // Always include a general fallback
    chips.push({
        label: "Ask anything",
        prompt: "What can you help me with on this project?",
        icon: "chat",
        mode: "general",
        description: "Get help with any aspect of your project",
    });

    return chips.slice(0, MAX_CHIPS);
}
