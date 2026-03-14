export type CacheFreshnessClass =
  | "must_be_fresh"
  | "stale_while_revalidate"
  | "local_first_with_sync"
  | "session_only";

export type CacheInvalidationReason =
  | "auth_change"
  | "server_mutation"
  | "artifact_accept"
  | "manual_refresh"
  | "scope_change"
  | "seed_expired"
  | "conflict_resolution"
  | "route_entry"
  | "maintenance_action";

export type PreloadMode = "never" | "idle" | "hover_intent" | "explicit_navigation";

export type CachePolicyResource =
  | "homeProjects"
  | "projectOverviewStats"
  | "protocolDocument"
  | "ledgerStudies"
  | "draftManuscript"
  | "notesIndex"
  | "noteDetail"
  | "projectMemoryList"
  | "memoryDiagnosticsTabs"
  | "aiConversationList"
  | "aiConversationTimeline"
  | "projectCopilotConversationState"
  | "popupTranscript";

export type CachePolicy = {
  freshnessClass: CacheFreshnessClass;
  staleWindowMs: number | null;
  preloadMode: PreloadMode;
  invalidationReasons: readonly CacheInvalidationReason[];
};

export const PROJECT_DATA_POLICIES = {
  homeProjects: {
    freshnessClass: "stale_while_revalidate",
    staleWindowMs: 15_000,
    preloadMode: "never",
    invalidationReasons: [
      "auth_change",
      "server_mutation",
      "manual_refresh",
      "seed_expired",
      "route_entry",
    ],
  },
  projectOverviewStats: {
    freshnessClass: "must_be_fresh",
    staleWindowMs: null,
    preloadMode: "explicit_navigation",
    invalidationReasons: ["route_entry", "manual_refresh"],
  },
  protocolDocument: {
    freshnessClass: "local_first_with_sync",
    staleWindowMs: null,
    preloadMode: "hover_intent",
    invalidationReasons: [
      "server_mutation",
      "artifact_accept",
      "conflict_resolution",
      "manual_refresh",
      "route_entry",
    ],
  },
  ledgerStudies: {
    freshnessClass: "must_be_fresh",
    staleWindowMs: null,
    preloadMode: "hover_intent",
    invalidationReasons: ["server_mutation", "artifact_accept", "manual_refresh", "route_entry"],
  },
  draftManuscript: {
    freshnessClass: "local_first_with_sync",
    staleWindowMs: null,
    preloadMode: "explicit_navigation",
    invalidationReasons: ["server_mutation", "artifact_accept", "manual_refresh", "route_entry"],
  },
  notesIndex: {
    freshnessClass: "stale_while_revalidate",
    staleWindowMs: 30_000,
    preloadMode: "explicit_navigation",
    invalidationReasons: [
      "server_mutation",
      "artifact_accept",
      "manual_refresh",
      "seed_expired",
      "route_entry",
    ],
  },
  noteDetail: {
    freshnessClass: "must_be_fresh",
    staleWindowMs: null,
    preloadMode: "explicit_navigation",
    invalidationReasons: ["server_mutation", "manual_refresh", "route_entry", "scope_change"],
  },
  projectMemoryList: {
    freshnessClass: "stale_while_revalidate",
    staleWindowMs: 30_000,
    preloadMode: "explicit_navigation",
    invalidationReasons: [
      "server_mutation",
      "artifact_accept",
      "manual_refresh",
      "seed_expired",
      "route_entry",
    ],
  },
  memoryDiagnosticsTabs: {
    freshnessClass: "session_only",
    staleWindowMs: null,
    preloadMode: "never",
    invalidationReasons: ["maintenance_action", "manual_refresh", "route_entry"],
  },
  aiConversationList: {
    freshnessClass: "stale_while_revalidate",
    staleWindowMs: 30_000,
    preloadMode: "idle",
    invalidationReasons: [
      "server_mutation",
      "manual_refresh",
      "scope_change",
      "seed_expired",
      "route_entry",
    ],
  },
  aiConversationTimeline: {
    freshnessClass: "session_only",
    staleWindowMs: null,
    preloadMode: "explicit_navigation",
    invalidationReasons: ["server_mutation", "manual_refresh", "scope_change", "route_entry"],
  },
  projectCopilotConversationState: {
    freshnessClass: "session_only",
    staleWindowMs: null,
    preloadMode: "never",
    invalidationReasons: ["server_mutation", "manual_refresh", "scope_change"],
  },
  popupTranscript: {
    freshnessClass: "session_only",
    staleWindowMs: null,
    preloadMode: "never",
    invalidationReasons: ["manual_refresh", "scope_change"],
  },
} as const satisfies Record<CachePolicyResource, CachePolicy>;

export const HOME_PROJECT_STALE_MS = PROJECT_DATA_POLICIES.homeProjects.staleWindowMs;

export function getCachePolicy(resource: CachePolicyResource): CachePolicy {
  return PROJECT_DATA_POLICIES[resource];
}
