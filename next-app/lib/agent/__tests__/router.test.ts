import { describe, it, expect } from "vitest";
import { routeToAgent, AGENT_MODE_CONFIG, type RouterPage } from "../router";

describe("routeToAgent", () => {
    // Page-driven routing
    it("routes to protocol when on protocol page regardless of message", () => {
        expect(routeToAgent("hello world", "protocol")).toBe("protocol");
        expect(routeToAgent("search pubmed for RCTs", "protocol")).toBe("protocol");
        expect(routeToAgent("", "protocol")).toBe("protocol");
    });

    // Protocol keywords
    it("routes to protocol for PICO keywords", () => {
        expect(routeToAgent("Help me define my PICO criteria", "overview")).toBe("protocol");
    });

    it("routes to protocol for criteria keywords", () => {
        expect(routeToAgent("What inclusion criteria should I use?", "overview")).toBe("protocol");
        expect(routeToAgent("Define exclusion rules", "ledger")).toBe("protocol");
        expect(routeToAgent("Check eligibility requirements", "overview")).toBe("protocol");
    });

    // Search keywords
    it("routes to search for search keywords", () => {
        expect(routeToAgent("Search PubMed for RCTs on statins", "overview")).toBe("search");
        expect(routeToAgent("Find studies about diabetes", "overview")).toBe("search");
        expect(routeToAgent("Look for literature on hypertension", "ledger")).toBe("search");
    });

    // Screening keywords
    it("routes to screening for screening keywords", () => {
        expect(routeToAgent("Screen these studies against my protocol", "overview")).toBe("screening");
        expect(routeToAgent("Triage the remaining papers", "ledger")).toBe("screening");
        expect(routeToAgent("Evaluate this study for quality", "overview")).toBe("screening");
    });

    // Drafting keywords
    it("routes to drafting for writing keywords", () => {
        expect(routeToAgent("Write the methods section", "overview")).toBe("drafting");
        expect(routeToAgent("Help me draft an introduction", "overview")).toBe("drafting");
        expect(routeToAgent("Compose the discussion", "draft")).toBe("drafting");
        expect(routeToAgent("What should the results section contain?", "overview")).toBe("drafting");
    });

    // QA keywords
    it("routes to qa for checking keywords", () => {
        expect(routeToAgent("Check my citations", "overview")).toBe("qa");
        expect(routeToAgent("Verify the references", "draft")).toBe("qa");
        expect(routeToAgent("Are there unsupported claims?", "draft")).toBe("qa");
        expect(routeToAgent("Find any conflicting findings", "overview")).toBe("qa");
    });

    // General fallback
    it("returns general for unmatched messages", () => {
        expect(routeToAgent("hello", "overview")).toBe("general");
        expect(routeToAgent("what is this project about?", "overview")).toBe("general");
        expect(routeToAgent("thanks for the help", "ledger")).toBe("general");
    });

    it("returns general for empty messages on non-protocol pages", () => {
        expect(routeToAgent("", "overview")).toBe("general");
        expect(routeToAgent("   ", "ledger")).toBe("general");
    });

    // Priority conflicts
    it("prioritizes protocol over search for mixed keywords", () => {
        // "inclusion" matches protocol before "search" can match
        expect(routeToAgent("search for inclusion criteria studies", "overview")).toBe("protocol");
    });

    it("prioritizes search over screening when both match", () => {
        // "search" is checked before "screen"
        expect(routeToAgent("search and screen studies", "overview")).toBe("search");
    });

    // Case insensitivity
    it("is case insensitive", () => {
        expect(routeToAgent("SEARCH PUBMED", "overview")).toBe("search");
        expect(routeToAgent("Define PICO", "overview")).toBe("protocol");
        expect(routeToAgent("Write METHODS", "overview")).toBe("drafting");
    });
});

describe("AGENT_MODE_CONFIG", () => {
    it("has config for all 6 modes", () => {
        const modes = ["protocol", "search", "screening", "drafting", "qa", "general"];
        for (const mode of modes) {
            expect(AGENT_MODE_CONFIG[mode as keyof typeof AGENT_MODE_CONFIG]).toBeDefined();
        }
    });

    it("each config has required fields", () => {
        for (const config of Object.values(AGENT_MODE_CONFIG)) {
            expect(config.systemPromptKey).toBeDefined();
            expect(Array.isArray(config.allowedTools)).toBe(true);
            expect(config.memoryScope).toBeDefined();
            expect(config.description).toBeDefined();
        }
    });
});
