/**
 * AI Tool Interface
 * Base definitions for AI tools (PubMed search, web search, etc.)
 */

import type { ToolDefinition, ToolResult } from "@/types/ai";
import { pubmedSearchTool } from "./pubmed-search";
import { addToLedgerTool } from "./add-to-ledger";

/**
 * Interface for AI tools that can be called by the AI
 */
export interface AITool {
    /** Tool definition for the AI */
    definition: ToolDefinition;

    /** Execute the tool with the given arguments */
    execute(args: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * Tool registry — populated with implemented tools
 */
export const AVAILABLE_TOOLS: AITool[] = [
    pubmedSearchTool,
    addToLedgerTool,
];

/**
 * Get tool definitions for the AI
 */
export function getToolDefinitions(): ToolDefinition[] {
    return AVAILABLE_TOOLS.map((tool) => tool.definition);
}

/**
 * Execute a tool by name
 */
export async function executeTool(
    name: string,
    args: Record<string, unknown>,
    callId: string
): Promise<ToolResult> {
    const tool = AVAILABLE_TOOLS.find((t) => t.definition.name === name);
    if (!tool) {
        return {
            callId,
            result: null,
            error: `Tool not found: ${name}`,
        };
    }

    try {
        const result = await tool.execute(args);
        return { ...result, callId };
    } catch (error) {
        return {
            callId,
            result: null,
            error: error instanceof Error ? error.message : "Tool execution failed",
        };
    }
}
