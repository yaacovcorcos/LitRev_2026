"use client";

import type { Study, StudyDetails } from "@/types/ledger";
import styles from "./StudyQuickInfo.module.css";

type StudyQuickInfoProps = {
    study: Study;
};

export function StudyQuickInfo({ study }: StudyQuickInfoProps) {
    const d: StudyDetails = study.details ?? {};

    const items: { icon: string; label: string; value: string; href?: string }[] = [];

    // Journal
    if (d.journal) {
        items.push({ icon: "menu_book", label: "Journal", value: d.journal });
    }

    // DOI
    if (d.doi) {
        items.push({
            icon: "link",
            label: "DOI",
            value: d.doi,
            href: `https://doi.org/${d.doi}`,
        });
    }

    // PubMed
    if (d.pmid) {
        items.push({
            icon: "science",
            label: "PubMed",
            value: d.pmid,
            href: `https://pubmed.ncbi.nlm.nih.gov/${d.pmid}/`,
        });
    }

    // Source URL
    if (typeof d.sourceUrl === "string" && d.sourceUrl.length > 0) {
        items.push({
            icon: "open_in_new",
            label: "Source",
            value: d.sourceUrl,
            href: d.sourceUrl,
        });
    }

    // Study Type
    if (d.studyType) {
        items.push({ icon: "category", label: "Type", value: d.studyType });
    }

    if (items.length === 0) {
        return null;
    }

    return (
        <div className={styles.container}>
            {items.map((item, idx) => (
                <div key={idx} className={styles.chip}>
                    <span className={`material-icons-round ${styles.icon}`}>{item.icon}</span>
                    <span className={styles.label}>{item.label}:</span>
                    {item.href ? (
                        <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                        >
                            {item.value}
                        </a>
                    ) : (
                        <span className={styles.value}>{item.value}</span>
                    )}
                </div>
            ))}
        </div>
    );
}
