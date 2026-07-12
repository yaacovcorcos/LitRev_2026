import { describe, expect, it, vi } from "vitest";
import type { ArtifactType } from "@/types/artifacts";
import type { AppliedStateReader, ApplyFunction, RestoreFunction, SnapshotReader } from "@/lib/server/agent/artifact-execution";
import {
    ARTIFACT_UNDO_SUPPORTED_TYPES,
    registerArtifactHandlers,
} from "@/lib/server/agent/artifact-handler-registrations";

describe("artifact-handler-registrations", () => {
    it("registers apply, snapshot, and restore handlers for the supported artifact families", () => {
        const applyFunctions = new Map<ArtifactType, ApplyFunction>();
        const snapshotReaders = new Map<ArtifactType, SnapshotReader>();
        const appliedStateReaders = new Map<ArtifactType, AppliedStateReader>();
        const restoreFunctions = new Map<ArtifactType, RestoreFunction>();

        registerArtifactHandlers({
            applyFunctions,
            snapshotReaders,
            appliedStateReaders,
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
            "study_deletion",
            "study_proposal",
            "study_update",
        ]);
        expect(Array.from(snapshotReaders.keys()).sort()).toEqual([
            "criteria_card",
            "draft_diff",
            "protocol_suggestion",
            "study_deletion",
            "study_proposal",
            "study_update",
        ]);
        expect(Array.from(appliedStateReaders.keys()).sort()).toEqual(
            [...ARTIFACT_UNDO_SUPPORTED_TYPES].sort(),
        );
        expect(Array.from(restoreFunctions.keys()).sort()).toEqual(
            [...ARTIFACT_UNDO_SUPPORTED_TYPES].sort(),
        );
    });

    it("soft-deletes an approved study deletion and can restore its captured state", async () => {
        const applyFunctions = new Map<ArtifactType, ApplyFunction>();
        const snapshotReaders = new Map<ArtifactType, SnapshotReader>();
        const appliedStateReaders = new Map<ArtifactType, AppliedStateReader>();
        const restoreFunctions = new Map<ArtifactType, RestoreFunction>();
        registerArtifactHandlers({ applyFunctions, snapshotReaders, appliedStateReaders, restoreFunctions });

        const updateMany = vi.fn()
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        const appliedAt = new Date("2026-07-12T10:00:00.000Z");
        const findFirst = vi.fn()
            .mockResolvedValueOnce({ id: "study-1", deletedAt: null, updatedAt: new Date("2026-07-12T09:00:00.000Z") })
            .mockResolvedValueOnce({ id: "study-1", deletedAt: appliedAt, updatedAt: appliedAt })
            .mockResolvedValueOnce({ id: "study-1", deletedAt: appliedAt, updatedAt: appliedAt });
        const context = {
            db: { study: { findFirst, updateMany }, $queryRaw: vi.fn().mockResolvedValue([{ id: "study-1" }]) },
            projectId: "project-1",
        } as never;
        const artifact: { payload: Record<string, unknown>; snapshot: unknown } = {
            payload: { studyId: "study-1", title: "Study One", reason: "Duplicate" },
            snapshot: null,
        };

        const before = await snapshotReaders.get("study_deletion")!(context, artifact as never);
        expect(before).toEqual({
            id: "study-1",
            version: "2026-07-12T09:00:00.000Z",
            deletedAt: null,
        });
        await expect(applyFunctions.get("study_deletion")!(context, artifact as never)).resolves.toBeUndefined();
        expect(updateMany).toHaveBeenNthCalledWith(1, {
            where: { id: "study-1", projectId: "project-1", deletedAt: null },
            data: { deletedAt: expect.any(Date) },
        });

        const applied = await appliedStateReaders.get("study_deletion")!(context, artifact as never);
        artifact.snapshot = { undoSnapshotVersion: 1, before, applied };

        await expect(restoreFunctions.get("study_deletion")!(context, artifact as never)).resolves.toBeUndefined();
        expect(updateMany).toHaveBeenNthCalledWith(2, {
            where: { id: "study-1", projectId: "project-1" },
            data: { deletedAt: null },
        });
    });

    it("applies criteria deltas against current protocol state without overwriting concurrent edits", async () => {
        const applyFunctions = new Map<ArtifactType, ApplyFunction>();
        const snapshotReaders = new Map<ArtifactType, SnapshotReader>();
        const appliedStateReaders = new Map<ArtifactType, AppliedStateReader>();
        const restoreFunctions = new Map<ArtifactType, RestoreFunction>();
        registerArtifactHandlers({ applyFunctions, snapshotReaders, appliedStateReaders, restoreFunctions });

        const currentData = {
            eligibility: {
                inclusion: ["Adults", "Concurrent criterion"],
                exclusion: ["Case reports"],
            },
        };
        const upsert = vi.fn(async ({ update }: { update: { data: unknown } }) => ({ data: update.data }));
        const context = {
            db: {
                protocol: {
                    findUnique: vi.fn().mockResolvedValue({ data: structuredClone(currentData) }),
                    upsert,
                },
            },
            projectId: "project-1",
        } as never;
        const artifact = {
            payload: {
                // Stale preview omits the concurrent criterion; the mutation
                // delta, not these arrays, is authoritative during apply.
                inclusion: ["Adults", "RCT"],
                exclusion: ["Case reports"],
                rationale: "Add RCT",
                mutation: { action: "add", type: "inclusion", criterion: "RCT" },
            },
        } as never;

        await applyFunctions.get("criteria_card")!(context, artifact);

        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
            update: {
                data: expect.objectContaining({
                    eligibility: {
                        inclusion: ["Adults", "Concurrent criterion", "RCT"],
                        exclusion: ["Case reports"],
                    },
                }),
            },
        }));
    });

    it("rejects a stale criteria removal instead of fuzzy-removing a different concurrent entry", async () => {
        const applyFunctions = new Map<ArtifactType, ApplyFunction>();
        const snapshotReaders = new Map<ArtifactType, SnapshotReader>();
        const appliedStateReaders = new Map<ArtifactType, AppliedStateReader>();
        const restoreFunctions = new Map<ArtifactType, RestoreFunction>();
        registerArtifactHandlers({ applyFunctions, snapshotReaders, appliedStateReaders, restoreFunctions });

        const upsert = vi.fn();
        const context = {
            db: {
                protocol: {
                    findUnique: vi.fn().mockResolvedValue({
                        data: {
                            eligibility: {
                                inclusion: ["Adults over 18 years with diabetes"],
                                exclusion: [],
                            },
                        },
                    }),
                    upsert,
                },
            },
            projectId: "project-1",
        } as never;
        const artifact = {
            payload: {
                inclusion: [],
                exclusion: [],
                mutation: {
                    action: "remove",
                    type: "inclusion",
                    criterion: "Adults over 18 years",
                },
            },
        } as never;

        await expect(applyFunctions.get("criteria_card")!(context, artifact)).rejects.toThrow(
            "criterion changed after this proposal was created",
        );
        expect(upsert).not.toHaveBeenCalled();
    });
});
