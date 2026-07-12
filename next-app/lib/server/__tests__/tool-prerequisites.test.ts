import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultProtocolData, type ProtocolData } from "@/types/protocol";
import { createToolPrerequisiteMiddleware, evaluateToolPrerequisites } from "@/lib/server/ai/tool-prerequisites";
import { executeWithToolMiddleware, type ToolExecutionRequest } from "@/lib/server/ai/tool-middleware";

const { protocolFindUniqueMock } = vi.hoisted(() => ({
    protocolFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        protocol: {
            findUnique: protocolFindUniqueMock,
        },
    },
}));

function protocolWithCriteria(): ProtocolData {
    return {
        ...createDefaultProtocolData(),
        eligibility: {
            inclusion: ["Adults with obesity"],
            exclusion: [],
        },
    };
}

describe("tool prerequisites", () => {
    beforeEach(() => {
        protocolFindUniqueMock.mockReset();
    });

    it("blocks protocol tools without project context", async () => {
        const evaluation = await evaluateToolPrerequisites({
            name: "update_protocol",
            args: { field: "researchQuestion", value: "Question", rationale: "Refine scope" },
            callId: "c1",
        });

        expect(evaluation.allowed).toBe(false);
        if (evaluation.allowed) throw new Error("Expected blocked evaluation");
        expect(evaluation.envelope).toMatchObject({
            kind: "missing_prerequisite",
            code: "PROTOCOL_CONTEXT_REQUIRED",
            retryable: false,
            source: "tool_prerequisite_gate",
        });
        expect(evaluation.repeatKey).toBe("update_protocol:PROTOCOL_CONTEXT_REQUIRED");
    });

    it("blocks study tools without study context", async () => {
        const evaluation = await evaluateToolPrerequisites({
            name: "exclude_study",
            args: { reason: "Wrong population" },
            callId: "c1",
            context: { projectId: "project-1" },
        });

        expect(evaluation.allowed).toBe(false);
        if (evaluation.allowed) throw new Error("Expected blocked evaluation");
        expect(evaluation.envelope.code).toBe("STUDY_CONTEXT_REQUIRED");
    });

    it("uses the same repeat key for blocked study actions even when args differ", async () => {
        const first = await evaluateToolPrerequisites({
            name: "exclude_study",
            args: { reason: "Wrong population" },
            callId: "c1",
            context: { projectId: "project-1" },
        });
        const second = await evaluateToolPrerequisites({
            name: "exclude_study",
            args: { reason: "Outcome mismatch", confidence: "high" },
            callId: "c2",
            context: { projectId: "project-1" },
        });

        expect(first.allowed).toBe(false);
        expect(second.allowed).toBe(false);
        if (first.allowed || second.allowed) throw new Error("Expected blocked evaluations");
        expect(first.repeatKey).toBe("exclude_study:STUDY_CONTEXT_REQUIRED");
        expect(second.repeatKey).toBe(first.repeatKey);
    });

    it("accepts criteria-required tools when protocol data already has criteria", async () => {
        const evaluation = await evaluateToolPrerequisites({
            name: "bulk_screening",
            args: {},
            callId: "c1",
            context: {
                projectId: "project-1",
                protocolData: protocolWithCriteria(),
            },
        });

        expect(evaluation).toEqual({ allowed: true });
        expect(protocolFindUniqueMock).not.toHaveBeenCalled();
    });

    it("blocks criteria-required tools when stored protocol has no criteria", async () => {
        protocolFindUniqueMock.mockResolvedValue({
            data: createDefaultProtocolData(),
        });

        const evaluation = await evaluateToolPrerequisites({
            name: "bulk_screening",
            args: {},
            callId: "c1",
            context: { projectId: "project-1" },
        });

        expect(protocolFindUniqueMock).toHaveBeenCalledWith({
            where: { projectId: "project-1" },
            select: { data: true },
        });
        expect(evaluation.allowed).toBe(false);
        if (evaluation.allowed) throw new Error("Expected blocked evaluation");
        expect(evaluation.envelope.code).toBe("SCREENING_CRITERIA_REQUIRED");
    });

    it("short-circuits execution through middleware with a structured blocked result", async () => {
        const controller = new AbortController();
        const executor = vi.fn(async (request: ToolExecutionRequest) => ({
            callId: request.callId,
            result: "should-not-run",
        }));

        const result = await executeWithToolMiddleware(
            {
                name: "extract_pdf",
                args: { deep: true },
                callId: "c1",
                context: { projectId: "project-1", signal: controller.signal },
            },
            [createToolPrerequisiteMiddleware()],
            executor,
        );

        expect(executor).not.toHaveBeenCalled();
        expect(controller.signal.aborted).toBe(false);
        expect(result).toMatchObject({
            callId: "c1",
            result: null,
            error: "This action needs a study target before it can run.",
            errorMeta: {
                kind: "missing_prerequisite",
                code: "STUDY_CONTEXT_REQUIRED",
                retryable: false,
                source: "tool_prerequisite_gate",
            },
        });
    });
});
