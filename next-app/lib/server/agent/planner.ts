/**
 * Plan-before-act
 * Detects multi-step workflows and generates execution plans.
 * (planC Phase 2 + Phase 5 validation)
 */

import "server-only";
import type { PlanPayload, PlanStep } from "@/types/artifacts";
import { PlanSchema } from "@/types/artifacts";
import { AVAILABLE_TOOLS } from "@/lib/server/ai/tools/base";

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
        update_protocol: ["criteria", "inclusion", "exclusion", "pico", "population", "intervention"],
        update_note: ["draft", "write", "section"],
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
 * Returns null if the generated plan fails validation (safe fallback —
 * callers should skip plan creation and continue normal chat).
 *
 * @param allowedToolNames - Mode-filtered tool names. If provided, plan steps
 *   referencing tools outside this set are rejected. Pass undefined to allow all.
 */
export async function generatePlan(
    message: string,
    context: PlanContext,
    allowedToolNames?: string[]
): Promise<PlanPayload | null> {
    // For Phase 2, use heuristic plan generation.
    // Full AI-powered planning (with a fast model call) is Phase 4.
    const raw = generateHeuristicPlan(message, context);
    return validatePlan(raw, allowedToolNames);
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
            label: "Update protocol criteria",
            toolName: "update_protocol",
            description: "Refine the review protocol",
            status: "pending",
        });
    }

    // Draft step
    if (/\b(?:draft|write|section|summary)\b/.test(lower)) {
        steps.push({
            label: "Draft review section",
            toolName: "update_note",
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

// ── Plan validation ─────────────────────────────────────────────────────────

const REGISTERED_TOOL_NAMES = new Set(AVAILABLE_TOOLS.map((t) => t.definition.name));

/**
 * Validate a plan payload against the Zod schema and cross-check tool references.
 * Returns the validated plan, or null if validation fails.
 *
 * @param allowedToolNames - If provided, tool references are checked against this
 *   mode-filtered set instead of the global registry. This ensures plans are
 *   actionable within the current agent mode.
 */
export function validatePlan(raw: unknown, allowedToolNames?: string[]): PlanPayload | null {
    // 1. Structural validation via Zod
    const parsed = PlanSchema.safeParse(raw);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        console.warn(`[planner] Plan failed Zod validation: ${issues}`);
        return null;
    }

    const plan = parsed.data as PlanPayload;

    // 2. Must have at least one step
    if (plan.steps.length === 0) {
        console.warn("[planner] Plan has zero steps");
        return null;
    }

    // 3. Cross-check: every step must be actionable with a valid tool.
    //    If allowedToolNames is provided (mode-filtered), check against that set;
    //    otherwise fall back to global registry.
    const validTools = allowedToolNames
        ? new Set(allowedToolNames)
        : REGISTERED_TOOL_NAMES;

    for (const step of plan.steps) {
        if (!step.toolName) {
            console.warn("[planner] Plan contains non-executable step without toolName");
            return null;
        }
        if (step.toolName && !validTools.has(step.toolName)) {
            console.warn(`[planner] Plan references disallowed tool: ${step.toolName}`);
            return null;
        }
    }

    // 4. Consistency: estimatedActions should match steps.length
    if (plan.estimatedActions !== plan.steps.length) {
        // Auto-fix rather than reject — this is a soft invariant
        plan.estimatedActions = plan.steps.length;
    }

    return plan;
}
