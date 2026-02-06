/**
 * Plan-before-act
 * Detects multi-step workflows and generates execution plans.
 * (planC Phase 2)
 */

import "server-only";
import type { PlanPayload, PlanStep } from "@/types/artifacts";

// ── Multi-step detection ────────────────────────────────────────────────────

/** Conjunction patterns that signal multiple actions */
const MULTI_STEP_PATTERNS = [
    /\band\s+then\b/i,
    /\bfirst\b.*?\bthen\b/i,
    /\bsearch\b.*?\b(?:add|include|screen)\b/i,
    /\bfind\b.*?\b(?:add|include|screen|evaluate)\b/i,
    /\bscreen\b.*?\b(?:exclude|include|accept)\b/i,
    /\bextract\b.*?\b(?:add|include)\b/i,
    /\bfor\s+each\b/i,
    /\ball\s+(?:studies|results)\b/i,
];

/**
 * Heuristic: does this message imply multiple tool calls?
 * Returns true if the message matches multi-step patterns
 * or references 2+ distinct tools.
 */
export function detectMultiStepWorkflow(
    message: string,
    availableTools: string[]
): boolean {
    // Check conjunction patterns
    for (const pattern of MULTI_STEP_PATTERNS) {
        if (pattern.test(message)) return true;
    }

    // Check if message references 2+ tool capabilities
    const toolKeywords: Record<string, string[]> = {
        search_pubmed: ["search", "pubmed", "find studies", "look up", "look for"],
        add_to_ledger: ["add", "include", "ledger", "save study"],
        exclude_study: ["exclude", "remove", "reject"],
        extract_pdf: ["extract", "pdf", "parse"],
        bulk_screening: ["screen", "batch", "screening"],
        update_criteria: ["criteria", "inclusion", "exclusion"],
        edit_draft: ["draft", "write", "section"],
    };

    let toolMatches = 0;
    const lowerMessage = message.toLowerCase();

    for (const toolName of availableTools) {
        const keywords = toolKeywords[toolName];
        if (keywords?.some((kw) => lowerMessage.includes(kw))) {
            toolMatches++;
        }
    }

    return toolMatches >= 2;
}

// ── Plan generation ─────────────────────────────────────────────────────────

interface PlanContext {
    projectId: string;
    hasProtocol: boolean;
    studyCount: number;
}

/**
 * Generate an execution plan from a user message.
 * Uses a lightweight AI call to produce structured plan steps.
 * Falls back to a simple heuristic plan if AI call fails.
 */
export async function generatePlan(
    message: string,
    context: PlanContext
): Promise<PlanPayload> {
    // For Phase 2, use heuristic plan generation.
    // Full AI-powered planning (with a fast model call) is Phase 4.
    return generateHeuristicPlan(message, context);
}

/**
 * Heuristic plan generation — parses the user message for known action patterns.
 */
function generateHeuristicPlan(message: string, _context: PlanContext): PlanPayload {
    const steps: PlanStep[] = [];
    const lower = message.toLowerCase();

    // Search step
    if (/\b(?:search|find|look\s+(?:up|for)|pubmed)\b/.test(lower)) {
        steps.push({
            label: "Search PubMed for relevant studies",
            toolName: "search_pubmed",
            description: "Execute literature search based on your query",
            status: "pending",
        });
    }

    // Extract step
    if (/\b(?:extract|pdf|parse)\b/.test(lower)) {
        steps.push({
            label: "Extract data from PDF",
            toolName: "extract_pdf",
            description: "Parse PDF and extract structured data",
            status: "pending",
        });
    }

    // Screen step
    if (/\b(?:screen|evaluate|filter|batch)\b/.test(lower)) {
        steps.push({
            label: "Screen studies against criteria",
            toolName: "bulk_screening",
            description: "Evaluate each study against inclusion/exclusion criteria",
            status: "pending",
        });
    }

    // Add/include step
    if (/\b(?:add|include|ledger|save|keep)\b/.test(lower)) {
        steps.push({
            label: "Add studies to review ledger",
            toolName: "add_to_ledger",
            description: "Save qualifying studies to the project ledger",
            status: "pending",
        });
    }

    // Exclude step
    if (/\b(?:exclude|remove|reject)\b/.test(lower)) {
        steps.push({
            label: "Exclude non-qualifying studies",
            toolName: "exclude_study",
            description: "Mark studies that don't meet criteria as excluded",
            status: "pending",
        });
    }

    // Criteria step
    if (/\b(?:criteria|inclusion|exclusion)\b/.test(lower)) {
        steps.push({
            label: "Update inclusion/exclusion criteria",
            toolName: "update_criteria",
            description: "Refine the review criteria",
            status: "pending",
        });
    }

    // Draft step
    if (/\b(?:draft|write|section|summary)\b/.test(lower)) {
        steps.push({
            label: "Draft review section",
            toolName: "edit_draft",
            description: "Write or update a section of the review",
            status: "pending",
        });
    }

    // Fallback: at least one step
    if (steps.length === 0) {
        steps.push({
            label: "Process request",
            description: message.slice(0, 80),
            status: "pending",
        });
    }

    return {
        steps,
        estimatedActions: steps.length,
    };
}
