export const MEMORY_AUTHORITY_VALUES = [
  "canonical",
  "confirmed",
  "inferred",
  "proposed",
] as const;

export const MEMORY_POLARITY_VALUES = [
  "affirming",
  "rejecting",
  "neutral",
] as const;

export const MEMORY_SOURCE_VALUES = [
  "explicit_user",
  "protocol_sync",
  "artifact_accept",
  "conversation_extraction",
  "ai_proposal",
  "deep_analysis",
  "system_sync",
  "legacy",
  "ai_generated",
  "user_input",
  "extracted",
] as const;

export const EMBEDDING_STATUS_VALUES = ["pending", "ready", "failed"] as const;

export type MemoryAuthority = (typeof MEMORY_AUTHORITY_VALUES)[number];
export type MemoryPolarity = (typeof MEMORY_POLARITY_VALUES)[number];
export type MemorySource = (typeof MEMORY_SOURCE_VALUES)[number];
export type EmbeddingStatus = (typeof EMBEDDING_STATUS_VALUES)[number];

export const MEMORY_AUTHORITY_LABELS: Record<MemoryAuthority, string> = {
  canonical: "Canonical",
  confirmed: "Confirmed",
  inferred: "Inferred",
  proposed: "Proposed",
};

export const MEMORY_SOURCE_LABELS: Record<MemorySource, string> = {
  explicit_user: "User-defined",
  protocol_sync: "Protocol sync",
  artifact_accept: "Accepted artifact",
  conversation_extraction: "Conversation inference",
  ai_proposal: "AI proposal",
  deep_analysis: "Deep analysis",
  system_sync: "System sync",
  legacy: "Legacy",
  ai_generated: "AI generated",
  user_input: "User input",
  extracted: "Extracted",
};

const IMPORTANCE_RANKS = {
  normal: 10,
  important: 20,
  critical: 30,
} as const;

export function normalizeMemoryAuthority(value: string | null | undefined): MemoryAuthority {
  return MEMORY_AUTHORITY_VALUES.includes(value as MemoryAuthority)
    ? (value as MemoryAuthority)
    : "confirmed";
}

export function normalizeMemoryPolarity(value: string | null | undefined): MemoryPolarity {
  return MEMORY_POLARITY_VALUES.includes(value as MemoryPolarity)
    ? (value as MemoryPolarity)
    : "affirming";
}

export function normalizeMemorySource(value: string | null | undefined): MemorySource {
  if (MEMORY_SOURCE_VALUES.includes(value as MemorySource)) {
    return value as MemorySource;
  }
  if (value === "explicit") return "explicit_user";
  if (value === "decision") return "explicit_user";
  if (value === "sync") return "system_sync";
  return "legacy";
}

export function projectImportanceRank(importance: string | null | undefined): number {
  if (importance === "critical") return IMPORTANCE_RANKS.critical;
  if (importance === "important") return IMPORTANCE_RANKS.important;
  return IMPORTANCE_RANKS.normal;
}

export function extractMemoryKeyFromTags(tags: readonly string[] | null | undefined): string | undefined {
  const tag = tags?.find((item) => item.startsWith("memory-key:"));
  const key = tag?.replace(/^memory-key:/, "").trim();
  return key || undefined;
}

export function sourceFromTags(
  tags: readonly string[] | null | undefined,
  fallback?: string | null,
): MemorySource {
  if (tags?.some((tag) => tag.startsWith("protocol-sync:"))) return "protocol_sync";
  if (tags?.includes("conversation-extracted")) return "conversation_extraction";
  if (tags?.includes("artifact-decision")) return "artifact_accept";
  if (tags?.includes("ai-proposed")) return "artifact_accept";
  if (tags?.includes("deep-analysis")) return "deep_analysis";
  return normalizeMemorySource(fallback);
}

export function authorityFromSource(
  source: string | null | undefined,
  fallback?: string | null,
): MemoryAuthority {
  const normalized = normalizeMemorySource(source);
  if (normalized === "protocol_sync") return "canonical";
  if (
    normalized === "conversation_extraction"
    || normalized === "deep_analysis"
    || normalized === "ai_generated"
    || normalized === "extracted"
  ) {
    return "inferred";
  }
  return normalizeMemoryAuthority(fallback);
}
