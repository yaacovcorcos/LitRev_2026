/**
 * useProjectState
 * Assembles a ProjectStateSnapshot from shared project data contexts.
 */

"use client";

import { useMemo } from "react";
import { useLedger } from "@/contexts/LedgerContext";
import { useProjectData } from "@/hooks/useProjectData";
import { isProtocolPopulated, type ProtocolData } from "@/types/protocol";
import type { ProjectStateSnapshot } from "@/lib/agent/suggestions";

export function useProjectState(projectId: string): ProjectStateSnapshot {
    const { getStudiesByProject } = useLedger();
    const { protocol: protocolSlice } = useProjectData();
    const protocol: ProtocolData | null = protocolSlice.data;

    return useMemo(() => {
        const studies = getStudiesByProject(projectId);
        const hasProtocol = protocol ? isProtocolPopulated(protocol) : false;

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
