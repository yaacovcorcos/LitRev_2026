"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SelectableModelId } from "@/lib/ai/config";

export type ModelAvailabilityMap = Partial<Record<SelectableModelId, boolean>>;
export type ModelAvailabilityStatus = "loading" | "ready" | "error";

export type ModelAvailabilityState = {
    availability: ModelAvailabilityMap | undefined;
    status: ModelAvailabilityStatus;
    errorMessage?: string;
    retry: () => void;
};

export function isSelectableModelReady(
    availability: ModelAvailabilityMap | undefined,
    status: ModelAvailabilityStatus | undefined,
    modelId: SelectableModelId,
): boolean {
    if (status === "loading" || status === "error") return false;
    if (status === "ready") return availability?.[modelId] === true;

    // Components can still be rendered without the server readiness hook in
    // tests and isolated stories. Preserve that explicit opt-out contract.
    return availability?.[modelId] !== false;
}

/**
 * Synchronizes the client selector with server-only provider-key readiness.
 * Loading and request failures stay explicit so the UI never treats an
 * unknown provider state as permission to send.
 */
export function useModelAvailability(): ModelAvailabilityState {
    const [requestVersion, setRequestVersion] = useState(0);
    const [state, setState] = useState<Omit<ModelAvailabilityState, "retry">>({
        availability: undefined,
        status: "loading",
    });

    const retry = useCallback(() => {
        setState((current) => ({
            availability: current.availability,
            status: "loading",
        }));
        setRequestVersion((current) => current + 1);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const loadAvailability = async () => {
            try {
                const response = await fetch("/api/ai/models", {
                    method: "GET",
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(`Model readiness request failed (${response.status}).`);
                }
                const payload = await response.json() as { availability?: ModelAvailabilityMap };
                if (!payload.availability) {
                    throw new Error("Model readiness response was incomplete.");
                }
                setState({
                    availability: payload.availability,
                    status: "ready",
                });
            } catch (error: unknown) {
                if (error instanceof Error && error.name === "AbortError") return;
                setState((current) => ({
                    availability: current.availability,
                    status: "error",
                    errorMessage: "Could not verify which models are ready. Retry before sending.",
                }));
            }
        };
        void loadAvailability();
        return () => controller.abort();
    }, [requestVersion]);

    return useMemo(() => ({ ...state, retry }), [retry, state]);
}
