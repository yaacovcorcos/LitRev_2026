"use client";

import {
    useState,
    useCallback,
    useRef,
    useEffect,
    type ReactNode,
    type MouseEvent,
    type KeyboardEvent,
    type FocusEvent,
    type TouchEvent,
    type AnchorHTMLAttributes,
} from "react";
import * as Popover from "@/components/ui/Popover";
import { fetchCitationMetadata } from "@/app/actions/citation";
import type { CitationMetadata } from "@/lib/citation-types";
import { loadCitationMetadataWithClientCache } from "@/lib/citation-preview-cache";
import { getCitationType, resolveCitationKey } from "@/lib/citation-key";
import { isCitationHoverPrefetchEnabled } from "@/lib/citation-preview-feature-flags";
import { recordCitationPreviewMetric } from "@/lib/ai/citation-preview-telemetry";
import type { CitationPreviewSurface, CitationPreviewTrigger } from "@/types/citation-preview-telemetry";
import styles from "./CitationPreview.module.css";

export type CitationType = "DOI" | "PubMed";

interface CitationPreviewProps {
    href: string;
    type: CitationType;
    children: ReactNode;
    anchorProps?: AnchorHTMLAttributes<HTMLAnchorElement>;
}

type FetchState = "idle" | "loading" | "loaded" | "error";

const HOVER_INTENT_DELAY = 300; // ms before triggering fetch on hover
const PREFETCH_INTENT_DELAY = 120; // ms before prefetching on hover intent
const TOUCH_HOLD_THRESHOLD = 200; // ms to distinguish tap from hold

function inferSurfaceFromPathname(): CitationPreviewSurface {
    if (typeof window === "undefined") return "unknown";
    const pathname = window.location.pathname;
    if (pathname === "/ai" || pathname.startsWith("/ai/")) return "ai";
    if (pathname.startsWith("/project/")) return "project";
    return "unknown";
}

/**
 * Citation link with hover/tap preview card.
 * Lazy-fetches metadata only when preview is requested.
 */
