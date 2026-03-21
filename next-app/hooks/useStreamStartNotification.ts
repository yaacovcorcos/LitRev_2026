"use client";

import { useLayoutEffect, useRef } from "react";

export function useStreamStartNotification(
    isLoading: boolean,
    notifyStreamStart: () => void,
) {
    const previousLoadingRef = useRef(false);

    useLayoutEffect(() => {
        if (isLoading && !previousLoadingRef.current) {
            notifyStreamStart();
        }
        previousLoadingRef.current = isLoading;
    }, [isLoading, notifyStreamStart]);
}
