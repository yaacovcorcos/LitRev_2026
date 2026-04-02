"use client";

import { useEffect, useEffectEvent } from "react";

type UseDocumentEventOptions = {
    enabled?: boolean;
    options?: boolean | AddEventListenerOptions;
};

export function useDocumentEvent<K extends keyof DocumentEventMap>(
    type: K,
    listener: (event: DocumentEventMap[K]) => void,
    { enabled = true, options }: UseDocumentEventOptions = {},
) {
    const onEvent = useEffectEvent(listener);

    useEffect(() => {
        if (!enabled || typeof document === "undefined") return;

        const handleEvent = (event: DocumentEventMap[K]) => {
            onEvent(event);
        };

        document.addEventListener(type, handleEvent as EventListener, options);
        return () => {
            document.removeEventListener(type, handleEvent as EventListener, options);
        };
    }, [enabled, options, type]);
}
