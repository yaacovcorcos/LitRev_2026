import { describe, it, expect } from "vitest";
import { createDefaultProtocolData } from "@/types/protocol";
import { buildProtocolMarkdown, getProtocolSuggestions } from "../protocolExport";

describe("buildProtocolMarkdown", () => {
    const project = { id: "p1", name: "Test Review" };
    const emptyCompleteness = { percentage: 0, incomplete: [{ name: "Research question" }] };

    it("renders heading with project name", () => {
        const md = buildProtocolMarkdown(project, createDefaultProtocolData(), emptyCompleteness);
        expect(md).toContain("# Study Protocol: Test Review");
    });

    it("renders _Not defined_ for empty fields", () => {
        const md = buildProtocolMarkdown(project, createDefaultProtocolData(), emptyCompleteness);
        expect(md).toContain("**Population:** _Not defined_");
        expect(md).toContain("_No inclusion criteria defined_");
        expect(md).toContain("_No databases specified_");
        expect(md).toContain("_No study designs specified_");
    });

    it("renders populated PICO fields", () => {
        const proto = createDefaultProtocolData();
        proto.pico.population = "Adults aged 18+";
        proto.pico.intervention = "Drug A";
        const md = buildProtocolMarkdown(project, proto, emptyCompleteness);
        expect(md).toContain("**Population:** Adults aged 18+");
        expect(md).toContain("**Intervention:** Drug A");
    });

    it("renders inclusion and exclusion criteria as bullet lists", () => {
        const proto = createDefaultProtocolData();
        proto.eligibility.inclusion = ["RCTs only", "English language"];
        proto.eligibility.exclusion = ["Case reports"];
        const md = buildProtocolMarkdown(project, proto, emptyCompleteness);
        expect(md).toContain("- RCTs only");
        expect(md).toContain("- English language");
        expect(md).toContain("- Case reports");
    });

    it("renders completeness percentage and missing sections", () => {
        const comp = { percentage: 75, incomplete: [{ name: "Search query" }, { name: "Databases" }] };
        const md = buildProtocolMarkdown(project, createDefaultProtocolData(), comp);
        expect(md).toContain("**Protocol Completeness:** 75%");
        expect(md).toContain("- Search query");
        expect(md).toContain("- Databases");
    });

    it("renders time frame when provided", () => {
        const proto = createDefaultProtocolData();
        proto.methodology.timeFrameStart = "2018";
        proto.methodology.timeFrameEnd = "2024";
        const md = buildProtocolMarkdown(project, proto, { percentage: 100, incomplete: [] });
        expect(md).toContain("2018 – 2024");
    });
});

describe("getProtocolSuggestions", () => {
    it("returns research question suggestions", () => {
        const suggestions = getProtocolSuggestions("research-question");
        expect(suggestions).toHaveLength(3);
        expect(suggestions[0].label).toBe("Refine question");
    });

    it("returns PICO suggestions with field name", () => {
        const suggestions = getProtocolSuggestions("pico-population");
        expect(suggestions).toHaveLength(3);
        expect(suggestions[0].label).toBe("Refine population");
    });

    it("returns eligibility suggestions for inclusion", () => {
        const suggestions = getProtocolSuggestions("eligibility-inclusion");
        expect(suggestions[0].label).toBe("Review inclusion");
    });

    it("returns eligibility suggestions for exclusion", () => {
        const suggestions = getProtocolSuggestions("eligibility-exclusion");
        expect(suggestions[0].label).toBe("Review exclusion");
    });

    it("returns search query suggestions", () => {
        const suggestions = getProtocolSuggestions("search-query");
        expect(suggestions).toHaveLength(3);
        expect(suggestions[0].label).toBe("Optimize query");
    });

    it("returns database suggestions", () => {
        const suggestions = getProtocolSuggestions("search-databases");
        expect(suggestions).toHaveLength(2);
    });

    it("returns default suggestions for null section", () => {
        const suggestions = getProtocolSuggestions(null);
        expect(suggestions).toHaveLength(3);
        expect(suggestions[0].label).toBe("PICO Help");
    });
});
