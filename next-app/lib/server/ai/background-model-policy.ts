import "server-only";

import { DEFAULT_SELECTABLE_MODEL_ID, type SelectableModelId } from "@/lib/ai/config";
import { isModelConfigured } from "@/lib/server/ai/model-availability";

export type BackgroundModelPurpose = "fast" | "analysis";

/**
 * Central policy for invisible/background model calls. New gateway models are
 * preferred once their key is installed, while Luna keeps existing workflows
 * operational during setup and provider incidents.
 */
export function getBackgroundModel(purpose: BackgroundModelPurpose): SelectableModelId {
    const preferred: SelectableModelId = purpose === "analysis"
        ? "deepseek-v4-pro"
        : "deepseek-v4-flash";
    return isModelConfigured(preferred) ? preferred : DEFAULT_SELECTABLE_MODEL_ID;
}
