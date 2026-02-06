/**
 * AI Type Definitions
 * Core types for the AI integration system
 */

// AI message roles
export type AIRole = "system" | "user" | "assistant" | "tool";

// AI message structure
export type AIMessage = {
    id: string;
    role: AIRole;
    content: string;
    toolCalls?: ToolCall[];
    toolResultId?: string;
    createdAt: string;
};

// Provider & Model configuration
export type AIProviderConfig = {
    id: string;
    name: string;
    models: AIModel[];
};

export type AIModel = {
    id: string;
    name: string;
    contextWindow: number;
    capabilities: ("chat" | "vision" | "tools" | "web-search")[];
};

// Tool definitions (for future PubMed/web search)
export type ToolDefinition = {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
};

export type ToolCall = {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
};

export type ToolResult = {
    callId: string;
    result: unknown;
    error?: string;
};

// Chat options
export type ChatOptions = {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    tools?: ToolDefinition[];
    conversationId?: string;
    projectId?: string;
    studyId?: string;
    stream?: boolean;
};

// Response types
export type AIResponse = {
    id: string;
    content: string;
    model: string;
    toolCalls?: ToolCall[];
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };
};

// Streaming chunk
export type AIStreamChunk = {
    type: "content" | "tool_call" | "tool_result" | "done" | "error"
        | "artifact" | "progress" | "checkpoint"
        | "run_start" | "run_end";
    content?: string;
    error?: string;
    usage?: AIResponse["usage"];
    toolCall?: ToolCall;
    toolResult?: ToolResult;
    // Artifact chunk fields (Phase 1)
    artifactId?: string;
    artifactType?: string;
    artifactStatus?: string;
    artifactTitle?: string;
    artifactPayload?: unknown;
    artifactVersion?: number;
    // Progress chunk fields (Phase 1)
    progressMessage?: string;
    progressCurrent?: number;
    progressTotal?: number;
    // Checkpoint chunk fields (Phase 1)
    checkpointLabel?: string;
    // Run lifecycle fields (Phase 2)
    runId?: string;
    runStatus?: string;
    runCostTokensIn?: number;
    runCostTokensOut?: number;
};

// Memory/Context types
export type ConversationContext = "global" | "project" | "study";

export type AIConversation = {
    id: string;
    context: ConversationContext;
    projectId?: string;
    studyId?: string;
    messages: AIMessage[];
    createdAt: string;
    updatedAt: string;
};

// Usage stats
export type UsageStats = {
    totalTokens: number;
    requestCount: number;
    lastRequestAt: string | null;
};
