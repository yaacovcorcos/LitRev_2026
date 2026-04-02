export type ProviderToolCallDelta = {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

export function getToolCallDeltas(delta: unknown): ProviderToolCallDelta[] {
  if (!delta || typeof delta !== "object" || !("tool_calls" in delta)) {
    return [];
  }

  const toolCalls = (delta as { tool_calls?: ProviderToolCallDelta[] }).tool_calls;
  return Array.isArray(toolCalls) ? toolCalls : [];
}
