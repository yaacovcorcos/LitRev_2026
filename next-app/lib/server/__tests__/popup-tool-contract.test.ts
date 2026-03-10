import { describe, expect, it, vi } from "vitest";
import { createPopupToolGuard, getAllowedPopupToolNames } from "@/lib/server/ai/popup-tool-contract";
import { executeWithToolMiddleware, type ToolExecutionRequest } from "@/lib/server/ai/tool-middleware";

describe("popup tool contract", () => {
    it("exposes only read-only popup tools", () => {
        expect(getAllowedPopupToolNames()).toEqual(["read_protocol", "read_ledger", "inspect_memory"]);
        expect(getAllowedPopupToolNames()).not.toContain("update_protocol");
    });

    it("blocks protocol mutation tools before execution", async () => {
        const executor = vi.fn(async (request: ToolExecutionRequest) => ({
            callId: request.callId,
            result: "should-not-run",
        }));

        const result = await executeWithToolMiddleware(
            {
                name: "update_protocol",
                args: { field: "researchQuestion", value: "Question" },
                callId: "popup-call-1",
                context: { projectId: "project-1" },
            },
            [createPopupToolGuard({
                popupContext: {
                    type: "protocol_section",
                    projectId: "project-1",
                    section: "Research question",
                    sectionKey: "research-question",
                    currentContent: "Current text",
                },
                projectId: "project-1",
            })],
            executor,
        );

        expect(executor).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            callId: "popup-call-1",
            result: null,
            error: 'Tool "update_protocol" is not allowed in popup mode.',
        });
    });

    it("still forwards read-only tools with the popup project context", async () => {
        const executor = vi.fn(async (request: ToolExecutionRequest) => ({
            callId: request.callId,
            result: request.context?.projectId ?? null,
        }));

        const result = await executeWithToolMiddleware(
            {
                name: "read_protocol",
                args: {},
                callId: "popup-call-2",
            },
            [createPopupToolGuard({
                popupContext: {
                    type: "protocol_section",
                    projectId: "project-1",
                    section: "Eligibility",
                    sectionKey: "eligibility-criteria",
                    currentContent: "Adults only",
                },
                projectId: "project-1",
            })],
            executor,
        );

        expect(executor).toHaveBeenCalledOnce();
        expect(result).toMatchObject({
            callId: "popup-call-2",
            result: "project-1",
        });
    });
});
