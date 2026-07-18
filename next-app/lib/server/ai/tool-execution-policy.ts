import "server-only";

export type ToolExecutionEffect =
  | "read_only"
  | "idempotent_mutation"
  | "unsafe_mutation"
  | "blocking_decision";

export type InterruptedToolCallRestartPolicy =
  | "restart_read_only"
  | "retry_idempotent_mutation";

export type ToolExecutionPolicy = {
  effect: ToolExecutionEffect;
  interruptedRestartPolicy?: InterruptedToolCallRestartPolicy;
};

export type ToolReliabilityPolicy = {
  /** Null keeps mutation/decision work attached to its owning lifecycle. */
  attemptTimeoutMs: number | null;
  maxAttempts: number;
  minDelayMs: number;
  maxDelayMs: number;
  jitter: number;
};

export const IDEMPOTENT_MUTATION_TOOL_NAMES = [
  "add_to_ledger",
  "bulk_screening",
  "exclude_study",
  "forget_memory",
  "update_study",
  "update_study_direct",
  "update_protocol",
  "update_note",
  "store_memory",
] as const;

const IDEMPOTENT_MUTATION_TOOL_SET = new Set<string>(IDEMPOTENT_MUTATION_TOOL_NAMES);

const READ_ONLY_RESTARTABLE_TOOL_NAMES = [
  "inspect_memory",
  "list_projects",
  "open_project",
  "preview_study_pdf_update",
  "read_ledger",
  "read_protocol",
  "read_study_content",
  "recommend_studies",
  "search_openalex",
  "search_pubmed",
  "search_semantic_scholar",
  "delete_study",
  "update_criteria",
] as const;

const READ_ONLY_RESTARTABLE_TOOL_SET = new Set<string>(READ_ONLY_RESTARTABLE_TOOL_NAMES);

const EXTERNAL_SEARCH_TOOL_NAMES = new Set<string>([
  "recommend_studies",
  "search_openalex",
  "search_pubmed",
  "search_semantic_scholar",
]);

const EXPENSIVE_READ_TOOL_NAMES = new Set<string>([
  "preview_study_pdf_update",
]);

export function getToolExecutionPolicy(toolName: string): ToolExecutionPolicy {
  if (toolName === "ask_user") {
    return { effect: "blocking_decision" };
  }
  if (IDEMPOTENT_MUTATION_TOOL_SET.has(toolName)) {
    return {
      effect: "idempotent_mutation",
      interruptedRestartPolicy: "retry_idempotent_mutation",
    };
  }
  if (READ_ONLY_RESTARTABLE_TOOL_SET.has(toolName)) {
    return {
      effect: "read_only",
      interruptedRestartPolicy: "restart_read_only",
    };
  }
  return { effect: "unsafe_mutation" };
}

export function getToolReliabilityPolicy(toolName: string): ToolReliabilityPolicy {
  const executionPolicy = getToolExecutionPolicy(toolName);
  if (executionPolicy.effect !== "read_only") {
    return {
      attemptTimeoutMs: null,
      maxAttempts: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      jitter: 0,
    };
  }
  if (EXPENSIVE_READ_TOOL_NAMES.has(toolName)) {
    return {
      attemptTimeoutMs: 60_000,
      maxAttempts: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      jitter: 0,
    };
  }
  if (EXTERNAL_SEARCH_TOOL_NAMES.has(toolName)) {
    return {
      attemptTimeoutMs: 20_000,
      maxAttempts: 3,
      minDelayMs: 500,
      maxDelayMs: 15_000,
      jitter: 0.15,
    };
  }
  return {
    attemptTimeoutMs: 15_000,
    maxAttempts: 2,
    minDelayMs: 250,
    maxDelayMs: 3_000,
    jitter: 0.1,
  };
}
