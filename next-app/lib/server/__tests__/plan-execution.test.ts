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
import {
    assertNextPlanToolCall,
    completePlanExecution,
    failPlanExecution,
    preparePlanExecution,
    resolvePlanExecutionToolNames,
    startPlanExecution,
    type PlanExecutionStepState,
} from "@/lib/server/agent/plan-execution";
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
            "This plan is advisory-only and cannot be executed. Generate a fresh executable plan instead.",
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
            allowedToolNames: ["search_pubmed", "ask_user"],
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
            "Plan does not belong to the current project context.",
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
            allowedToolNames: ["search_pubmed", "ask_user"],
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
            allowedToolNames: ["search_pubmed", "ask_user"],
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

    it("binds execution to metadata conversation context when client conversation drifts", async () => {
        const executablePlan = buildExecutablePlanPayload({
            steps: [{ label: "Search", toolName: "search_pubmed", status: "pending" }],
            estimatedActions: 1,
        }, {
            originAgentMode: "search",
            conversationId: "conv-from-metadata",
            projectId: "project-1",
            allowedToolNames: ["search_pubmed", "ask_user"],
        });

        mocks.findUniqueOrThrow.mockResolvedValue({
            id: "plan-1",
            type: "plan",
            status: "proposed",
            projectId: "project-1",
            payload: executablePlan,
            conversationId: "conv-from-artifact-row",
        });

        const prepared = await preparePlanExecution("plan-1", [0], "project-1");

        expect(prepared.conversationId).toBe("conv-from-metadata");
        expect(prepared.originAgentMode).toBe("search");
    });

    it("intersects selected-step tools with stored and current allowed tools", () => {
        const result = resolvePlanExecutionToolNames({
            selectedSteps: [
                { originalIndex: 0, label: "Search", toolName: "search_pubmed" },
                { originalIndex: 1, label: "Screen", toolName: "bulk_screening" },
            ],
            storedAllowedToolNames: ["search_pubmed", "bulk_screening", "ask_user"],
            currentAllowedToolNames: ["search_pubmed", "ask_user"],
        });

        expect(result.allowedToolNames).toEqual(["search_pubmed"]);
        expect(result.unavailableToolNames).toEqual(["bulk_screening"]);
    });

    it("rejects out-of-order tool calls during plan execution", () => {
        const stepQueue: PlanExecutionStepState[] = [
            {
                originalIndex: 0,
                label: "Search first",
                toolName: "search_pubmed",
                consumed: false,
                finalStatus: "pending",
            },
            {
                originalIndex: 1,
                label: "Screen second",
                toolName: "bulk_screening",
                consumed: false,
                finalStatus: "pending",
            },
        ];

        expect(() => assertNextPlanToolCall(stepQueue, "bulk_screening")).toThrow(
            "Plan execution must run step 1 (Search first) before \"bulk_screening\".",
        );
    });

    it("allows repeated same-tool steps only in the original selected order", () => {
        const stepQueue: PlanExecutionStepState[] = [
            {
                originalIndex: 0,
                label: "Search pass one",
                toolName: "search_pubmed",
                consumed: false,
                finalStatus: "pending",
            },
            {
                originalIndex: 2,
                label: "Search pass two",
                toolName: "search_pubmed",
                consumed: false,
                finalStatus: "pending",
            },
        ];

        const first = assertNextPlanToolCall(stepQueue, "search_pubmed");
        first.consumed = true;

        const second = assertNextPlanToolCall(stepQueue, "search_pubmed");

        expect(first.originalIndex).toBe(0);
        expect(second.originalIndex).toBe(2);
    });
});
