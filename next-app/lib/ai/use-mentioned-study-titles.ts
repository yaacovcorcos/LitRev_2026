"use client";

import { useEffect, useRef, useState } from "react";
import { fetchCitationMetadata } from "@/app/actions/citation";
import { loadCitationMetadataWithClientCache } from "@/lib/citation-preview-cache";
import { resolveCitationKey } from "@/lib/citation-key";
import type { MentionedStudy } from "@/lib/ai/mentioned-studies";

function resolveHydrationUrl(study: MentionedStudy): string | null {
    if (study.sourceUrl && resolveCitationKey(study.sourceUrl)) {
        return study.sourceUrl;
    }
    if (study.doi) {
        return `https://doi.org/${study.doi}`;
    }
    if (study.pmid) {
        return `https://pubmed.ncbi.nlm.nih.gov/${study.pmid}/`;
    }
    return null;
}

export function useMentionedStudyTitles(mentions: MentionedStudy[]): Record<string, string> {
    const [hydratedTitles, setHydratedTitles] = useState<Record<string, string>>({});
    const attemptedKeysRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const activeKeys = new Set(mentions.map((study) => study.key));

        attemptedKeysRef.current = new Set(
            [...attemptedKeysRef.current].filter((key) => activeKeys.has(key))
        );

        setHydratedTitles((prev) => {
            const nextEntries = Object.entries(prev).filter(([key]) => activeKeys.has(key));
            if (nextEntries.length === Object.keys(prev).length) return prev;
            return Object.fromEntries(nextEntries);
        });
    }, [mentions]);

    useEffect(() => {
        let cancelled = false;

        for (const study of mentions) {
            if (study.title) continue;
            if (hydratedTitles[study.key]) continue;
            if (attemptedKeysRef.current.has(study.key)) continue;

            const url = resolveHydrationUrl(study);
            if (!url) continue;

            attemptedKeysRef.current.add(study.key);

            void loadCitationMetadataWithClientCache(url, fetchCitationMetadata).then(({ result }) => {
                if (cancelled || !result.success) return;
                const title = result.data.title?.trim();
                if (!title) return;

                setHydratedTitles((prev) => (
                    prev[study.key]
                        ? prev
                        : {
                            ...prev,
                            [study.key]: title,
                        }
                ));
            });
        }

        return () => {
            cancelled = true;
        };
    }, [hydratedTitles, mentions]);

    return hydratedTitles;
}
