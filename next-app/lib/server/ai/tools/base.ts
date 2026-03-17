/**
 * AI Tool Interface
 * Base definitions for AI tools with Zod validation and autonomy metadata
 * (planC Phase 0.4)
 */

import { z } from "zod";
import type { ToolDefinition, ToolResult } from "@/types/ai";
import { createToolSchemaValidationErrorEnvelope } from "@/lib/ai/error-envelope";
import type { ToolAutonomyMeta, AutonomyLevel, AgentMode } from "@/types/agent";
import type { ProtocolData } from "@/types/protocol";
import { HARD_CAPS } from "@/types/agent";
import { DELEGATION_TOOL_NAMES, getContextualAllowedTools } from "@/lib/agent/router";
import { isDelegationEnabled } from "@/lib/agent/feature-flags";
import { pubmedSearchTool } from "./pubmed-search";
import { addToLedgerTool } from "./add-to-ledger";
import { excludeStudyTool } from "./exclude-study";
import { deleteStudyTool } from "./delete-study";
import { updateProtocolTool } from "./update-protocol";
import { updateCriteriaTool } from "./update-criteria";
import { bulkScreeningTool } from "./bulk-screening";
import { extractPdfTool } from "./extract-pdf";
import { updateNoteTool } from "./update-note";
import { semanticScholarSearchTool } from "./semantic-scholar-search";
import { openAlexSearchTool } from "./openalex-search";
import { recommendStudiesTool } from "./recommend-studies";
import { readStudyContentTool } from "./read-study-content";
import { storeMemoryTool } from "./store-memory";
import { updateStudyTool } from "./update-study";
import { updateStudyDirectTool } from "./update-study-direct";
import { previewStudyPdfUpdateTool } from "./preview-study-pdf-update";
import { forgetMemoryTool } from "./forget-memory";
import { inspectMemoryTool } from "./inspect-memory";
import { listProjectsTool } from "./list-projects";
import { openProjectTool } from "./open-project";
import { createProjectTool } from "./create-project";
import { askUserTool } from "./ask-user";
import { delegateSearchTool } from "./delegate-search";
import { delegateScreeningTool } from "./delegate-screening";
import { delegateProtocolTool } from "./delegate-protocol";
import { readProtocolTool } from "./read-protocol";
import { readLedgerTool } from "./read-ledger";

/**
 * Interface for AI tools that can be called by the AI
 */
export interface AITool {
    /** Tool definition for the AI (JSON Schema for provider API) */
    definition: ToolDefinition;

    /** Zod schema for input validation (optional during migration) */
    inputSchema?: z.ZodType;

    /** Zod schema for output validation (optional during migration) */
    outputSchema?: z.ZodType;

    /** Autonomy metadata — determines approval behavior */
    autonomy?: ToolAutonomyMeta;

    /** Declarative prerequisites required before the tool may execute. */
    prerequisites?: ToolPrerequisiteConfig;

