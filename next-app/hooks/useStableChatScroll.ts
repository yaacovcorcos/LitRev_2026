"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD = 24;

export function useStableChatScroll() {
    // ── Refs ────────────────────────────────────────────────────────────
    const containerElRef = useRef<HTMLDivElement | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const pinnedRef = useRef(true);
    const rafRef = useRef<number | null>(null);
    const roRef = useRef<ResizeObserver | null>(null);
    const observedRootRef = useRef<Element | null>(null);
    const prevConvIdRef = useRef<string | undefined>(undefined);
    const prependAnchorRef = useRef<{ el: Element; top: number } | null>(null);
    const [isPinned, setIsPinned] = useState(true);

    // ── Core: rAF-coalesced scroll to sentinel ──────────────────────────
    const scheduleScroll = useCallback(() => {
        if (!pinnedRef.current) return;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            if (pinnedRef.current && bottomRef.current) {
                bottomRef.current.scrollIntoView({ block: "end", behavior: "auto" });
            }
        });
    }, []);

    // ── ResizeObserver binding (survives content-root swaps) ────────────
    const bindResizeObserver = useCallback((container: HTMLDivElement | null) => {
        if (!container) {
            if (roRef.current) roRef.current.disconnect();
            roRef.current = null;
            observedRootRef.current = null;
            return;
        }
        const nextRoot = container.firstElementChild;
        if (!nextRoot) {
            if (roRef.current) roRef.current.disconnect();
            roRef.current = null;
            observedRootRef.current = null;
            return;
        }
        if (roRef.current && observedRootRef.current === nextRoot) return;
        if (roRef.current) {
            roRef.current.disconnect();
            roRef.current = null;
        }
        const ro = new ResizeObserver(() => {
            if (pinnedRef.current) scheduleScroll();
        });
        ro.observe(nextRoot);
        roRef.current = ro;
        observedRootRef.current = nextRoot;
    }, [scheduleScroll]);

    // ── Callback ref for container (handles remount) ────────────────────
    const containerRef = useCallback((node: HTMLDivElement | null) => {
        containerElRef.current = node;
        bindResizeObserver(node);
    }, [bindResizeObserver]);

    // ── Cleanup rAF + RO on unmount ─────────────────────────────────────
    useLayoutEffect(() => {
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            if (roRef.current) roRef.current.disconnect();
            observedRootRef.current = null;
        };
    }, []);

    // ── Scroll handler — detect user intent via distance from bottom ────
    const onScroll = useCallback(() => {
        const el = containerElRef.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distance < BOTTOM_THRESHOLD;
        if (atBottom !== pinnedRef.current) {
            pinnedRef.current = atBottom;
            setIsPinned(atBottom);
        }
    }, []);

    // ── Imperative: jump to bottom ──────────────────────────────────────
    const scrollToBottom = useCallback(() => {
        pinnedRef.current = true;
        setIsPinned(true);
        bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    }, []);

    // ── Imperative: stream started ──────────────────────────────────────
    const notifyStreamStart = useCallback(() => {
        if (pinnedRef.current) scheduleScroll();
    }, [scheduleScroll]);

    // ── Imperative: conversation changed (ID-only, no isLoading) ────────
    const notifyConversationChanged = useCallback((conversationId: string) => {
        if (conversationId === prevConvIdRef.current) return;
        prevConvIdRef.current = conversationId;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        pinnedRef.current = true;
        setIsPinned(true);
        scheduleScroll();
    }, [scheduleScroll]);

    // ── Imperative: content changed ─────────────────────────────────────
    const notifyContentChanged = useCallback(() => {
        bindResizeObserver(containerElRef.current);
        scheduleScroll();
    }, [scheduleScroll, bindResizeObserver]);

    // ── Prepend-preserve: capture anchor before prepending ──────────────
    const capturePrependAnchor = useCallback(() => {
        const el = containerElRef.current;
        if (!el || !el.firstElementChild) { prependAnchorRef.current = null; return; }
        const anchor = el.firstElementChild;
        prependAnchorRef.current = { el: anchor, top: anchor.getBoundingClientRect().top };
    }, []);

    // ── Prepend-preserve: restore viewport after prepending ─────────────
    const restorePrependAnchor = useCallback(() => {
        const saved = prependAnchorRef.current;
        const el = containerElRef.current;
        if (!saved || !el) return;
        const newTop = saved.el.getBoundingClientRect().top;
        el.scrollTop += newTop - saved.top;
        prependAnchorRef.current = null;
    }, []);

    return {
        containerRef, bottomRef, onScroll, isPinned, scrollToBottom,
        notifyStreamStart, notifyConversationChanged, notifyContentChanged,
        capturePrependAnchor, restorePrependAnchor,
    };
}
