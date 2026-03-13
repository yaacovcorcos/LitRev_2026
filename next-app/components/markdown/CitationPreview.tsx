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
import {
    continueCitationMetadata,
    fetchCitationMetadata,
} from "@/app/actions/citation";
import type {
    CitationSuccessResult,
} from "@/lib/citation-types";
import {
    clearCitationContinuationAttemptForUrl,
    loadCitationMetadataWithClientCache,
    markCitationContinuationAttempted,
    patchCitationMetadataInClientCache,
    shouldAttemptCitationContinuation,
} from "@/lib/citation-preview-cache";
import { getCitationType, resolveCitationKey } from "@/lib/citation-key";
import {
    isCitationHoverContinuationEnabled,
    isCitationHoverPrefetchEnabled,
} from "@/lib/citation-preview-feature-flags";
import { recordCitationPreviewMetric } from "@/lib/ai/citation-preview-telemetry";
import type {
    CitationPreviewMetricPayload,
    CitationPreviewSurface,
    CitationPreviewTrigger,
} from "@/types/citation-preview-telemetry";
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
    const [citationResult, setCitationResult] = useState<CitationSuccessResult | null>(null);
    const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartRef = useRef<number>(0);
    const isTouchDeviceRef = useRef(false);
    const fetchedRef = useRef(false);
    const continuationRequestIdRef = useRef(0);
    const currentHrefRef = useRef(href);
    const citationKey = resolveCitationKey(href)?.cacheKey ?? null;
    const citationType = getCitationType(href);
    const surface = inferSurfaceFromPathname();
    const prefetchEnabled = isCitationHoverPrefetchEnabled();
    const continuationEnabled = isCitationHoverContinuationEnabled();

    const trackMetric = useCallback(
        (
            type:
                | "hover_intent_started"
                | "prefetch_started"
                | "popover_opened"
                | "metadata_request_started"
                | "metadata_request_completed"
                | "metadata_request_failed"
                | "continuation_completed"
                | "continuation_failed",
            payload: Pick<
                CitationPreviewMetricPayload,
                | "trigger"
                | "fromCache"
                | "latencyMs"
                | "upstreamSource"
                | "resolutionPath"
                | "reason"
                | "resolvedWithCitationCount"
                | "hadDoiFallbackCandidate"
                | "continuationRecoveredCount"
                | "errorCode"
            > = {}
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
        currentHrefRef.current = href;
        continuationRequestIdRef.current += 1;
    }, [href]);

    useEffect(() => {
        return () => {
            continuationRequestIdRef.current += 1;
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
            setCitationResult(result);
            setFetchState("loaded");
            fetchedRef.current = true;
            if (typeof result.data.citationCount === "number") {
                clearCitationContinuationAttemptForUrl(href);
            }
            trackMetric("metadata_request_completed", {
                trigger,
                fromCache,
                latencyMs,
                upstreamSource:
                    result.data.citationCountSource
                    ?? (citationType === "PubMed"
                        ? "pubmed"
                        : citationType === "DOI"
                            ? "crossref"
                            : "unknown"),
                resolutionPath: result.meta.diagnostics.resolutionPath,
                reason: result.meta.diagnostics.reason,
                resolvedWithCitationCount: result.meta.diagnostics.resolvedWithCitationCount,
                hadDoiFallbackCandidate: result.meta.diagnostics.hadDoiFallbackCandidate,
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

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        if (!nextOpen) {
            continuationRequestIdRef.current += 1;
        }
        setOpen(nextOpen);
    }, []);

    const closePreview = useCallback(() => {
        handleOpenChange(false);
    }, [handleOpenChange]);

    useEffect(() => {
        const diagnostics = citationResult?.meta.diagnostics;
        const metadata = citationResult?.data;

        if (!open || fetchState !== "loaded" || !citationResult || !metadata || !diagnostics) {
            return;
        }

        if (typeof metadata.citationCount === "number") {
            clearCitationContinuationAttemptForUrl(href);
            return;
        }

        const isRetryable =
            diagnostics.reason === "icite_timeout"
            || diagnostics.reason === "crossref_timeout"
            || diagnostics.reason === "budget_exhausted";

        if (!continuationEnabled || !isRetryable) {
            return;
        }

        if (!shouldAttemptCitationContinuation(href, diagnostics)) {
            return;
        }

        markCitationContinuationAttempted(href, diagnostics);
        const requestId = ++continuationRequestIdRef.current;
        const startedAt = performance.now();

        void continueCitationMetadata(href).then((result) => {
            if (
                continuationRequestIdRef.current !== requestId
                || currentHrefRef.current !== href
            ) {
                return;
            }

            const latencyMs = Math.round(Math.max(0, performance.now() - startedAt));

            if (!result.success) {
                trackMetric("continuation_failed", {
                    latencyMs,
                    errorCode: result.error,
                });
                return;
            }

            const patched = patchCitationMetadataInClientCache(href, result);
            const continuationRecoveredCount =
                typeof patched.data.citationCount === "number"
                && typeof metadata.citationCount !== "number";

            if (continuationRecoveredCount) {
                clearCitationContinuationAttemptForUrl(href);
            }

            setCitationResult(patched);
            trackMetric("continuation_completed", {
                latencyMs,
                resolutionPath: patched.meta.diagnostics.resolutionPath,
                reason: patched.meta.diagnostics.reason,
                resolvedWithCitationCount: patched.meta.diagnostics.resolvedWithCitationCount,
                hadDoiFallbackCandidate: patched.meta.diagnostics.hadDoiFallbackCandidate,
                continuationRecoveredCount,
            });
        });
    }, [citationResult, continuationEnabled, fetchState, href, open, trackMetric]);

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
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
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

                    {fetchState === "loaded" && citationResult && (
                        <div className={styles.metadataContent}>
                            <div className={styles.metadataType}>
                                <span className={styles.typeLabel}>{type}</span>
                                {citationResult.data.year && (
                                    <span className={styles.year}>{citationResult.data.year}</span>
                                )}
                            </div>
                            <h4 className={styles.title}>{citationResult.data.title}</h4>
                            <p className={styles.authors}>
                                {formatAuthors(citationResult.data.authors)}
                            </p>
                            {typeof citationResult.data.citationCount === "number" && (
                                <p className={styles.citationCount}>
                                    Cited {formatCitationCount(citationResult.data.citationCount)} times
                                </p>
                            )}
                            <div className={styles.footer}>
                                <div className={styles.footerMeta}>
                                    {citationResult.data.journal ? (
                                        <p className={styles.journal}>{citationResult.data.journal}</p>
                                    ) : null}
                                </div>
                                <a
                                    href={citationResult.data.canonicalUrl ?? href}
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
