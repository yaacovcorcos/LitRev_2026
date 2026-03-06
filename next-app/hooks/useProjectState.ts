/**
 * useProjectState
 * Assembles a ProjectStateSnapshot from shared project data contexts.
 */

"use client";

import { useEffect, useMemo } from "react";
import { useLedger } from "@/contexts/LedgerContext";
import { useProjectData } from "@/hooks/useProjectData";
import { isProtocolPopulated, type ProtocolData } from "@/types/protocol";
import type { ProjectStateSnapshot } from "@/lib/agent/suggestions";
import { useProjects } from "@/contexts/ProjectsContext";

export type UseProjectStateOptions = {
    bootstrap?: boolean;
};

export type UseProjectStateResult = {
    snapshot: ProjectStateSnapshot;
    hasProtocolForRouting: boolean | undefined;
    isReady: boolean;
};

export function useProjectState(
    projectId: string,
    options: UseProjectStateOptions = {},
): UseProjectStateResult {
    const { bootstrap = false } = options;
    const { getStudiesByProject, isProjectLoaded, ensureProjectLoaded } = useLedger();
    const { protocol: protocolSlice, warmDomain } = useProjectData();
    const { getProjectById } = useProjects();
    const protocol: ProtocolData | null = protocolSlice.data;
    const project = getProjectById(projectId);
    const projectPaperCount = project?.papers ?? project?.progress?.papers ?? 0;
    const ledgerLoaded = isProjectLoaded(projectId);
    const studies = getStudiesByProject(projectId);
    const protocolSettled = protocolSlice.state === "ready" || protocolSlice.state === "error";

    useEffect(() => {
        if (!bootstrap || !projectId) return;

        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let idleId: number | null = null;
        const hasWindow = typeof window !== "undefined";
        const bootstrapState = () => {
            ensureProjectLoaded(projectId);
            if (protocolSlice.state === "idle") {
                warmDomain("protocol");
            }
        };

        if (hasWindow && "requestIdleCallback" in window) {
            idleId = window.requestIdleCallback(bootstrapState, { timeout: 250 });
        } else if (hasWindow) {
            timeoutId = globalThis.setTimeout(bootstrapState, 150);
        } else {
            bootstrapState();
        }

        return () => {
            if (idleId != null && hasWindow && "cancelIdleCallback" in window) {
                window.cancelIdleCallback(idleId);
            }
            if (timeoutId != null) {
                globalThis.clearTimeout(timeoutId);
            }
        };
    }, [bootstrap, ensureProjectLoaded, projectId, protocolSlice.state, warmDomain]);

    const snapshot = useMemo(() => {
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
            studyCount: ledgerLoaded ? studies.length : projectPaperCount,
            unscreenedCount: unscreened,
            includedCount: included,
            excludedCount: excluded,
            maybeCount: maybe,
        };
    }, [ledgerLoaded, projectPaperCount, protocol, studies]);

    return {
        snapshot,
        hasProtocolForRouting: protocolSlice.state === "ready" ? snapshot.hasProtocol : undefined,
        isReady: ledgerLoaded && protocolSettled,
    };
}
