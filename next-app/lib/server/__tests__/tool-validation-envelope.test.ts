import { describe, expect, it } from "vitest";
import { executeTool } from "@/lib/server/ai/tools/base";

describe("tool schema validation envelope", () => {
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
