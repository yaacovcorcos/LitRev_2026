"use client";

import { useEffect, useEffectEvent } from "react";

type UseWindowEventOptions = {
    enabled?: boolean;
    options?: boolean | AddEventListenerOptions;
};

export function useWindowEvent<K extends keyof WindowEventMap>(
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    { enabled = true, options }: UseWindowEventOptions = {},
) {
    const onEvent = useEffectEvent(listener);

    useEffect(() => {
        if (!enabled || typeof window === "undefined") return;

        const handleEvent = (event: WindowEventMap[K]) => {
            onEvent(event);
        };

        window.addEventListener(type, handleEvent as EventListener, options);
        return () => {
            window.removeEventListener(type, handleEvent as EventListener, options);
        };
    }, [enabled, onEvent, options, type]);
}
