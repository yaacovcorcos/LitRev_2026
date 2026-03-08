import { AI_CONFIG, getReasoningSupportTier, type ReasoningSupportTier } from "@/lib/ai/config";
import {
  getReasoningBudgetTokens,
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
  const tier: ReasoningSupportTier = getReasoningSupportTier(resolvedModelId);
  const reasoningMode = resolveRequestReasoningMode(params.preferredMode, resolvedModelId);
  const includeReasoning = shouldRequestReasoning(reasoningMode);

  if (!includeReasoning) {
    return {
      reasoningMode,
      includeReasoning: false,
      reasoningBudgetTokens: undefined,
    };
  }

  if (tier === "explicit") {
    return {
      reasoningMode,
      includeReasoning,
      reasoningBudgetTokens: getReasoningBudgetTokens(reasoningMode),
    };
  }

  return {
    reasoningMode,
    includeReasoning,
    reasoningBudgetTokens: undefined,
  };
}
