import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { routeToAgent, AGENT_MODE_CONFIG, detectScopingEntryIntent } from "../router";

describe("routeToAgent", () => {
    const originalScopingFlag = process.env.NEXT_PUBLIC_ENABLE_SCOPING_MODE;
    beforeEach(() => {
        if (originalScopingFlag === undefined) {
            delete process.env.NEXT_PUBLIC_ENABLE_SCOPING_MODE;
        } else {
            process.env.NEXT_PUBLIC_ENABLE_SCOPING_MODE = originalScopingFlag;
        }
    });
    afterEach(() => {
        if (originalScopingFlag === undefined) {
            delete process.env.NEXT_PUBLIC_ENABLE_SCOPING_MODE;
        } else {
            process.env.NEXT_PUBLIC_ENABLE_SCOPING_MODE = originalScopingFlag;
        }
    });

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

    // Scoping keywords
    it("routes to scoping for explicit exploratory language", () => {
        expect(routeToAgent("What's out there on mindfulness and pain?", "overview")).toBe("scoping");
        expect(routeToAgent("Help me scope the literature landscape", "overview")).toBe("scoping");
        expect(routeToAgent("Is there enough evidence to do a review on this?", "overview")).toBe("scoping");
    });

    it("routes search intent to scoping when protocol is missing", () => {
        expect(routeToAgent("Search PubMed for cardiac MRI studies", "overview", { hasProtocol: false })).toBe("scoping");
        expect(routeToAgent("Find studies about diabetes", "overview", { hasProtocol: false })).toBe("scoping");
    });

    it("routes no-protocol deliverable requests into scoping for draft bootstrap", () => {
        expect(routeToAgent("Help me write a literature review on omega-3 supplementation", "overview", { hasProtocol: false })).toBe("scoping");
    });

    it("falls back to search when scoping mode feature flag is disabled", () => {
        process.env.NEXT_PUBLIC_ENABLE_SCOPING_MODE = "0";
        expect(routeToAgent("What's out there on mindfulness and pain?", "overview")).toBe("search");
        expect(routeToAgent("Search PubMed for cardiac MRI studies", "overview", { hasProtocol: false })).toBe("search");
    });

    it("keeps explicit search intent in search mode when protocol exists", () => {
        expect(routeToAgent("Search PubMed for cardiac MRI studies", "overview", { hasProtocol: true })).toBe("search");
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

    it("routes explicit delete-study intents to screening", () => {
        expect(routeToAgent("Delete this study from the ledger", "overview")).toBe("screening");
        expect(routeToAgent("Please remove study 123 from ledger", "overview")).toBe("screening");
    });

    it("routes explicit study-page edit intents to screening on the study page", () => {
        expect(routeToAgent("Edit this page and add a study summary", "study")).toBe("screening");
        expect(routeToAgent("Insert the abstract from the PDF into this study", "study")).toBe("screening");
        expect(routeToAgent("Fix the DOI and PMID for this study", "study")).toBe("screening");
    });

    it("keeps generic study-page questions out of study-edit routing", () => {
        expect(routeToAgent("What does this study say?", "study")).toBe("general");
        expect(routeToAgent("Compare this study to the others", "study")).toBe("general");
        expect(routeToAgent("Summarize this paper for me", "study")).toBe("general");
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
    it("has config for all 7 modes", () => {
        const modes = ["protocol", "scoping", "search", "screening", "drafting", "qa", "general"];
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

describe("detectScopingEntryIntent", () => {
    it("returns draft_bootstrap for no-protocol deliverable framing", () => {
        expect(
            detectScopingEntryIntent("Help me write a literature review on omega-3 supplementation", {
                hasProtocol: false,
            })
        ).toBe("draft_bootstrap");
    });

    it("returns explore for generic literature discovery", () => {
        expect(
            detectScopingEntryIntent("What's out there in the literature on omega-3 and cognition?", {
                hasProtocol: false,
            })
        ).toBe("explore");
    });

    it("returns explore when protocol already exists", () => {
        expect(
            detectScopingEntryIntent("Help me write a literature review on omega-3 supplementation", {
                hasProtocol: true,
            })
        ).toBe("explore");
    });
});
