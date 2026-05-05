/**
 * AI Type Definitions
 * Core types for the AI integration system
 */

import type { ContextCaptureTarget } from "./context-capture";
import type {
    AgentMode,
    RunAbnormalEndClassification,
    RunDurabilityState,
    RunFinalizationState,
    RunPhase,
    RunStatus,
} from "./agent";

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

export type UserInputResolutionKind =
    | "answered"
    | "accept_recommended"
    | "cancelled";

export type ClarificationFallbackAction =
    | "use_recommended_default"
    | "bounded_terminal_decision"
    | "truthful_stop";

export type UserInputRequest = {
    callId: string;
    /** Stable identity for the current single-question request payload. */
    questionId?: string;
    sourceRunId?: string;
    question: string;
    questionType: UserInputQuestionType;
    options?: UserInputOption[];
    /** Short category label displayed as a tag/chip (e.g., "Providers", "Scope"). Max ~12 chars. */
    header?: string;
    context?: string;
    /** Stable loop-control key for repeated clarification detection. */
    decisionBoundaryKey?: string;
    /** Recommended default answer the user can accept directly when safe. */
    recommendedAnswer?: string;
    /** Short explanation for why the recommended default is safe. */
    recommendedReason?: string;
    /** Client-visible resolution state for replayed or stored requests. */
    resolution?: UserInputResolutionKind;
    /** Client-visible answered flag for existing timeline/storage bridges. */
    answered?: boolean;
    /** Client-visible resolved answer text, when present. */
    answer?: string;
};

export type UserInputResolution = {
    sourceRunId: string;
    callId: string;
    /** Stable question identity carried forward from the blocked request when available. */
    questionId?: string;
    resolution: UserInputResolutionKind;
    answerText?: string;
    selectedOptions?: string[];
    answeredAt: string;
    decisionBoundaryKey?: string;
};

export type RuntimeSendOverrides = {
    replaceRunId?: string | null;
    continueFromRunId?: string | null;
    preferContinueFromRunId?: string | null;
    suppressUserMessageAppend?: boolean;
    userInputResolution?: UserInputResolution;
};

export type StreamCancelReason = "user" | "superseded" | "unmount";

export type AIErrorKind =
    | "provider_request"
    | "model_capability"
    | "tool_call_parse"
    | "tool_schema_validation"
    | "missing_prerequisite"
    | "plan_execution"
    | "autonomy_blocked"
    | "run_conflict"
    | "database_connection"
    | "runtime";

export type AIErrorSource =
    | "provider_request"
    | "request_policy"
    | "provider_tool_call"
    | "tool_validator"
    | "tool_prerequisite_gate"
    | "plan_execution"
    | "autonomy_policy"
    | "conversation_run_lock"
    | "database_connection"
    | "runtime";

export type AIErrorEnvelope = {
    kind: AIErrorKind | string;
    code: string;
    retryable: boolean;
    source: AIErrorSource | string;
    message: string;
    status?: number;
    headers?: Record<string, string>;
    runId?: string;
    activeRunId?: string;
    replaceRunId?: string;
    lastActivityAt?: string;
    recoveryRecommendation?: RunRecoveryRecommendation;
};

export type RunRecoveryRecommendation =
    | "reconnect"
    | "continue_from_checkpoint"
    | "continue_from_durable_state"
    | "retry"
    | "stop_and_retry"
    | "terminal";

export type RunRecoveryReplayableChunk = {
    sequence: number;
    chunk: AIStreamChunk;
};

export type SyntheticTerminalReconciliationEvent = {
    chunk: AIStreamChunk;
};

export type RunRecoveryResponse = {
    conversationId: string;
    runId: string;
    runStatus: RunStatus | "missing";
    isActive: boolean;
    runPhase?: RunPhase | null;
    phaseEnteredAt?: string | null;
    lastActivityAt: string | null;
    lastDurableProgressAt?: string | null;
    durabilityState?: RunDurabilityState | null;
    durabilityDegradedReason?: string | null;
    finalizationState?: RunFinalizationState | null;
    lastSequence: number | null;
    replayableEvents: RunRecoveryReplayableChunk[];
    terminalEvent: SyntheticTerminalReconciliationEvent | null;
    recoveryRecommendation: RunRecoveryRecommendation;
    abnormalEndClassification?: RunAbnormalEndClassification | null;
};

export type ToolResultArtifact = {
    artifactId: string;
    artifactType: string;
    artifactTitle: string;
    artifactStatus: string;
    artifactPayload?: unknown;
    artifactVersion?: number;
    /**
     * Internal visibility hint used by the parent loop when deciding whether to
     * emit an artifact chunk for this result.
     */
    emitToClient?: boolean;
};

export type ToolBlockedReason = "disabled_by_autonomy" | "approval_required";

export type ToolResult = {
    callId: string;
    result: unknown;
    error?: string;
    errorMeta?: AIErrorEnvelope;
    /** Structured delegated/direct block signal for non-executed autonomy outcomes. */
    blockedByAutonomy?: boolean;
    /** Why execution was blocked by autonomy policy. */
    blockedReason?: ToolBlockedReason;
    /** When true, the tool requires user input before the agent can continue. */
    requiresUserInput?: boolean;
    /** Structured request for user input (present when requiresUserInput is true). */
    userInputRequest?: UserInputRequest;
    /** Canonical artifact metadata emitted by direct or delegated execution. */
    artifacts?: ToolResultArtifact[];
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
    agentMode?: AgentMode;
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
    /** Explicit active run identity this request intends to replace. */
    replaceRunId?: string;
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
    /**
     * Internal-only parent run lineage. The server sets this when a request
     * is a true continuation of a prior blocked or recoverable run.
     */
    parentRunId?: string;
    /**
     * Continue from proven persisted state owned by an earlier run.
     * The server validates this run before using it as continuation input.
     */
    continueFromRunId?: string;
    /**
     * Best-effort continuation target for retry/replace flows.
     * If no safe durable source exists, the server falls back to a fresh retry.
     */
    preferContinueFromRunId?: string;
    /**
     * When false, the server treats the current request as reusing an already
     * persisted user turn and avoids double-writing it.
     */
    persistUserMessage?: boolean;
    /**
     * Canonical content of the already-persisted user turn when the request is
     * reusing it without persisting a duplicate.
     */
    persistedUserMessageContent?: string;
    /**
     * Optional persisted message identifier for stronger deduplication when the
     * caller knows it.
     */
    persistedUserMessageId?: string;
    /**
     * Structured clarification resolution bound to a prior blocked request.
     * This is authoritative runtime input, not a plain user turn.
     */
    userInputResolution?: UserInputResolution;
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
        | "user_input_required"
        | "user_input_resolved";
    content?: string;
    /**
     * Recovery replay may restore authoritative assistant content as a full
     * snapshot rather than an append-only live delta.
     */
    contentMode?: "append" | "replace";
    /** True when this chunk came from recovery replay rather than the live stream. */
    replay?: boolean;
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
    userInputResolution?: UserInputResolution;
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
