/**
 * AI Tool Interface
 * Base definitions for AI tools (PubMed search, web search, etc.)
 * Currently no-op, ready for future implementation
 */

import type { ToolDefinition, ToolResult } from "@/types/ai";

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
 * Placeholder tools for future implementation
 * These are no-op for now but define the interface
 */
export const PLACEHOLDER_TOOLS: AITool[] = [
    // Future: PubMed Search Tool
    // {
    //   definition: {
    //     name: "search_pubmed",
    //     description: "Search PubMed for research articles",
    //     parameters: {
    //       type: "object",
    //       properties: {
    //         query: { type: "string", description: "Search query" },
    //         maxResults: { type: "number", description: "Maximum results to return" },
    //       },
    //       required: ["query"],
    //     },
    //   },
    //   execute: async (args) => ({ callId: "", result: null }),
    // },
];

/**
 * Tool registry - will be populated as tools are implemented
 */
export const AVAILABLE_TOOLS: AITool[] = [];

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
