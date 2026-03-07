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
});
