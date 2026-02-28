"use client";

import { useState, useCallback } from "react";
import { formatCitation, getCitationStyles, CitationStyle } from "@/lib/citations";
import type { Study } from "@/types/ledger";
import styles from "./CitationBlock.module.css";

type CitationBlockProps = {
    study: Study;
};

export function CitationBlock({ study }: CitationBlockProps) {
    const [style, setStyle] = useState<CitationStyle>("vancouver");
    const [copied, setCopied] = useState(false);

    const citation = formatCitation(study, style);
    const citationStyles = getCitationStyles();

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(citation);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy citation", err);
        }
    }, [citation]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>Citation</h3>
                <select
                    className={styles.styleSelect}
                    value={style}
                    onChange={(e) => setStyle(e.target.value as CitationStyle)}
                >
                    {citationStyles.map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className={styles.citationBox}>
                <p className={styles.citationText}>{citation}</p>
                <button className={styles.copyBtn} onClick={handleCopy} aria-label="Copy citation" title="Copy citation">
                    <span className="material-icons-round">{copied ? "check" : "content_copy"}</span>
                </button>
            </div>
        </div>
    );
}
