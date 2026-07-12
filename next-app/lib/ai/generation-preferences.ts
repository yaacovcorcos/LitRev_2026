import {
    DEFAULT_SELECTABLE_MODEL_ID,
    getDefaultReasoningEffort,
    getSupportedReasoningEfforts,
    isSelectableModelId,
    modelSupportsDeliveryMode,
    type SelectableModelId,
} from "@/lib/ai/config";
import type { DeliveryMode, ReasoningEffort } from "@/types/ai";
import type { GenerationPreferenceSnapshot } from "@/types/queued-followup";

export const REASONING_EFFORT_STORAGE_KEY = "litrev_ai_reasoning_effort_by_model";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

type StoredReasoningEfforts = Partial<Record<SelectableModelId, ReasoningEffort>>;

function parseStoredReasoningEfforts(raw: string | null): StoredReasoningEfforts {
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return parsed as StoredReasoningEfforts;
    } catch {
        return {};
    }
}

export function resolveSelectableModel(modelId?: string | null): SelectableModelId {
    return modelId && isSelectableModelId(modelId)
        ? modelId
        : DEFAULT_SELECTABLE_MODEL_ID;
}

export function readStoredSelectableModel(
    storage: PreferenceStorage,
    storageKey: string,
): SelectableModelId {
    const stored = storage.getItem(storageKey);
    const resolved = resolveSelectableModel(stored);

    if (stored !== resolved) {
        storage.setItem(storageKey, resolved);
    }

    return resolved;
}

export function resolveReasoningEffort(
    modelId: string,
    effort?: ReasoningEffort | null,
): ReasoningEffort {
    const supported = getSupportedReasoningEfforts(modelId);
    return effort && supported.includes(effort)
        ? effort
        : getDefaultReasoningEffort(modelId);
}

export function readStoredReasoningEffort(
    storage: PreferenceStorage,
    modelId: SelectableModelId,
): ReasoningEffort {
    const stored = parseStoredReasoningEfforts(storage.getItem(REASONING_EFFORT_STORAGE_KEY));
    const resolved = resolveReasoningEffort(modelId, stored[modelId]);

    if (stored[modelId] !== resolved) {
        storage.setItem(REASONING_EFFORT_STORAGE_KEY, JSON.stringify({
            ...stored,
            [modelId]: resolved,
        }));
    }

    return resolved;
}

export function writeStoredReasoningEffort(
    storage: PreferenceStorage,
    modelId: SelectableModelId,
    effort: ReasoningEffort,
): ReasoningEffort {
    const stored = parseStoredReasoningEfforts(storage.getItem(REASONING_EFFORT_STORAGE_KEY));
    const resolved = resolveReasoningEffort(modelId, effort);
    storage.setItem(REASONING_EFFORT_STORAGE_KEY, JSON.stringify({
        ...stored,
        [modelId]: resolved,
    }));
    return resolved;
}

export function resolveDeliveryMode(
    modelId: string,
    deliveryMode?: DeliveryMode | null,
): DeliveryMode {
    return deliveryMode === "priority" && modelSupportsDeliveryMode(modelId, "priority")
        ? "priority"
        : "standard";
}

export function createGenerationPreferenceSnapshot(input: {
    model?: string | null;
    reasoningEffort?: ReasoningEffort | null;
    deliveryMode?: DeliveryMode | null;
}): GenerationPreferenceSnapshot {
    const model = resolveSelectableModel(input.model);
    return {
        model,
        reasoningEffort: resolveReasoningEffort(model, input.reasoningEffort),
        deliveryMode: resolveDeliveryMode(model, input.deliveryMode),
    };
}