export function CitationPreview({ href, type, children, anchorProps }: CitationPreviewProps) {
    const [open, setOpen] = useState(false);
    const [fetchState, setFetchState] = useState<FetchState>("idle");
    const [metadata, setMetadata] = useState<CitationMetadata | null>(null);
    const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartRef = useRef<number>(0);
    const isTouchDeviceRef = useRef(false);
    const fetchedRef = useRef(false);
    const citationKey = resolveCitationKey(href)?.cacheKey ?? null;
    const citationType = getCitationType(href);
    const surface = inferSurfaceFromPathname();
    const prefetchEnabled = isCitationHoverPrefetchEnabled();

    const trackMetric = useCallback(
        (
            type:
                | "hover_intent_started"
                | "prefetch_started"
                | "popover_opened"
                | "metadata_request_started"
                | "metadata_request_completed"
                | "metadata_request_failed",
            payload: {
                trigger?: CitationPreviewTrigger;
                fromCache?: boolean;
                latencyMs?: number;
                upstreamSource?: "crossref" | "pubmed" | "unknown";
                errorCode?: string | null;
            } = {}
        ) => {
            recordCitationPreviewMetric({
                type,
                surface,
                payload: {
                    citationKey,
                    citationType,
                    ...payload,
                },
            });
        },
        [citationKey, citationType, surface]
    );

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (hoverOpenTimerRef.current) {
                clearTimeout(hoverOpenTimerRef.current);
            }
            if (hoverPrefetchTimerRef.current) {
                clearTimeout(hoverPrefetchTimerRef.current);
            }
        };
    }, []);

    const doFetch = useCallback(async (trigger: CitationPreviewTrigger) => {
        if (fetchedRef.current || fetchState === "loading") return;

        trackMetric("metadata_request_started", { trigger });
        setFetchState("loading");
        const startedAt = performance.now();
        const { result, fromCache } = await loadCitationMetadataWithClientCache(href, fetchCitationMetadata);
        const latencyMs = Math.round(Math.max(0, performance.now() - startedAt));

        if (result.success) {
            setMetadata(result.data);
            setFetchState("loaded");
            fetchedRef.current = true;
            trackMetric("metadata_request_completed", {
                trigger,
                fromCache,
                latencyMs,
                upstreamSource:
                    result.data.citationCountSource === "crossref"
                        ? "crossref"
                        : citationType === "PubMed"
                            ? "pubmed"
                            : citationType === "DOI"
                                ? "crossref"
                                : "unknown",
            });
        } else {
            setFetchState("error");
            trackMetric("metadata_request_failed", {
                trigger,
                latencyMs,
                errorCode: result.error,
            });
        }
    }, [href, fetchState, citationType, trackMetric]);

    const openPreview = useCallback((trigger: CitationPreviewTrigger) => {
        setOpen(true);
        trackMetric("popover_opened", { trigger });
        if (!fetchedRef.current && fetchState !== "loading") {
            void doFetch(trigger);
        }
    }, [doFetch, fetchState, trackMetric]);

    const closePreview = useCallback(() => {
        setOpen(false);
    }, []);

    // ── Desktop: hover intent ────────────────────────────────────────────────
    const handleMouseEnter = useCallback(() => {
        if (isTouchDeviceRef.current) return;

        trackMetric("hover_intent_started", { trigger: "hover" });

        if (prefetchEnabled && !fetchedRef.current && fetchState !== "loading") {
            hoverPrefetchTimerRef.current = setTimeout(() => {
                trackMetric("prefetch_started", { trigger: "prefetch" });
                void doFetch("prefetch");
            }, PREFETCH_INTENT_DELAY);
        }

        hoverOpenTimerRef.current = setTimeout(() => {
            openPreview("hover");
        }, HOVER_INTENT_DELAY);
    }, [doFetch, fetchState, openPreview, prefetchEnabled, trackMetric]);

    const handleMouseLeave = useCallback(() => {
        if (hoverOpenTimerRef.current) {
            clearTimeout(hoverOpenTimerRef.current);
            hoverOpenTimerRef.current = null;
        }
        if (hoverPrefetchTimerRef.current) {
            clearTimeout(hoverPrefetchTimerRef.current);
            hoverPrefetchTimerRef.current = null;
        }
        // Don't close immediately - let Radix handle it when moving to content
    }, []);

    // ── Keyboard: focus ──────────────────────────────────────────────────────
    const handleFocus = useCallback(
        (e: FocusEvent) => {
            // Only open on keyboard focus (not mouse click focus)
            if (e.target === e.currentTarget) {
                openPreview("focus");
            }
        },
        [openPreview]
    );

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closePreview();
            }
        },
        [closePreview]
    );

    // ── Touch: tap to open ───────────────────────────────────────────────────
    const handleTouchStart = useCallback(() => {
        isTouchDeviceRef.current = true;
        touchStartRef.current = Date.now();
    }, []);

    const handleTouchEnd = useCallback(
        (e: TouchEvent<HTMLAnchorElement>) => {
            const touchDuration = Date.now() - touchStartRef.current;

            // Short tap: toggle preview
            if (touchDuration < TOUCH_HOLD_THRESHOLD) {
                e.preventDefault(); // Prevent link navigation on tap
                if (open) {
                    closePreview();
                } else {
                    openPreview("touch");
                }
            }
            // Longer hold: let default behavior (could navigate)
        },
        [open, openPreview, closePreview]
    );

    const handleClick = useCallback(
        (e: MouseEvent) => {
            // On touch devices, prevent default click to allow preview
            if (isTouchDeviceRef.current && !open) {
                e.preventDefault();
            }
        },
        [open]
    );

    // Format authors: truncate if long
    const formatAuthors = (authors: string): string => {
        if (authors.length <= 80) return authors;
        const parts = authors.split(", ");
        if (parts.length > 3) {
            return `${parts.slice(0, 3).join(", ")} et al.`;
        }
        return authors.slice(0, 77) + "...";
    };

    const formatCitationCount = (count: number): string => {
        return new Intl.NumberFormat().format(count);
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <a
                    {...anchorProps}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.citationLink}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onClick={handleClick}
                    data-citation-type={type}
                >
                    {children}
                </a>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className={styles.previewCard}
                    side="top"
                    sideOffset={8}
                    align="start"
                    avoidCollisions
                    collisionPadding={12}
                    onOpenAutoFocus={(e: Event) => e.preventDefault()}
                    onInteractOutside={closePreview}
                >
                    {fetchState === "loading" && (
                        <div className={styles.loadingState}>
                            <span
                                className={`material-icons-round ${styles.loadingIcon}`}
                                aria-hidden="true"
                            >
                                sync
                            </span>
                            <span>Loading citation...</span>
                        </div>
                    )}

                    {fetchState === "error" && (
                        <div className={styles.errorState}>
                            <span className="material-icons-round" aria-hidden="true">
                                error_outline
                            </span>
                            <span>Unable to load citation</span>
                        </div>
                    )}

                    {fetchState === "loaded" && metadata && (
                        <div className={styles.metadataContent}>
                            <div className={styles.metadataType}>
                                <span className={styles.typeLabel}>{type}</span>
                                {metadata.year && (
                                    <span className={styles.year}>{metadata.year}</span>
                                )}
                            </div>
                            <h4 className={styles.title}>{metadata.title}</h4>
                            <p className={styles.authors}>
                                {formatAuthors(metadata.authors)}
                            </p>
                            {metadata.journal && (
                                <p className={styles.journal}>{metadata.journal}</p>
                            )}
                            {typeof metadata.citationCount === "number" && (
                                <p className={styles.citationCount}>
                                    Cited {formatCitationCount(metadata.citationCount)} times
                                </p>
                            )}
                            <div className={styles.footer}>
                                <a
                                    href={metadata.canonicalUrl ?? href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.openLink}
                                >
                                    <span className="material-icons-round" aria-hidden="true">
                                        open_in_new
                                    </span>
                                    Open
                                </a>
                            </div>
                        </div>
                    )}

                    <Popover.Arrow className={styles.arrow} />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
