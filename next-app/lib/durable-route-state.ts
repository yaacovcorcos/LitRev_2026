import { PROTOCOL_SECTION_LABELS, type ProtocolSection } from "@/types/protocol";

export type SearchParamsReader = {
  get(name: string): string | null;
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeEncodeURIComponent(value: string): string {
  return encodeURIComponent(value);
}

export const PROJECT_CONVERSATION_SEGMENT = "conversation" as const;
const PROJECT_CONVERSATION_PATH_RE =
  /^\/project\/([^/]+)\/conversation\/([^/?#]+)\/?$/;

export type ProjectConversationRouteIdentity = {
  projectId: string;
  conversationId: string;
};

export function buildProjectConversationPath(
  projectId: string,
  conversationId: string,
): string {
  return `/project/${safeEncodeURIComponent(projectId)}/${PROJECT_CONVERSATION_SEGMENT}/${safeEncodeURIComponent(conversationId)}`;
}

export function parseProjectConversationPath(
  pathname: string,
): ProjectConversationRouteIdentity | null {
  const match = PROJECT_CONVERSATION_PATH_RE.exec(pathname);
  if (!match) return null;
  const projectId = normalizeOptionalString(safeDecodeURIComponent(match[1]));
  const conversationId = normalizeOptionalString(safeDecodeURIComponent(match[2]));
  if (!projectId || !conversationId) return null;
  return { projectId, conversationId };
}

export const COPILOT_QUERY_PARAM = "copilot" as const;
export const COPILOT_PANEL_QUERY_PARAM = "copilotPanel" as const;
export const COPILOT_PANEL_OPEN_VALUE = "open" as const;

export type CopilotRouteState = {
  conversationId: string | null;
  panelRequestedOpen: boolean;
};

export function readCopilotRouteState(
  searchParams: SearchParamsReader,
): CopilotRouteState {
  const conversationId = normalizeOptionalString(
    searchParams.get(COPILOT_QUERY_PARAM),
  );
  const panelRequestedOpen =
    normalizeOptionalString(searchParams.get(COPILOT_PANEL_QUERY_PARAM)) ===
    COPILOT_PANEL_OPEN_VALUE;
  return { conversationId, panelRequestedOpen };
}

export function buildCopilotRouteSearchParams(
  state: CopilotRouteState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.conversationId) {
    params.set(COPILOT_QUERY_PARAM, state.conversationId);
  }
  if (state.panelRequestedOpen) {
    params.set(COPILOT_PANEL_QUERY_PARAM, COPILOT_PANEL_OPEN_VALUE);
  }
  return params;
}

export const AI_CONVERSATION_QUERY_PARAM = "conversation" as const;
export const AI_PROJECT_QUERY_PARAM = "project" as const;

export type AiRouteState = {
  conversationId: string | null;
  projectId: string | null;
};

export function readAiRouteState(searchParams: SearchParamsReader): AiRouteState {
  return {
    conversationId: normalizeOptionalString(
      searchParams.get(AI_CONVERSATION_QUERY_PARAM),
    ),
    projectId: normalizeOptionalString(searchParams.get(AI_PROJECT_QUERY_PARAM)),
  };
}

export function buildAiRouteSearchParams(state: AiRouteState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.conversationId) {
    params.set(AI_CONVERSATION_QUERY_PARAM, state.conversationId);
  }
  if (state.projectId) {
    params.set(AI_PROJECT_QUERY_PARAM, state.projectId);
  }
  return params;
}

export function buildAiRouteHref(state: AiRouteState): string {
  const params = buildAiRouteSearchParams(state);
  const query = params.toString();
  return query.length > 0 ? `/ai?${query}` : "/ai";
}

export const PROTOCOL_SECTION_QUERY_PARAM = "section" as const;
export const PROTOCOL_SECTION_IDS = Object.keys(
  PROTOCOL_SECTION_LABELS,
) as Array<NonNullable<ProtocolSection>>;

export function isProtocolSectionId(
  value: string | null | undefined,
): value is NonNullable<ProtocolSection> {
  if (!value) return false;
  return PROTOCOL_SECTION_IDS.includes(value as NonNullable<ProtocolSection>);
}

export function normalizeProtocolSectionId(
  value: string | null | undefined,
): NonNullable<ProtocolSection> | null {
  const normalized = normalizeOptionalString(value);
  return isProtocolSectionId(normalized) ? normalized : null;
}

export const MEMORY_TAB_QUERY_PARAM = "tab" as const;
export const MEMORY_TABS = [
  { id: "project", label: "Project Memory", icon: "psychology" },
  { id: "study", label: "Study Memory", icon: "science" },
  { id: "preferences", label: "Preferences", icon: "tune" },
  { id: "prisma", label: "PRISMA Stats", icon: "analytics" },
  { id: "health", label: "Memory Health", icon: "monitor_heart" },
] as const;

export type MemoryTabId = (typeof MEMORY_TABS)[number]["id"];
export const MEMORY_TAB_IDS = MEMORY_TABS.map((tab) => tab.id);

export function isMemoryTabId(
  value: string | null | undefined,
): value is MemoryTabId {
  if (!value) return false;
  return MEMORY_TAB_IDS.includes(value as MemoryTabId);
}

export function normalizeMemoryTabId(
  value: string | null | undefined,
): MemoryTabId | null {
  const normalized = normalizeOptionalString(value);
  return isMemoryTabId(normalized) ? normalized : null;
}

export const ONBOARDING_STEP_QUERY_PARAM = "step" as const;
export const ONBOARDING_STEPS = [
  { id: "topicQuestion", label: "Topic & Question", short: "Question" },
  { id: "pico", label: "PICO Builder", short: "PICO" },
  { id: "criteria", label: "Criteria", short: "Criteria" },
  { id: "strategy", label: "Strategy Preview", short: "Strategy" },
  { id: "workflow", label: "Workflow Orientation", short: "Workflow" },
  { id: "launch", label: "Launch Gate", short: "Launch" },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];
export type OnboardingStepStatus = "pending" | "completed" | "skipped";
export const ONBOARDING_STEP_IDS = ONBOARDING_STEPS.map((step) => step.id);
export const DEFAULT_ONBOARDING_STEP_STATUSES: Record<
  OnboardingStepId,
  OnboardingStepStatus
> = {
  topicQuestion: "pending",
  pico: "pending",
  criteria: "pending",
  strategy: "pending",
  workflow: "pending",
  launch: "pending",
};

export function isOnboardingStepId(
  value: string | null | undefined,
): value is OnboardingStepId {
  if (!value) return false;
  return ONBOARDING_STEP_IDS.includes(value as OnboardingStepId);
}

export function normalizeOnboardingStepId(
  value: string | null | undefined,
): OnboardingStepId | null {
  const normalized = normalizeOptionalString(value);
  return isOnboardingStepId(normalized) ? normalized : null;
}
