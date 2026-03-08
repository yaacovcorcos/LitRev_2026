/**
 * AI Type Definitions
 * Core types for the AI integration system
 */

import type { ContextCaptureTarget } from "./context-capture";

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

export type UserInputQuestionType = "single_choice" | "yes_no" | "free_text" | "multi_select";

export type UserInputOption = {
    label: string;
    description?: string;
};

export type UserInputRequest = {
    callId: string;
    question: string;
    questionType: UserInputQuestionType;
    options?: UserInputOption[];
    /** Short category label displayed as a tag/chip (e.g., "Providers", "Scope"). Max ~12 chars. */
    header?: string;
    context?: string;
};

export type AIErrorKind =
    | "provider_request"
    | "model_capability"
    | "tool_call_parse"
    | "tool_schema_validation"
    | "missing_prerequisite"
    | "runtime";

export type AIErrorSource =
    | "provider_request"
    | "request_policy"
    | "provider_tool_call"
    | "tool_validator"
    | "tool_prerequisite_gate"
    | "runtime";

export type AIErrorEnvelope = {
    kind: AIErrorKind | string;
    code: string;
    retryable: boolean;
    source: AIErrorSource | string;
    message: string;
    status?: number;
    headers?: Record<string, string>;
};

export type ToolResult = {
    callId: string;
    result: unknown;
    error?: string;
    errorMeta?: AIErrorEnvelope;
    /** When true, the tool requires user input before the agent can continue. */
    requiresUserInput?: boolean;
    /** Structured request for user input (present when requiresUserInput is true). */
    userInputRequest?: UserInputRequest;
};

// Clickable choice option (AI-generated quick replies)
export type ChoiceOption = {
    label: string;
    value: string;
    icon?: string;
};

export type ConversationFileAttachment = {
    fileAssetId: string;
    filename: string;
    mimeType: string;
    size: number;
    isExisting?: boolean;
};

export type ConversationContextAttachment = {
    type: "context_capture";
    target: ContextCaptureTarget;
};

export type ConversationMessageAttachment = ConversationFileAttachment | ConversationContextAttachment;

export type AITone = "standard" | "deep";
export type ReasoningMode = "off" | "summary" | "full";
export type StreamPhase = "idle" | "streaming" | "tool_running" | "completing";

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
    /**
     * Server-derived identity fields. API handlers overwrite these from session context.
     */
    userId?: string;
    workspaceId?: string;
    userMessageAttachments?: ConversationMessageAttachment[];
    contextTargets?: ContextCaptureTarget[];
    /**
     * Correlation key for retry telemetry continuity checks.
     * Present only when the send action is triggered from retry.
     */
    telemetryRequestKey?: string;
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
        | "navigate"
        | "user_input_required";
    content?: string;
    error?: string;
    errorStatus?: number;
    errorCode?: string;
    errorHeaders?: Record<string, string>;
    errorMeta?: AIErrorEnvelope;
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
    /** Provider-observed model ID when available (falls back upstream as needed). */
    actualModel?: string;
    actualModelSource?: "provider" | "requested" | "unknown";
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
    // User input request fields (ask_user tool)
    userInputRequest?: UserInputRequest;
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
