"use client";

import { useEffect, useEffectEvent } from "react";

type UseIdleTaskOptions = {
    enabled?: boolean;
    timeoutMs?: number;
    fallbackDelayMs?: number;
};

export function useIdleTask(
    task: () => void,
    { enabled = true, timeoutMs = 1000, fallbackDelayMs = 0 }: UseIdleTaskOptions = {},
) {
    const runTask = useEffectEvent(task);

    useEffect(() => {
        if (!enabled || typeof window === "undefined") return;

        let cancelled = false;
        const run = () => {
            if (!cancelled) {
                runTask();
            }
        };

        if (typeof window.requestIdleCallback === "function") {
            const idleId = window.requestIdleCallback(run, { timeout: timeoutMs });
            return () => {
                cancelled = true;
                window.cancelIdleCallback(idleId);
            };
        }

        const timeoutId = window.setTimeout(run, fallbackDelayMs);
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [enabled, fallbackDelayMs, runTask, timeoutMs]);
}
