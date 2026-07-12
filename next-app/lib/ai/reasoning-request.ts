import { AI_CONFIG } from "@/lib/ai/config";
import {
  resolveRequestReasoningMode,
  shouldRequestReasoning,
} from "@/lib/ai/reasoning-visibility";
import type { ReasoningMode } from "@/types/ai";

export type ResolvedReasoningRequest = {
  reasoningMode: ReasoningMode;
  includeReasoning: boolean;
  reasoningBudgetTokens?: number;
};

export function resolveReasoningRequest(params: {
  preferredMode: ReasoningMode;
  modelId?: string | null;
}): ResolvedReasoningRequest {
  const resolvedModelId = params.modelId?.trim() || AI_CONFIG.defaultModel;
  const reasoningMode = resolveRequestReasoningMode(params.preferredMode, resolvedModelId);
  const includeReasoning = shouldRequestReasoning(reasoningMode);

  if (!includeReasoning) {
    return {
      reasoningMode,
      includeReasoning: false,
      reasoningBudgetTokens: undefined,
    };
  }

  return {
    reasoningMode,
    includeReasoning,
    // Visibility never chooses provider compute. Reasoning effort owns that.
    reasoningBudgetTokens: undefined,
  };
}
