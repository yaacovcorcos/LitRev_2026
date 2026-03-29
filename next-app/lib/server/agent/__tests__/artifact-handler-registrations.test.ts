import { describe, expect, it } from "vitest";
import type { ArtifactType } from "@/types/artifacts";
import type { ApplyFunction, RestoreFunction, SnapshotReader } from "@/lib/server/agent/artifact-execution";
import { registerArtifactHandlers } from "@/lib/server/agent/artifact-handler-registrations";

describe("artifact-handler-registrations", () => {
    it("registers apply, snapshot, and restore handlers for the supported artifact families", () => {
        const applyFunctions = new Map<ArtifactType, ApplyFunction>();
        const snapshotReaders = new Map<ArtifactType, SnapshotReader>();
        const restoreFunctions = new Map<ArtifactType, RestoreFunction>();

        registerArtifactHandlers({
            applyFunctions,
            snapshotReaders,
            restoreFunctions,
        });

        expect(Array.from(applyFunctions.keys()).sort()).toEqual([
            "criteria_card",
            "draft_diff",
            "evidence_table",
            "memory_forget_proposal",
            "memory_proposal",
            "protocol_suggestion",
            "screening_batch",
            "study_proposal",
            "study_update",
        ]);
        expect(Array.from(snapshotReaders.keys()).sort()).toEqual([
            "criteria_card",
            "draft_diff",
            "protocol_suggestion",
            "study_proposal",
            "study_update",
        ]);
        expect(Array.from(restoreFunctions.keys()).sort()).toEqual([
            "criteria_card",
            "draft_diff",
            "protocol_suggestion",
            "study_proposal",
            "study_update",
        ]);
    });
});
