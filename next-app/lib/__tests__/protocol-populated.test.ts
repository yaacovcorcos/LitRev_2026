import { describe, expect, it } from "vitest";
import { isProtocolPopulated, createDefaultProtocolData, type ProtocolData } from "@/types/protocol";

function withField(setter: (data: ProtocolData) => void): ProtocolData {
    const data = createDefaultProtocolData();
    setter(data);
    return data;
}

describe("isProtocolPopulated", () => {
    it("returns false for createDefaultProtocolData()", () => {
        expect(isProtocolPopulated(createDefaultProtocolData())).toBe(false);
    });

    it("returns false for whitespace-only strings", () => {
        const data = createDefaultProtocolData();
        data.researchQuestion = "   \t\n  ";
        data.pico.population = "  ";
        expect(isProtocolPopulated(data)).toBe(false);
    });

    it("returns true when researchQuestion is set", () => {
        expect(isProtocolPopulated(withField(d => { d.researchQuestion = "Does X improve Y?"; }))).toBe(true);
    });

    it("returns true when any PICO field is set", () => {
        expect(isProtocolPopulated(withField(d => { d.pico.population = "Adults"; }))).toBe(true);
        expect(isProtocolPopulated(withField(d => { d.pico.intervention = "Drug A"; }))).toBe(true);
        expect(isProtocolPopulated(withField(d => { d.pico.comparison = "Placebo"; }))).toBe(true);
        expect(isProtocolPopulated(withField(d => { d.pico.outcome = "Mortality"; }))).toBe(true);
    });

    it("returns true when inclusion criteria exist", () => {
        expect(isProtocolPopulated(withField(d => { d.eligibility.inclusion = ["RCTs"]; }))).toBe(true);
    });

    it("returns true when exclusion criteria exist", () => {
        expect(isProtocolPopulated(withField(d => { d.eligibility.exclusion = ["Case reports"]; }))).toBe(true);
    });

    it("returns true when search query is set", () => {
        expect(isProtocolPopulated(withField(d => { d.searchStrategy.query = "hypertension AND treatment"; }))).toBe(true);
    });

    it("returns true when databases are set", () => {
        expect(isProtocolPopulated(withField(d => { d.searchStrategy.databases = ["PubMed"]; }))).toBe(true);
    });

    it("returns true when studyDesigns are set", () => {
        expect(isProtocolPopulated(withField(d => { d.methodology.studyDesigns = ["RCTs"]; }))).toBe(true);
    });

    it("returns true when timeFrame is set", () => {
        expect(isProtocolPopulated(withField(d => { d.methodology.timeFrameStart = "2020"; }))).toBe(true);
        expect(isProtocolPopulated(withField(d => { d.methodology.timeFrameEnd = "2025"; }))).toBe(true);
    });

    it("returns true when qualityAssessmentTool is set", () => {
        expect(isProtocolPopulated(withField(d => { d.methodology.qualityAssessmentTool = "Cochrane RoB 2"; }))).toBe(true);
    });

    it("returns true when qualityAssessmentNotes is set", () => {
        expect(isProtocolPopulated(withField(d => { d.methodology.qualityAssessmentNotes = "Use two independent reviewers."; }))).toBe(true);
    });
});
