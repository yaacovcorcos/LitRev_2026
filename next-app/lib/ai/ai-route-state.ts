export type AiRouteState = {
  conversationId: string | null;
  projectId: string | null;
};

type SearchParamsReader = Pick<URLSearchParams, "get">;

function normalizeRouteId(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function readAiRouteState(searchParams: SearchParamsReader): AiRouteState {
  return {
    conversationId: normalizeRouteId(searchParams.get("conversation")),
    projectId: normalizeRouteId(searchParams.get("project")),
  };
}

export function buildAiRouteHref({ conversationId, projectId }: AiRouteState): string {
  const params = new URLSearchParams();
  const normalizedProjectId = normalizeRouteId(projectId);
  const normalizedConversationId = normalizeRouteId(conversationId);

  if (normalizedProjectId) params.set("project", normalizedProjectId);
  if (normalizedConversationId) params.set("conversation", normalizedConversationId);

  const query = params.toString();
  return query ? `/ai?${query}` : "/ai";
}
