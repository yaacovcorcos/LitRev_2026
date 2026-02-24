/**
 * useProjectState
 * Assembles a ProjectStateSnapshot from available contexts.
 * Protocol data fetched via server action (ProtocolProvider is page-scoped).
 * (planC Phase 4.2)
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { useLedger } from "@/contexts/LedgerContext";
import { getProtocolAction } from "@/app/actions/protocols";
import type { ProtocolData } from "@/types/protocol";
import type { ProjectStateSnapshot } from "@/lib/agent/suggestions";

export function useProjectState(projectId: string): ProjectStateSnapshot {
    const { getStudiesByProject } = useLedger();
    const [protocol, setProtocol] = useState<ProtocolData | null>(null);

    useEffect(() => {
        if (!projectId) return;
        getProtocolAction(projectId).then((r) => { if (r.success) setProtocol(r.data); }).catch(() => {});
    }, [projectId]);

    return useMemo(() => {
        const studies = getStudiesByProject(projectId);
        const pico = protocol?.pico;
        const hasProtocol = !!(
            pico?.population || pico?.intervention || pico?.comparison || pico?.outcome
        );

        let unscreened = 0;
        let included = 0;
        let excluded = 0;
        let maybe = 0;

        for (const s of studies) {
            const d = s.details;
            if (!d?.triageDecision) {
                unscreened++;
                continue;
            }
            if (d.triageDecision === "keep") included++;
            else if (d.triageDecision === "exclude") excluded++;
            else if (d.triageDecision === "maybe") maybe++;
        }

        return {
            hasProtocol,
            studyCount: studies.length,
            unscreenedCount: unscreened,
            includedCount: included,
            excludedCount: excluded,
            maybeCount: maybe,
        };
    }, [projectId, getStudiesByProject, protocol]);
}
