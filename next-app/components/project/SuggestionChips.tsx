"use client";

import { useState, useEffect } from "react";
import type { SuggestionChip } from "@/lib/agent/suggestions";
import styles from "./SuggestionChips.module.css";

const DEFAULT_CHIPS: SuggestionChip[] = [
    { label: "Define PICO", prompt: "Help me define my PICO criteria for this systematic review", icon: "science", mode: "protocol", description: "Formulate your research question to guide study selection" },
    { label: "Search PubMed", prompt: "Search PubMed for studies related to my research question", icon: "search", mode: "search", description: "Find studies matching your protocol criteria" },
    { label: "Start drafting", prompt: "Help me start drafting the introduction section", icon: "edit_note", mode: "drafting", description: "Begin writing the introduction section" },
    { label: "Import studies", prompt: "How do I import studies from a PDF into my evidence ledger?", icon: "upload_file", mode: "general", description: "Add studies from a PDF into your evidence ledger" },
];

export type SuggestionChipsProps = {
    projectId: string;
    onSend: (prompt: string) => void;
    chips?: SuggestionChip[];
};

export function SuggestionChips({ projectId, onSend, chips }: SuggestionChipsProps) {
    const [dismissed, setDismissed] = useState(false);
    const displayChips = chips?.length ? chips : DEFAULT_CHIPS;

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
        <div className={styles.grid}>
            <div className={styles.gridInner}>
                <button
                    type="button"
                    className={styles.dismissBtn}
                    onClick={handleDismiss}
                    aria-label="Dismiss suggestions"
                >
                    <span className="material-icons-round">close</span>
                </button>
                <div className={styles.gridCards}>
                    {displayChips.map((chip, index) => (
                        <button
                            key={chip.prompt}
                            type="button"
                            className={styles.card}
                            style={{ animationDelay: `${index * 60}ms` }}
                            onClick={() => onSend(chip.prompt)}
                        >
                            <span className={`material-icons-round ${styles.cardIcon}`} aria-hidden="true">{chip.icon}</span>
                            <span className={styles.cardBody}>
                                <span className={styles.cardLabel}>{chip.label}</span>
                                <span className={styles.cardDesc}>{chip.description}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
