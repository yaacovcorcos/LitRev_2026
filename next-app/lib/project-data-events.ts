"use client";

import type { CacheInvalidationReason } from "@/lib/project-data-policy";
import { buildProtocolArtifactPatch, type ProtocolArtifactPatch } from "@/lib/protocol-live-sync";
import type { MemoryProposalPayload } from "@/types/artifacts";

export type ProjectDataDomain = "ledger" | "notes" | "memory" | "protocol" | "draft";

export type ProjectDataChangedDetail = {
    projectId: string;
    domains: ProjectDataDomain[];
    reason: CacheInvalidationReason;
    source?: string;
    protocolPatch?: ProtocolArtifactPatch;
};

const PROJECT_DATA_CHANGED_EVENT = "litrev:project-data-changed";
const LEDGER_CHANGED_EVENT = "litrev:ledger-changed";

export function dispatchProjectDataChanged(detail: ProjectDataChangedDetail) {
    if (typeof window === "undefined") return;
    if (!detail.projectId) return;

    const domains = Array.from(new Set(detail.domains));
    if (domains.length === 0) return;

    window.dispatchEvent(
        new CustomEvent<ProjectDataChangedDetail>(PROJECT_DATA_CHANGED_EVENT, {
            detail: { ...detail, domains },
        })
    );

    // Backward-compat bridge while ledger listeners migrate.
    if (domains.includes("ledger")) {
        window.dispatchEvent(new CustomEvent(LEDGER_CHANGED_EVENT, { detail: { projectId: detail.projectId } }));
    }
}

export function addProjectDataChangedListener(
    listener: (detail: ProjectDataChangedDetail) => void
): () => void {
    if (typeof window === "undefined") return () => {};

    const handler = (event: Event) => {
        const detail = (event as CustomEvent<ProjectDataChangedDetail>).detail;
        if (!detail?.projectId || !Array.isArray(detail.domains)) return;
        listener(detail);
    };

    window.addEventListener(PROJECT_DATA_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(PROJECT_DATA_CHANGED_EVENT, handler as EventListener);
}

export function getChangedDomainsForAcceptedArtifact(
    artifactType: string,
    payload: unknown
): ProjectDataDomain[] {
    switch (artifactType) {
        case "study_proposal":
        case "study_update":
        case "screening_batch":
            return ["ledger"];
        case "protocol_suggestion":
        case "criteria_card":
            return ["protocol", "memory"];
        case "draft_diff":
            return ["draft"];
        case "memory_forget_proposal":
            return ["memory"];
        case "memory_proposal": {
            const memoryPayload = payload as Partial<MemoryProposalPayload> | null;
            if (memoryPayload?.memoryType === "note") {
                return ["memory", "notes"];
            }
            return ["memory"];
        }
        case "evidence_table":
            return ["notes"];
        default:
            return [];
    }
}

export function getProtocolPatchForAcceptedArtifact(
    artifactType: string,
    payload: unknown
): ProtocolArtifactPatch | null {
    return buildProtocolArtifactPatch(artifactType, payload);
}
