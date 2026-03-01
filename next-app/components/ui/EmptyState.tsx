"use client";

import Link from "next/link";
import styles from "./EmptyState.module.css";

export type EmptyStateVariant = "info" | "warning" | "error";

type ActionProps = {
    label: string;
    onClick?: () => void;
    href?: string;
};

export type EmptyStateProps = {
    variant?: EmptyStateVariant;
    icon?: string;
    title: string;
    description?: string;
    primaryAction?: ActionProps;
    secondaryAction?: ActionProps;
    className?: string;
};

function ActionButton({ label, onClick, href, variant }: ActionProps & { variant: "primary" | "secondary" }) {
    const className = variant === "primary" ? styles.primaryAction : styles.secondaryAction;

    if (href) {
        return (
            <Link href={href} className={className}>
                {label}
            </Link>
        );
    }

    return (
        <button type="button" className={className} onClick={onClick}>
            {label}
        </button>
    );
}

export function EmptyState({
    variant = "info",
    icon,
    title,
    description,
    primaryAction,
    secondaryAction,
    className,
}: EmptyStateProps) {
    const defaultIcon = variant === "error" ? "error_outline" : variant === "warning" ? "warning_amber" : "info_outline";
    const displayIcon = icon ?? defaultIcon;

    return (
        <div
            className={`${styles.root} ${styles[variant]} ${className ?? ""}`}
            role={variant === "error" ? "alert" : "status"}
            aria-live="polite"
        >
            <span className={`material-icons-round ${styles.icon}`} aria-hidden="true">
                {displayIcon}
            </span>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
            {(primaryAction || secondaryAction) && (
                <div className={styles.actions}>
                    {primaryAction && <ActionButton {...primaryAction} variant="primary" />}
                    {secondaryAction && <ActionButton {...secondaryAction} variant="secondary" />}
                </div>
            )}
        </div>
    );
}

/** Skeleton placeholder for loading states (same layout as EmptyState). */
export function EmptyStateSkeleton({ className }: { className?: string }) {
    return (
        <div className={`${styles.root} ${styles.skeleton} ${className ?? ""}`} aria-hidden="true">
            <div className={styles.skeletonIcon} />
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonDescription} />
        </div>
    );
}
