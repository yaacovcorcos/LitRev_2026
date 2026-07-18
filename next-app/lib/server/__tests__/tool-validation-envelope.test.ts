import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    searchPubMed: vi.fn(),
}));

vi.mock("@/lib/server/search/pubmed", () => ({
    searchPubMed: mocks.searchPubMed,
}));

import { executeTool } from "@/lib/server/ai/tools/base";

describe("tool schema validation envelope", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.searchPubMed.mockResolvedValue({
            query: "statins",
            source: "pubmed",
            totalResults: 0,
            returnedCount: 0,
            results: [],
        });
    });

    it("returns classified error metadata for invalid tool input", async () => {
        const result = await executeTool("search_pubmed", {}, "call-1");

        expect(result.error).toContain("Input validation failed");
        expect(result.errorMeta).toMatchObject({
            kind: "tool_schema_validation",
            code: "TOOL_INPUT_VALIDATION_FAILED",
            retryable: false,
            source: "tool_validator",
        });
    });

    it("rejects blank continuation cursors at the tool boundary", async () => {
        const result = await executeTool("search_pubmed", {
            query: "statins",
            cursor: "   ",
        }, "call-blank-cursor");

        expect(result.error).toContain("Input validation failed");
        expect(result.errorMeta).toMatchObject({
            kind: "tool_schema_validation",
            code: "TOOL_INPUT_VALIDATION_FAILED",
            retryable: false,
            source: "tool_validator",
        });
    });

    it("executes with Zod-normalized defaults and transforms", async () => {
        const result = await executeTool("search_pubmed", {
            query: "statins",
            cursor: "  20  ",
        }, "call-normalized");

        expect(result.error).toBeUndefined();
        expect(mocks.searchPubMed).toHaveBeenCalledWith("statins", {
            maxResults: 10,
            cursor: "20",
            signal: undefined,
        });
    });

    it("does not start tool work for a pre-cancelled execution", async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(executeTool("search_pubmed", {
            query: "statins",
        }, "call-pre-cancelled", {
            signal: controller.signal,
        })).rejects.toMatchObject({ name: "AbortError" });

        expect(mocks.searchPubMed).not.toHaveBeenCalled();
    });

    it("does not accept a read-only tool result that resolves after cancellation", async () => {
        const controller = new AbortController();
        mocks.searchPubMed.mockImplementationOnce(async () => {
            controller.abort();
            return {
                query: "statins",
                source: "pubmed",
                totalResults: 0,
                returnedCount: 0,
                results: [],
            };
        });

        await expect(executeTool("search_pubmed", {
            query: "statins",
        }, "call-late-read", {
            signal: controller.signal,
        })).rejects.toMatchObject({ name: "AbortError" });
    });

    it("fails closed when a tool returns data outside its output schema", async () => {
        mocks.searchPubMed.mockResolvedValueOnce({ unexpected: true });

        const result = await executeTool("search_pubmed", {
            query: "statins",
        }, "call-invalid-output");

        expect(result.result).toBeNull();
        expect(result.error).toContain("Output validation failed");
        expect(result.errorMeta).toMatchObject({
            kind: "tool_schema_validation",
            code: "TOOL_OUTPUT_VALIDATION_FAILED",
            retryable: false,
            source: "tool_validator",
        });
    });

    it("returns the Zod-sanitized output instead of leaking stripped fields", async () => {
        mocks.searchPubMed.mockResolvedValueOnce({
            query: "statins",
            source: "pubmed",
            totalResults: 0,
            returnedCount: 0,
            results: [],
            untrustedExtra: "must not reach the model",
        });

        const result = await executeTool("search_pubmed", {
            query: "statins",
        }, "call-sanitized-output");

        expect(result.error).toBeUndefined();
        expect(result.result).not.toHaveProperty("untrustedExtra");
    });

    it("returns typed retry metadata when a tool reports an upstream failure", async () => {
        mocks.searchPubMed.mockRejectedValueOnce(new Error("PubMed gateway timeout"));

        const result = await executeTool("search_pubmed", {
            query: "statins",
        }, "call-upstream-timeout");

        expect(result.error).toBe("PubMed gateway timeout");
        expect(result.errorMeta).toMatchObject({
            kind: "tool_execution",
            code: "TOOL_UPSTREAM_TIMEOUT",
            retryable: true,
            source: "tool_upstream",
        });
    });

    it("returns a deterministic typed failure for unknown tools", async () => {
        const result = await executeTool("missing_tool", {}, "call-missing");

        expect(result.errorMeta).toMatchObject({
            kind: "tool_execution",
            code: "TOOL_NOT_FOUND",
            retryable: false,
            source: "tool_executor",
        });
    });

    it("returns classified mutation error metadata for invalid update_protocol values", async () => {
        const result = await executeTool("update_protocol", {
            field: "methodology.qualityAssessmentTool",
            value: { label: "GRADE" },
            rationale: "Use GRADE",
        }, "call-2", {
            projectId: "project-1",
        });

        expect(result.error).toBe("Quality Assessment Tool expects a string, got an unsupported object shape");
        expect(result.errorMeta).toMatchObject({
            kind: "tool_schema_validation",
            code: "PROTOCOL_MUTATION_VALIDATION_FAILED",
            retryable: false,
            source: "tool_validator",
        });
    });
});
