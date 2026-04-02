"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

type UseTimelineWindowingOptions<T> = {
    items: T[];
    initialVisibleCount?: number;
    visibleStep?: number;
    onLoadOlder?: () => Promise<void>;
    capturePrependAnchor: (anchor?: Element | null) => void;
    restorePrependAnchor: () => void;
    firstItemRef: MutableRefObject<HTMLDivElement | null>;
    getItemId: (item: T | undefined) => string | null;
};

export function useTimelineWindowing<T>({
    items,
    initialVisibleCount,
    visibleStep = 60,
    onLoadOlder,
    capturePrependAnchor,
    restorePrependAnchor,
    firstItemRef,
    getItemId,
}: UseTimelineWindowingOptions<T>) {
    const windowSize = initialVisibleCount && initialVisibleCount > 0 ? initialVisibleCount : null;
    const [visibleCount, setVisibleCount] = useState<number>(() => {
        if (!windowSize) return items.length;
        return Math.min(windowSize, items.length);
    });

    const effectiveVisibleCount = windowSize ? Math.min(visibleCount, items.length) : items.length;
    const hiddenItemCount = Math.max(0, items.length - effectiveVisibleCount);
    const visibleItems = hiddenItemCount > 0 ? items.slice(-effectiveVisibleCount) : items;
    const visibleFirstItemId = getItemId(visibleItems[0]);
    const latestFirstItemIdRef = useRef<string | null>(visibleFirstItemId);
    const pendingPrependRef = useRef<{ firstIdBeforeLoad: string | null } | null>(null);
    const revealPendingRef = useRef(false);

    useLayoutEffect(() => {
        latestFirstItemIdRef.current = visibleFirstItemId;
    }, [visibleFirstItemId]);

    const handleLoadOlder = useCallback(async () => {
        if (!onLoadOlder) return;
        const firstIdBeforeLoad = visibleFirstItemId;
        capturePrependAnchor(firstItemRef.current);
        pendingPrependRef.current = { firstIdBeforeLoad };
        await onLoadOlder();
        if (
            pendingPrependRef.current?.firstIdBeforeLoad === firstIdBeforeLoad
            && latestFirstItemIdRef.current === firstIdBeforeLoad
        ) {
            pendingPrependRef.current = null;
        }
    }, [capturePrependAnchor, firstItemRef, onLoadOlder, visibleFirstItemId]);

    const handleRevealEarlier = useCallback(() => {
        if (hiddenItemCount <= 0) return;
        capturePrependAnchor(firstItemRef.current);
        revealPendingRef.current = true;
        setVisibleCount((current) => Math.min(items.length, current + Math.max(visibleStep, 1)));
    }, [capturePrependAnchor, firstItemRef, hiddenItemCount, items.length, visibleStep]);

    useLayoutEffect(() => {
        const pending = pendingPrependRef.current;
        if (!pending) return;
        if (visibleFirstItemId !== pending.firstIdBeforeLoad) {
            restorePrependAnchor();
            pendingPrependRef.current = null;
        }
    }, [restorePrependAnchor, visibleFirstItemId]);

    useLayoutEffect(() => {
        if (!revealPendingRef.current) return;
        restorePrependAnchor();
        revealPendingRef.current = false;
    }, [restorePrependAnchor, visibleFirstItemId]);

    return {
        effectiveVisibleCount,
        hiddenItemCount,
        visibleItems,
        visibleFirstItemId,
        handleLoadOlder,
        handleRevealEarlier,
    };
}
