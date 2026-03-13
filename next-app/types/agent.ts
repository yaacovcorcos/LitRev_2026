/**
 * Agent & Run Type Definitions
 * Typed unions for the agent run system (planC Phase 0.3)
 */

// ── Agent Modes ──────────────────────────────────────────────────────────────

export const AGENT_MODES = [
    "protocol",
    "scoping",
    "search",
    "screening",
    "drafting",
    "qa",
    "general",
] as const;

export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_MODE_META: Record<AgentMode, { label: string; icon: string; description: string }> = {
    protocol: { label: "Protocol", icon: "description", description: "Defining PICO, criteria, and review protocol" },
    scoping: { label: "Scoping", icon: "travel_explore", description: "Mapping literature landscape before protocol lock-in" },
    search: { label: "Search", icon: "search", description: "Finding studies via PubMed and other sources" },
    screening: { label: "Screening", icon: "filter_list", description: "Evaluating studies against criteria" },
    drafting: { label: "Drafting", icon: "edit_note", description: "Writing review sections" },
    qa: { label: "QA", icon: "fact_check", description: "Checking citations, claims, and completeness" },
    general: { label: "General", icon: "chat", description: "General conversation and questions" },
};

// ── Run Status ───────────────────────────────────────────────────────────────

export type RunStatus = "running" | "completed" | "failed" | "cancelled" | "paused";

export type RunTrigger = "user_message" | "proactive" | "event";

export type RunFinalizationState =
    | "not_started"
    | "in_progress"
    | "completed"
    | "failed";

export type RunDurabilityState =
    | "durable"
    | "degraded";

export type RunAbnormalEndClassification =
    | "client_abort"
    | "network_disconnect"
    | "terminal_generated_but_not_observed"
    | "finalization_failed"
    | "recovery_required_persistence_failed"
    | "no_forward_durable_progress"
    | "unknown";

// ── Run Event Types ──────────────────────────────────────────────────────────

export type RunEventType =
    | "message"
    | "tool_call"
    | "tool_result"
    | "user_input_required"
    | "artifact_proposed"
    | "artifact_reviewed"
    | "memory_retrieval"
    | "context_assembly"
    | "plan_proposed"
    | "plan_approved"
    | "checkpoint"
    | "error";

// ── Client-facing data shapes (matching Prisma models) ──────────────────────

export interface AgentRunData {
    id: string;
    projectId: string;
    conversationId: string | null;
    userId: string | null;
    parentRunId?: string | null;
    rootRunId?: string | null;
    trigger: RunTrigger;
    agentMode: AgentMode;
    status: RunStatus;
    model: string | null;
    costTokensIn: number;
    costTokensOut: number;
    startedAt: string;
    lastActivityAt: string;
    lastDurableProgressAt: string;
    durabilityState: RunDurabilityState;
    durabilityDegradedReason: string | null;
    finalizationState: RunFinalizationState;
    abnormalEndClassification: RunAbnormalEndClassification | null;
    completedAt: string | null;
}

export interface RunLineageNodeData extends AgentRunData {
    parentRunId: string | null;
    rootRunId: string | null;
    children: RunLineageNodeData[];
}

export interface RunEventData {
    id: string;
    runId: string;
    sequence: number;
    type: RunEventType;
    payload: unknown;
    toolName: string | null;
    artifactId: string | null;
    messageRole: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
    errorCode: string | null;
    durationMs: number | null;
    createdAt: string;
}

// ── Autonomy Levels ──────────────────────────────────────────────────────────

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
    0: "Disabled",
    1: "Suggest",
    2: "Propose",
    3: "Auto-notify",
    4: "Auto-silent",
};

export type AutonomyPreset = "manual" | "assisted" | "autonomous" | "custom";

export interface AutonomyConfigData {
    id: string;
    userId: string | null;
    projectId: string | null;
    preset: AutonomyPreset;
    toolOverrides: Record<string, AutonomyLevel>;
}

// ── Tool Autonomy Metadata ───────────────────────────────────────────────────

export interface ToolAutonomyMeta {
    defaultLevel: AutonomyLevel;
    allowedRange: [AutonomyLevel, AutonomyLevel];
    hardCap?: AutonomyLevel;
}

/** Hard safety caps — cannot be overridden by any config */
export const HARD_CAPS: Record<string, AutonomyLevel> = {
    update_protocol: 2,
    update_criteria: 2,
    update_study: 2,
    bulk_screening: 2,
    update_note: 2,
    exclude_study: 2,
    delete_study: 2,
    store_memory: 2,
    forget_memory: 2,
    create_project: 2,
};