    /** Execute the tool with the given arguments */
    execute(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult>;
}

export type ToolPrerequisiteKind =
    | "project_required"
    | "study_required"
    | "protocol_required"
    | "criteria_required";

export type ToolPrerequisiteBlockedHint = "ask_user" | "stop_with_explanation";

export type ToolPrerequisiteConfig = {
    required: ToolPrerequisiteKind[];
    blockedHint?: ToolPrerequisiteBlockedHint;
};

/** Runtime context passed to tool execution */
export interface ToolExecutionContext {
    projectId?: string;
    studyId?: string;
    userId?: string;
    runId?: string;
    /** Parent run ID when executing inside a sub-agent */
    parentRunId?: string;
    /** Parent-visible conversation ID for artifact routing when available. */
    conversationId?: string;
    /** Cached autonomy configuration to avoid repeated DB reads across delegated tool calls. */
    autonomyConfig?: {
        preset: string;
        toolOverrides: Record<string, unknown>;
    };
    /**
     * Assembled system-context blocks from the parent loop.
     * Delegation tools pass these to sub-agents so they inherit grounded context.
     */
    systemContexts?: {
        projectContext?: string;
        protocolContext?: string;
        ledgerContext?: string;
        memoryContext?: string;
        autonomyContext?: string;
    };
    /**
     * Parsed protocol payload from DB for tools that need structured protocol fields
     * (for example query-planning criteria/year extraction).
     */
    protocolData?: ProtocolData | null;
    /** Parent stream cancellation signal (if available). */
    signal?: AbortSignal;
    autonomyLevel?: AutonomyLevel;
}

/**
 * Tool registry — populated with implemented tools
 */
export const AVAILABLE_TOOLS: AITool[] = [
    pubmedSearchTool,
    semanticScholarSearchTool,
    openAlexSearchTool,
    addToLedgerTool,
    excludeStudyTool,
    deleteStudyTool,
    updateProtocolTool,
    updateCriteriaTool,
    bulkScreeningTool,
    extractPdfTool,
    updateNoteTool,
    recommendStudiesTool,
    readStudyContentTool,
    storeMemoryTool,
    forgetMemoryTool,
    inspectMemoryTool,
    updateStudyTool,
    updateStudyDirectTool,
    previewStudyPdfUpdateTool,
    listProjectsTool,
    openProjectTool,
    createProjectTool,
    askUserTool,
    readProtocolTool,
    readLedgerTool,
    delegateSearchTool,
    delegateScreeningTool,
    delegateProtocolTool,
];

export type ToolScope = "global" | "project";

const GLOBAL_SCOPE_TOOL_ALLOWLIST = new Set<string>([
    "search_pubmed",
    "search_semantic_scholar",
    "search_openalex",
    "store_memory",
    "forget_memory",
    "inspect_memory",
    "list_projects",
    "open_project",
    "create_project",
    "ask_user",
]);

const DELEGATION_TOOL_NAME_SET = new Set<string>(DELEGATION_TOOL_NAMES);

export function isToolAllowedInScope(toolName: string, scope: ToolScope): boolean {
    if (scope === "project") return true;
    return GLOBAL_SCOPE_TOOL_ALLOWLIST.has(toolName);
}

function isToolEnabledByFeatureFlags(toolName: string): boolean {
    if (DELEGATION_TOOL_NAME_SET.has(toolName)) {
        return isDelegationEnabled();
    }
    return true;
}

/**
 * Get tool definitions for the AI, optionally filtered by agent mode.
 * When agentMode is provided and the mode has a non-empty allowedTools list,
 * only those tools are returned. Otherwise all tools are returned.
 * Scope filtering is applied first.
 */
export function getToolDefinitions(agentMode?: AgentMode, scope: ToolScope = "project"): ToolDefinition[] {
    let tools = AVAILABLE_TOOLS.filter((t) =>
        isToolAllowedInScope(t.definition.name, scope)
        && isToolEnabledByFeatureFlags(t.definition.name),
    );

    if (agentMode) {
        const allowedInMode = getContextualAllowedTools(agentMode, scope);
        if (allowedInMode && allowedInMode.length > 0) {
            tools = tools.filter((t) => allowedInMode.includes(t.definition.name));
        }
    }

    return tools.map((t) => t.definition);
}

/**
 * Get a tool by name
 */
export function getTool(name: string): AITool | undefined {
    return AVAILABLE_TOOLS.find((t) => t.definition.name === name);
}

/**
 * Resolve effective autonomy level for a tool, respecting hard caps
 */
export function resolveAutonomyLevel(
    toolName: string,
    configuredLevel: AutonomyLevel,
    toolMeta?: ToolAutonomyMeta
): AutonomyLevel {
    let level = configuredLevel;

    // Respect tool's allowed range
    if (toolMeta) {
        const [min, max] = toolMeta.allowedRange;
        level = Math.max(min, Math.min(max, level)) as AutonomyLevel;
    }

    // Respect hard caps (system safety — cannot be overridden)
    const hardCap = HARD_CAPS[toolName] ?? toolMeta?.hardCap;
    if (hardCap !== undefined && level > hardCap) {
        level = hardCap;
    }

    return level;
}

/**
 * Validate tool input against its Zod schema.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateToolInput(
    tool: AITool,
    args: Record<string, unknown>
): { success: true; data: unknown } | { success: false; error: string; errorMeta: ReturnType<typeof createToolSchemaValidationErrorEnvelope> } {
    if (!tool.inputSchema) {
        return { success: true, data: args };
    }
    const result = tool.inputSchema.safeParse(args);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    const error = `Input validation failed: ${issues}`;
    return {
        success: false,
        error,
        errorMeta: createToolSchemaValidationErrorEnvelope(tool.definition.name),
    };
}

/**
 * Validate tool output against its Zod schema.
 */
export function validateToolOutput(
    tool: AITool,
    output: unknown
): { success: true; data: unknown } | { success: false; error: string } {
    if (!tool.outputSchema) {
        return { success: true, data: output };
    }
    const result = tool.outputSchema.safeParse(output);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, error: `Output validation failed: ${issues}` };
}

/**
 * Execute a tool by name with validation
 */
export async function executeTool(
    name: string,
    args: Record<string, unknown>,
    callId: string,
    context?: ToolExecutionContext
): Promise<ToolResult> {
    const tool = getTool(name);
    if (!tool) {
        return {
            callId,
            result: null,
            error: `Tool not found: ${name}`,
        };
    }

    // 1. Validate input
    const inputValidation = validateToolInput(tool, args);
    if (!inputValidation.success) {
        return {
            callId,
            result: null,
            error: inputValidation.error,
            errorMeta: inputValidation.errorMeta,
        };
    }

    try {
        // 2. Execute tool
        const result = await tool.execute(args, context);

        // 3. Validate output (warn but don't block — output schema is advisory)
        if (result.result !== null && result.result !== undefined) {
            const outputValidation = validateToolOutput(tool, result.result);
            if (!outputValidation.success) {
                console.warn(`[tool:${name}] ${outputValidation.error}`);
            }
        }

        return { ...result, callId };
    } catch (error) {
        return {
            callId,
            result: null,
            error: error instanceof Error ? error.message : "Tool execution failed",
        };
    }
}
