/**
 * AI Tool Interface
 * Base definitions for AI tools with Zod validation and autonomy metadata
 * (planC Phase 0.4)
 */

import { z } from "zod";
import type { ToolDefinition, ToolResult } from "@/types/ai";
import type { ToolAutonomyMeta, AutonomyLevel, AgentMode } from "@/types/agent";
import { HARD_CAPS } from "@/types/agent";
import { AGENT_MODE_CONFIG } from "@/lib/agent/router";
import { pubmedSearchTool } from "./pubmed-search";
import { addToLedgerTool } from "./add-to-ledger";
import { excludeStudyTool } from "./exclude-study";
import { updateCriteriaTool } from "./update-criteria";
import { bulkScreeningTool } from "./bulk-screening";
import { extractPdfTool } from "./extract-pdf";
import { updateNoteTool } from "./update-note";

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

    /** Execute the tool with the given arguments */
    execute(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult>;
}

/** Runtime context passed to tool execution */
export interface ToolExecutionContext {
    projectId?: string;
    userId?: string;
    runId?: string;
    autonomyLevel?: AutonomyLevel;
}

/**
 * Tool registry — populated with implemented tools
 */
export const AVAILABLE_TOOLS: AITool[] = [
    pubmedSearchTool,
    addToLedgerTool,
    excludeStudyTool,
    updateCriteriaTool,
    bulkScreeningTool,
    extractPdfTool,
    updateNoteTool,
];

/**
 * Get tool definitions for the AI, optionally filtered by agent mode.
 * When agentMode is provided and the mode has a non-empty allowedTools list,
 * only those tools are returned. Otherwise all tools are returned.
 */
export function getToolDefinitions(agentMode?: AgentMode): ToolDefinition[] {
    if (agentMode) {
        const allowed = AGENT_MODE_CONFIG[agentMode]?.allowedTools;
        if (allowed && allowed.length > 0) {
            return AVAILABLE_TOOLS
                .filter((t) => allowed.includes(t.definition.name))
                .map((t) => t.definition);
        }
    }
    return AVAILABLE_TOOLS.map((t) => t.definition);
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
): { success: true; data: unknown } | { success: false; error: string } {
    if (!tool.inputSchema) {
        return { success: true, data: args };
    }
    const result = tool.inputSchema.safeParse(args);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, error: `Input validation failed: ${issues}` };
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
