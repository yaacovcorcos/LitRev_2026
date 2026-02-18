import { describe, expect, it } from "vitest";
import {
    buildFallbackConversationTitle,
    sanitizeGeneratedConversationTitle,
} from "@/lib/server/ai/title-generator";

describe("title-generator helpers", () => {
    it("builds a deterministic fallback title", () => {
        const title = buildFallbackConversationTitle("  Compare RCT and cohort evidence for statins in elderly adults  ");
        expect(title).toBe("Compare RCT and cohort evidence for statins in");
    });

    it("sanitizes model output with prefix, quotes, and extra lines", () => {
        const title = sanitizeGeneratedConversationTitle(
            "Title: \"PRISMA Screening Strategy for Stroke Trials\"\nExtra text",
            "fallback seed"
        );
        expect(title).toBe("PRISMA Screening Strategy for Stroke Trials");
    });

    it("falls back when generated output is empty", () => {
        const title = sanitizeGeneratedConversationTitle("", "How should we refine inclusion criteria?");
        expect(title).toBe("How should we refine inclusion criteria?");
    });
});
