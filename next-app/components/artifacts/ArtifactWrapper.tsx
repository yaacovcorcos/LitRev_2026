"use client";

import { useState } from "react";
import type { ArtifactType, ArtifactStatus } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

export type ArtifactWrapperProps = {
    artifactId: string;
    artifactType: ArtifactType;
    status: ArtifactStatus;
    title: string;
    version: number;
    provenance?: string;
    jumpToLink?: string;
    jumpToLabel?: string;
    onReview: (status: "accepted" | "rejected", note?: string) => void;
    children: React.ReactNode;
    summaryText?: string;
};

const STATUS_LABELS: Record<string, string> = {
    proposed: "Proposed",
    accepted: "Accepted",
    rejected: "Rejected",
    edited: "Edited",
    auto_applied: "Auto-applied",
    expired: "Expired",
    collapsed: "Collapsed",
};

const STATUS_ICONS: Record<string, string> = {
    accepted: "check_circle",
    rejected: "cancel",
    auto_applied: "check_circle",
    edited: "edit",
};

export function ArtifactWrapper({
    status,
    title,
    provenance,
    jumpToLink,
    jumpToLabel,
    children,
    summaryText,
}: ArtifactWrapperProps) {
    const isTerminal = status === "accepted" || status === "rejected" || status === "auto_applied" || status === "collapsed";
    const [isCollapsed, setIsCollapsed] = useState(isTerminal);
    const [showProvenance, setShowProvenance] = useState(false);

    const cardClass = [
        styles.artifactCard,
        status === "accepted" || status === "auto_applied" ? styles.artifactCardAccepted : "",
        status === "rejected" ? styles.artifactCardRejected : "",
        isCollapsed && status !== "proposed" ? styles.artifactCardCollapsed : "",
    ].filter(Boolean).join(" ");

    const statusBadgeClass = [
        styles.statusBadge,
        status === "proposed" ? styles.statusBadgeProposed : "",
        status === "accepted" || status === "edited" || status === "auto_applied" ? styles.statusBadgeAccepted : "",
        status === "rejected" ? styles.statusBadgeRejected : "",
    ].filter(Boolean).join(" ");

    // Collapsed / terminal view: one-liner summary
    if (isCollapsed && isTerminal && summaryText) {
        return (
            <div className={cardClass}>
                <div className={styles.summaryLine}>
                    {STATUS_ICONS[status] && (
                        <span className={`material-icons-round ${styles.summaryIcon}`}>
                            {STATUS_ICONS[status]}
                        </span>
                    )}
                    <span className={styles.summaryText}>{summaryText}</span>
                    {jumpToLink && jumpToLabel && (
                        <a href={jumpToLink} className={styles.jumpToLink}>
                            {jumpToLabel} &rarr;
                        </a>
                    )}
                    <button
                        type="button"
                        className={styles.collapseToggle}
                        onClick={() => setIsCollapsed(false)}
                        aria-label="Expand"
                    >
                        <span className="material-icons-round">expand_more</span>
                    </button>
                </div>
            </div>
        );
    }

    // Full view: header + body + provenance
    return (
        <div className={cardClass}>
            <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>{title}</span>
                <span className={statusBadgeClass}>{STATUS_LABELS[status] || status}</span>
                {isTerminal && (
                    <button
                        type="button"
                        className={`${styles.collapseToggle} ${!isCollapsed ? styles.collapseToggleExpanded : ""}`}
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        aria-label={isCollapsed ? "Expand" : "Collapse"}
                    >
                        <span className="material-icons-round">expand_more</span>
                    </button>
                )}
            </div>

            <div className={`${styles.cardBody} ${isCollapsed ? styles.cardBodyCollapsed : ""}`}>
                {children}

                {provenance && (
                    <>
                        <button
                            type="button"
                            className={`${styles.provenanceToggle} ${showProvenance ? styles.provenanceToggleExpanded : ""}`}
                            onClick={() => setShowProvenance(!showProvenance)}
                        >
                            <span className="material-icons-round">chevron_right</span>
                            Why?
                        </button>
                        {showProvenance && (
                            <div className={styles.provenanceContent}>{provenance}</div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
