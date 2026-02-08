import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    onStudyAccepted,
    onStudyExcluded,
    onDraftAccepted,
    onArtifactEdited,
} from "../memory/decision-extractor";
import type { StudyProposalPayload, DraftDiffPayload } from "@/types/artifacts";

vi.mock("@/lib/server/memory/project-memory", () => ({
    createProjectMemory: vi.fn().mockResolvedValue({ id: "pm-new" }),
}));

vi.mock("@/lib/server/memory/study-memory", () => ({
    batchCreateStudyMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
    createArtifact: vi.fn().mockResolvedValue({ id: "art-new" }),
}));

const { createProjectMemory } = await import("@/lib/server/memory/project-memory");
const { batchCreateStudyMemories } = await import("@/lib/server/memory/study-memory");
const { createArtifact } = await import("@/lib/server/agent/artifacts");

const mockCreatePM = vi.mocked(createProjectMemory);
const mockBatchCreate = vi.mocked(batchCreateStudyMemories);
const mockCreateArtifact = vi.mocked(createArtifact);

beforeEach(() => {
    vi.clearAllMocks();
});

const studyPayload: StudyProposalPayload = {
    title: "Effect of ACE inhibitors",
    authors: "Smith et al.",
    year: 2023,
    source: "pubmed",
    recommendation: "keep",
    confidence: 0.85,
    abstract: "A randomized controlled trial...",
    studyType: "RCT",
    sampleSize: 200,
    keyDetail: "Significant reduction in BP",
};

describe("onStudyAccepted", () => {
    it("creates summary + methods StudyMemory entries", async () => {
        await onStudyAccepted("proj-1", "study-1", studyPayload);

        expect(mockBatchCreate).toHaveBeenCalledTimes(1);
        const memories = mockBatchCreate.mock.calls[0][0];
        expect(memories).toHaveLength(2);

        expect(memories[0]).toMatchObject({
            studyId: "study-1",
            projectId: "proj-1",
            type: "summary",
            source: "ai_generated",
            confidence: 0.85,
        });
        expect(memories[1]).toMatchObject({
            type: "methods",
            content: "Study design: RCT, n=200",
        });
    });

    it("skips when no abstract and no keyDetail", async () => {
        await onStudyAccepted("proj-1", "study-1", {
            ...studyPayload,
            abstract: undefined,
            keyDetail: undefined,
            studyType: undefined,
        });

        expect(mockBatchCreate).not.toHaveBeenCalled();
    });

    it("uses keyDetail over abstract when both present", async () => {
        await onStudyAccepted("proj-1", "study-1", studyPayload);

        const memories = mockBatchCreate.mock.calls[0][0];
        expect(memories[0].content).toBe("Significant reduction in BP");
    });
});

describe("onStudyExcluded", () => {
    it("creates exclusion ProjectMemory with rationale", async () => {
        await onStudyExcluded("proj-1", studyPayload, "Wrong population");

        expect(mockCreatePM).toHaveBeenCalledWith(expect.objectContaining({
            projectId: "proj-1",
            type: "decision",
            category: "exclusion",
            statement: 'Excluded "Effect of ACE inhibitors" (Smith et al., 2023)',
            rationale: "Wrong population",
            tags: ["artifact-decision", "study-excluded"],
        }));
    });

    it("uses 'No rationale provided' when reviewNote is empty", async () => {
        await onStudyExcluded("proj-1", { ...studyPayload, matchRationale: undefined });

        expect(mockCreatePM).toHaveBeenCalledWith(
            expect.objectContaining({ rationale: "No rationale provided" }),
        );
    });
});

describe("onDraftAccepted", () => {
    it("creates decision with section name and word count", async () => {
        const draftPayload: DraftDiffPayload = {
            section: "Methods",
            subsection: "Search Strategy",
            content: "...",
            citations: [{ studyId: "s1", label: "Smith 2023" }],
            wordCount: 450,
        };

        await onDraftAccepted("proj-1", draftPayload);

        expect(mockCreatePM).toHaveBeenCalledWith(expect.objectContaining({
            type: "decision",
            statement: 'Accepted draft for section "Methods" / Search Strategy (450 words, 1 citations)',
            tags: ["artifact-decision", "draft-accepted"],
        }));
    });
});

describe("onArtifactEdited", () => {
    it("creates memory_proposal when payloads differ", async () => {
        await onArtifactEdited("run-1", "proj-1", "conv-1", "user-1", { a: 1 }, { a: 2 }, "draft_diff");

        expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
            type: "memory_proposal",
            title: "Learned preference: editing pattern detected",
            payload: expect.objectContaining({
                memoryType: "user",
                key: "preference:draft_diff_editing",
            }),
        }));
    });

    it("does nothing when payloads are identical", async () => {
        await onArtifactEdited("run-1", "proj-1", "conv-1", "user-1", { a: 1 }, { a: 1 }, "draft_diff");

        expect(mockCreateArtifact).not.toHaveBeenCalled();
    });
});
