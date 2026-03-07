"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRecentActivityAction } from "@/app/actions/activity";
import type { ProjectActivityItem } from "@/types/activity";
import styles from "./RecentActivityPanel.module.css";

type RecentActivityPanelProps = {
    projectId: string;
    limit?: number;
    deferUntilIdle?: boolean;
};

function formatRelativeTime(value: string): string {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "";

    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

    if (Math.abs(diffDays) >= 1) return formatter.format(-diffDays, "day");
    if (Math.abs(diffHours) >= 1) return formatter.format(-diffHours, "hour");
    return formatter.format(-Math.max(1, diffMinutes), "minute");
}

function ActivityRow({ item }: { item: ProjectActivityItem }) {
    const label = (
        <div className={styles.activityRow}>
            <span className={`material-icons-round ${styles.activityIcon}`} aria-hidden>
                {item.icon}
            </span>
            <span className={styles.activityTime} title={new Date(item.timestamp).toLocaleString()}>
                {formatRelativeTime(item.timestamp)}
            </span>
            <span className={styles.activityLabel}>{item.label}</span>
        </div>
    );

    if (!item.href) return <li>{label}</li>;

    return (
        <li>
            <Link href={item.href} className={styles.activityLink}>
                {label}
            </Link>
        </li>
    );
}

function LoadingRows() {
    return (
        <ul className={styles.activityList} aria-label="Loading recent activity">
            {[0, 1, 2].map((index) => (
                <li key={index} className={styles.loadingRow}>
                    <span className={`${styles.loadingBlock} ${styles.loadingIcon}`} />
                    <span className={`${styles.loadingBlock} ${styles.loadingTime}`} />
                    <span className={`${styles.loadingBlock} ${styles.loadingLabel}`} />
                </li>
            ))}
        </ul>
    );
}

export function RecentActivityPanel({
    projectId,
    limit = 8,
    deferUntilIdle = false,
}: RecentActivityPanelProps) {
    const [items, setItems] = useState<ProjectActivityItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [loadEnabled, setLoadEnabled] = useState(() => !deferUntilIdle);

    useEffect(() => {
        if (!deferUntilIdle) {
            setLoadEnabled(true);
            return;
        }

        let idleId: number | null = null;
        let timeoutId: number | null = null;
        const hasWindow = typeof window !== "undefined";
        const supportsIdleCallback = hasWindow && typeof window.requestIdleCallback === "function";
        const supportsIdleCancel = hasWindow && typeof window.cancelIdleCallback === "function";
        const enableLoad = () => setLoadEnabled(true);

        setLoadEnabled(false);
        setItems([]);
        setHasError(false);
        setIsLoading(true);

        if (supportsIdleCallback) {
            idleId = window.requestIdleCallback(enableLoad, { timeout: 500 });
        } else if (hasWindow) {
            timeoutId = window.setTimeout(enableLoad, 250);
        } else {
            enableLoad();
        }

        return () => {
            if (idleId != null && supportsIdleCancel) {
                window.cancelIdleCallback(idleId);
            }
            if (timeoutId != null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [deferUntilIdle, limit, projectId]);

    useEffect(() => {
        if (!loadEnabled) return;

        let isActive = true;
        setIsLoading(true);
        setHasError(false);

        getRecentActivityAction(projectId, limit)
            .then((result) => {
                if (!isActive) return;
                if (result.success) setItems(result.data);
            })
            .catch(() => {
                if (!isActive) return;
                setHasError(true);
                setItems([]);
            })
            .finally(() => {
                if (isActive) setIsLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, [limit, loadEnabled, projectId]);

    if (isLoading) return <LoadingRows />;

    if (hasError) {
        return <p className={styles.activityError}>Could not load recent activity.</p>;
    }

    if (items.length === 0) {
        return <p className={styles.activityEmpty}>No activity yet.</p>;
    }

    return (
        <ul className={styles.activityList}>
            {items.map((item) => (
                <ActivityRow key={item.id} item={item} />
            ))}
        </ul>
    );
}
