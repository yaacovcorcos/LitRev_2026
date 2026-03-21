"use client";

import { useEffect } from "react";
import type { MutableRefObject } from "react";

export function useResetMutableRefWhen<T>(
    ref: MutableRefObject<T>,
    shouldReset: boolean,
    nextValue: T,
) {
    useEffect(() => {
        if (!shouldReset) return;
        ref.current = nextValue;
    }, [nextValue, ref, shouldReset]);
}
