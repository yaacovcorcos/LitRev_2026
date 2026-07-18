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

export const MODEL_AVAILABILITY_TIMEOUT_MS = 8_000;

class ModelAvailabilityTimeoutError extends Error {
    constructor() {
        super("Model readiness request timed out.");
        this.name = "ModelAvailabilityTimeoutError";
    }
}

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
 * A readiness request is advisory; the server send path remains authoritative.
 * Preserve the hard block while loading and for explicitly unavailable models,
 * but do not deadlock the composer because the readiness request itself failed.
 */
export function isSelectableModelSendAllowed(
    availability: ModelAvailabilityMap | undefined,
    status: ModelAvailabilityStatus | undefined,
    modelId: SelectableModelId,
): boolean {
    if (status === "loading") return false;
    if (status === "error") return availability?.[modelId] !== false;
    return isSelectableModelReady(availability, status, modelId);
}

/**
 * Synchronizes client controls with server-only provider-key readiness.
 * Loading and request failures stay explicit for status and model-selection
 * UI; the composer separately permits a server-authoritative send after a
 * transport failure.
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
        let disposed = false;
        let timedOut = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const loadAvailability = async () => {
            try {
                const response = await Promise.race([
                    fetch("/api/ai/models", {
                        method: "GET",
                        cache: "no-store",
                        signal: controller.signal,
                    }),
                    new Promise<never>((_resolve, reject) => {
                        timeoutId = setTimeout(() => {
                            timedOut = true;
                            controller.abort();
                            reject(new ModelAvailabilityTimeoutError());
                        }, MODEL_AVAILABILITY_TIMEOUT_MS);
                    }),
                ]);
                if (!response.ok) {
                    throw new Error(`Model readiness request failed (${response.status}).`);
                }
                const payload = await response.json() as { availability?: ModelAvailabilityMap };
                if (!payload.availability) {
                    throw new Error("Model readiness response was incomplete.");
                }
                if (disposed) return;
                setState({
                    availability: payload.availability,
                    status: "ready",
                });
            } catch (error: unknown) {
                if (disposed) return;
                if (!timedOut && error instanceof Error && error.name === "AbortError") return;
                setState((current) => ({
                    availability: current.availability,
                    status: "error",
                    errorMessage: timedOut || error instanceof ModelAvailabilityTimeoutError
                        ? "Model setup check timed out. Retry before sending."
                        : "Could not verify which models are ready. Retry before sending.",
                }));
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        };
        void loadAvailability();
        return () => {
            disposed = true;
            if (timeoutId) clearTimeout(timeoutId);
            controller.abort();
        };
    }, [requestVersion]);

    return useMemo(() => ({ ...state, retry }), [retry, state]);
}
