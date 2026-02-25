/**
 * AI Type Definitions
 * Core types for the AI integration system
 */

// Copilot page context (which project tab the user is on)
export type CopilotPage = "draft" | "protocol" | "ledger" | "study" | "overview" | "notes" | "memory" | "ai";

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

// Clickable choice option (AI-generated quick replies)
export type ChoiceOption = {
    label: string;
    value: string;
    icon?: string;
};

export type ConversationMessageAttachment = {
    fileAssetId: string;
    filename: string;
    mimeType: string;
    size: number;
    isExisting?: boolean;
};

export type AITone = "standard" | "deep";
export type ReasoningMode = "off" | "summary" | "full";

// Chat options
export type ChatOptions = {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    /** User-facing reasoning visibility mode. */
    reasoningMode?: ReasoningMode;
    /** Request provider-native reasoning/thinking parts when supported. */
    includeReasoning?: boolean;
    /** Optional provider reasoning budget (tokens), when supported. */
    reasoningBudgetTokens?: number;
    tone?: AITone;
    additionalContext?: string;
    systemPrompt?: string;
    tools?: ToolDefinition[];
    conversationId?: string;
    projectId?: string;
    studyId?: string;
    userMessageAttachments?: ConversationMessageAttachment[];
    stream?: boolean;
    signal?: AbortSignal;
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
        cachedInputTokens?: number;
    };
};

// Streaming chunk
export type AIStreamChunk = {
    type: "content" | "tool_call" | "tool_result" | "done" | "error"
        | "reasoning_start" | "reasoning_delta" | "reasoning_end"
        | "artifact" | "progress" | "checkpoint"
        | "run_start" | "run_end"
        | "conversation_title"
        | "choices"
        | "plan_step_update"
        | "navigate";
    content?: string;
    error?: string;
    errorStatus?: number;
    errorCode?: string;
    errorHeaders?: Record<string, string>;
    usage?: AIResponse["usage"];
    toolCall?: ToolCall;
    toolResult?: ToolResult;
    toolName?: string;
    // Reasoning chunk fields
    reasoningId?: string;
    reasoningText?: string;
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
    // Loop control metadata (Phase 3)
    stopReason?: string;
    iterationCount?: number;
    toolCallCount?: number;
    // Clickable choices (AI-generated quick replies)
    choices?: ChoiceOption[];
    // Plan step update fields (plan execution)
    planId?: string;
    stepIndex?: number;
    stepStatus?: string;
    // Navigation fields (project management tools)
    navigateUrl?: string;
    navigateProjectId?: string;
    // Conversation identity (server-side source of truth)
    conversationId?: string;
    conversationTitle?: string;
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
