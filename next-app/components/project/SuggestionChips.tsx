"use client";

import { useState, useEffect } from "react";
import styles from "./SuggestionChips.module.css";

const DEFAULT_CHIPS = [
    { label: "Define PICO", prompt: "Help me define my PICO criteria for this systematic review" },
    { label: "Search PubMed", prompt: "Search PubMed for studies related to my research question" },
    { label: "Start drafting", prompt: "Help me start drafting the introduction section" },
    { label: "Import studies", prompt: "How do I import studies from a PDF into my evidence ledger?" },
];

export type SuggestionChipsProps = {
    projectId: string;
    onSend: (prompt: string) => void;
};

export function SuggestionChips({ projectId, onSend }: SuggestionChipsProps) {
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const key = `litrev_chips_dismissed_${projectId}`;
        const stored = window.localStorage.getItem(key);
        if (stored === "true") setDismissed(true);
    }, [projectId]);

    const handleDismiss = () => {
        setDismissed(true);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(`litrev_chips_dismissed_${projectId}`, "true");
        }
    };

    if (dismissed) return null;

    return (
        <div className={styles.chips}>
            <div className={styles.chipRow}>
                {DEFAULT_CHIPS.map((chip) => (
                    <button
                        key={chip.label}
                        type="button"
                        className={styles.chip}
                        onClick={() => onSend(chip.prompt)}
                    >
                        {chip.label}
                    </button>
                ))}
            </div>
            <button
                type="button"
                className={styles.dismissBtn}
                onClick={handleDismiss}
                aria-label="Dismiss suggestions"
            >
                <span className="material-icons-round">close</span>
            </button>
        </div>
    );
}
