import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    executeToolReliably: vi.fn(),
}));

vi.mock("@/lib/server/ai/tool-executor", () => ({
    executeToolReliably: mocks.executeToolReliably,
}));

import { AIService } from "@/lib/server/ai/ai-service";

describe("AIService tool error boundary", () => {
    beforeEach(() => {
        mocks.executeToolReliably.mockReset();
        mocks.executeToolReliably.mockImplementation(async (_request, executor) => executor(_request));
    });

    it("classifies untyped middleware failures before returning them to the agent loop", async () => {
        const service = new AIService({
            toolMiddlewares: [{
                name: "upstream-guard",
                before: (request) => ({
                    ...request,
                    shortCircuitResult: {
                        callId: request.callId,
                        result: null,
                        error: "Search upstream rate limit exceeded.",
                    },
                }),
            }],
        });

        const result = await service.executeToolWithMiddleware({
            name: "search_pubmed",
            args: { query: "statins" },
            callId: "call-rate-limit",
        });

        expect(result.errorMeta).toMatchObject({
            kind: "tool_execution",
            code: "TOOL_UPSTREAM_RATE_LIMITED",
            retryable: true,
            source: "tool_upstream",
        });
    });

    it("routes actual tool execution through the reliable executor", async () => {
        const service = new AIService();

        const result = await service.executeToolWithMiddleware({
            name: "missing_tool",
            args: {},
            callId: "call-missing",
        });

        expect(mocks.executeToolReliably).toHaveBeenCalledTimes(1);
        expect(result.errorMeta).toMatchObject({
            code: "TOOL_NOT_FOUND",
            retryable: false,
        });
    });
});
