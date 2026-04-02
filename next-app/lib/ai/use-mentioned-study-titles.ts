"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    const activeKeys = useMemo(
        () => new Set(mentions.map((study) => study.key)),
        [mentions],
    );

    useEffect(() => {
        attemptedKeysRef.current = new Set(
            [...attemptedKeysRef.current].filter((key) => activeKeys.has(key))
        );
    }, [activeKeys]);

    const visibleHydratedTitles = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(hydratedTitles).filter(([key]) => activeKeys.has(key)),
            ),
        [activeKeys, hydratedTitles],
    );

    useEffect(() => {
        let cancelled = false;

        for (const study of mentions) {
            if (study.title) continue;
            if (visibleHydratedTitles[study.key]) continue;
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
    }, [mentions, visibleHydratedTitles]);

    return visibleHydratedTitles;
}
