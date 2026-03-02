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
const TOUCH_HOLD_THRESHOLD = 200; // ms to distinguish tap from hold

/**
 * Citation link with hover/tap preview card.
 * Lazy-fetches metadata only when preview is requested.
 */
export function CitationPreview({ href, type, children, anchorProps }: CitationPreviewProps) {
    const [open, setOpen] = useState(false);
    const [fetchState, setFetchState] = useState<FetchState>("idle");
    const [metadata, setMetadata] = useState<CitationMetadata | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartRef = useRef<number>(0);
    const isTouchDeviceRef = useRef(false);
    const fetchedRef = useRef(false);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
            }
        };
    }, []);

    const doFetch = useCallback(async () => {
        if (fetchedRef.current || fetchState === "loading") return;

        setFetchState("loading");
        const { result } = await loadCitationMetadataWithClientCache(href, fetchCitationMetadata);

        if (result.success) {
            setMetadata(result.data);
            setFetchState("loaded");
            fetchedRef.current = true;
        } else {
            setFetchState("error");
        }
    }, [href, fetchState]);

    const openPreview = useCallback(() => {
        setOpen(true);
        if (!fetchedRef.current && fetchState !== "loading") {
            void doFetch();
        }
    }, [doFetch, fetchState]);

    const closePreview = useCallback(() => {
        setOpen(false);
    }, []);

    // ── Desktop: hover intent ────────────────────────────────────────────────
    const handleMouseEnter = useCallback(() => {
        if (isTouchDeviceRef.current) return;
        hoverTimerRef.current = setTimeout(() => {
            openPreview();
        }, HOVER_INTENT_DELAY);
    }, [openPreview]);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        // Don't close immediately - let Radix handle it when moving to content
    }, []);

    // ── Keyboard: focus ──────────────────────────────────────────────────────
    const handleFocus = useCallback(
        (e: FocusEvent) => {
            // Only open on keyboard focus (not mouse click focus)
            if (e.target === e.currentTarget) {
                openPreview();
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
                    openPreview();
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
