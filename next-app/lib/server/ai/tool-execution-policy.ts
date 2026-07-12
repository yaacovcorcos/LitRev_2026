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
