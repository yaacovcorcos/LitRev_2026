import "server-only";

import type { SelectableModelId } from "@/lib/ai/config";
import { isModelConfigured } from "@/lib/server/ai/model-availability";

export type BackgroundModelPurpose = "fast" | "analysis";

const BACKGROUND_MODEL_CANDIDATES: Readonly<Record<BackgroundModelPurpose, readonly SelectableModelId[]>> = {
    fast: [
        "deepseek-v4-flash",
        "gpt-5.6-luna",
        "deepseek-v4-pro",
        "gpt-5.6-terra",
        "qwen3.7-plus",
        "grok-4.5",
        "gpt-5.6-sol",
    ],
    analysis: [
        "deepseek-v4-pro",
        "gpt-5.6-luna",
        "gpt-5.6-terra",
        "qwen3.7-plus",
        "grok-4.5",
        "gpt-5.6-sol",
        "deepseek-v4-flash",
    ],
};

export class BackgroundModelUnavailableError extends Error {
    readonly code = "BACKGROUND_MODEL_UNAVAILABLE";

    constructor(readonly purpose: BackgroundModelPurpose) {
        super(`No configured model is available for ${purpose} background work.`);
        this.name = "BackgroundModelUnavailableError";
    }
}

/**
 * Central policy for invisible/background model calls. New gateway models are
 * preferred once their key is installed. If the preferred route is unavailable,
 * the first configured portfolio fallback is used; an unconfigured model is
 * never returned merely because it is the compile-time default.
 */
export function getBackgroundModel(purpose: BackgroundModelPurpose): SelectableModelId {
    const configured = BACKGROUND_MODEL_CANDIDATES[purpose].find(isModelConfigured);
    if (!configured) throw new BackgroundModelUnavailableError(purpose);
    return configured;
}
