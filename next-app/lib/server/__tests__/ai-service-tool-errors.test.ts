import { describe, expect, it } from "vitest";

import { AIService } from "@/lib/server/ai/ai-service";

describe("AIService tool error boundary", () => {
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
});
