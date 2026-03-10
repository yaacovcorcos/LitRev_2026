import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    updateMany: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        artifact: {
            updateMany: mocks.updateMany,
            update: mocks.update,
            findUniqueOrThrow: mocks.findUniqueOrThrow,
        },
    },
}));

import { buildExecutablePlanPayload } from "@/lib/server/agent/plan-payloads";
import { completePlanExecution, failPlanExecution, startPlanExecution } from "@/lib/server/agent/plan-execution";
import type { PlanPayload, PlanStep } from "@/types/artifacts";

describe("plan execution lifecycle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects advisory plans when execution starts", async () => {
        const advisoryPlan: PlanPayload = {
            steps: [{ label: "Search", toolName: "search_pubmed", status: "pending" }],
            estimatedActions: 1,
        };

        mocks.findUniqueOrThrow.mockResolvedValue({
            id: "plan-1",
            type: "plan",
            status: "proposed",
            projectId: "project-1",
            payload: advisoryPlan,
            conversationId: "conv-1",
        });

        await expect(startPlanExecution("plan-1", [0], "project-1")).rejects.toThrow(
            "Plan is advisory-only and cannot be executed",
        );
        expect(mocks.updateMany).not.toHaveBeenCalled();
    });

    it("treats expectedProjectId as a consistency check instead of primary authority", async () => {
        const executablePlan = buildExecutablePlanPayload({
            steps: [{ label: "Search", toolName: "search_pubmed", status: "pending" }],
            estimatedActions: 1,
        }, {
            originAgentMode: "search",
            conversationId: "conv-1",
            projectId: "project-1",
        });

        mocks.findUniqueOrThrow.mockResolvedValue({
            id: "plan-1",
            type: "plan",
            status: "proposed",
            projectId: "project-1",
            payload: executablePlan,
            conversationId: "conv-1",
        });

        await expect(startPlanExecution("plan-1", [0], "project-2")).rejects.toThrow(
            "Plan does not belong to the expected project",
        );
        expect(mocks.updateMany).not.toHaveBeenCalled();
    });

    it("preserves execution metadata when completing a plan", async () => {
        const executablePlan = buildExecutablePlanPayload({
            steps: [{ label: "Search", toolName: "search_pubmed", status: "running" }],
            estimatedActions: 1,
        }, {
            originAgentMode: "search",
            conversationId: "conv-1",
            projectId: "project-1",
        });
        const finalSteps: PlanStep[] = [{ label: "Search", toolName: "search_pubmed", status: "completed" }];

        mocks.findUniqueOrThrow.mockResolvedValue({
            id: "plan-1",
            type: "plan",
            status: "running",
            projectId: "project-1",
            payload: executablePlan,
        });
        mocks.update.mockResolvedValue({});

        await completePlanExecution("plan-1", finalSteps);

        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: "plan-1" },
            data: {
                status: "accepted",
                payload: {
                    ...executablePlan,
                    steps: finalSteps,
                },
                reviewedAt: expect.any(Date),
                appliedAt: expect.any(Date),
            },
        });
    });

    it("preserves execution metadata when failing a plan", async () => {
        const executablePlan = buildExecutablePlanPayload({
            steps: [{ label: "Search", toolName: "search_pubmed", status: "running" }],
            estimatedActions: 1,
        }, {
            originAgentMode: "search",
            conversationId: "conv-1",
            projectId: "project-1",
        });
        const finalSteps: PlanStep[] = [{ label: "Search", toolName: "search_pubmed", status: "failed" }];

        mocks.findUniqueOrThrow.mockResolvedValue({
            id: "plan-1",
            type: "plan",
            status: "running",
            projectId: "project-1",
            payload: executablePlan,
        });
        mocks.update.mockResolvedValue({});

        await failPlanExecution("plan-1", finalSteps, "boom");

        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: "plan-1" },
            data: {
                status: "proposed",
                payload: {
                    ...executablePlan,
                    steps: finalSteps,
                },
                reviewNote: "Execution failed: boom",
            },
        });
    });
});
