"use client";

import { useEffect, useEffectEvent, useState } from "react";

type UseMediaQueryOptions = {
    defaultValue?: boolean;
    initializeWithValue?: boolean;
};

export function useMediaQuery(
    query: string,
    { defaultValue = false, initializeWithValue = true }: UseMediaQueryOptions = {},
) {
    const readMatches = () => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return defaultValue;
        }
        return window.matchMedia(query).matches;
    };

    const [matches, setMatches] = useState(() => (
        initializeWithValue ? readMatches() : defaultValue
    ));

    const syncMatches = useEffectEvent(() => {
        setMatches(readMatches());
    });

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return;
        }

        const mediaQuery = window.matchMedia(query);
        syncMatches();

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", syncMatches);
            return () => mediaQuery.removeEventListener("change", syncMatches);
        }

        mediaQuery.addListener(syncMatches);
        return () => mediaQuery.removeListener(syncMatches);
    }, [query]);

    return matches;
}
