import { describe, expect, it } from "vitest";
import type { Study } from "@/types/ledger";
import type { ProtocolData } from "@/types/protocol";
import { isHighConfidenceExclusion } from "@/lib/criteria-matching";

function makeStudy(overrides: Partial<Study> = {}): Study {
    return {
        id: "study-1",
        title: "Example Study",
        authors: "Doe J",
        year: 2021,
        status: "pending",
        quality: "-",
        ...overrides,
    };
}

function makeProtocol(overrides: Partial<ProtocolData> = {}): ProtocolData {
    return {
        researchQuestion: "",
        pico: { population: "", intervention: "", comparison: "", outcome: "" },
        eligibility: { inclusion: [], exclusion: [] },
        searchStrategy: { query: "", databases: [] },
        methodology: {
            studyDesigns: [],
            timeFrameStart: "",
            timeFrameEnd: "",
            qualityAssessmentTool: "",
            qualityAssessmentNotes: "",
        },
        ...overrides,
    };
}

describe("isHighConfidenceExclusion", () => {
    it("does not exclude when year is unknown/missing even with protocol time window", () => {
        const study = makeStudy({ year: 0 });
        const protocol = makeProtocol({
            methodology: {
                studyDesigns: [],
                timeFrameStart: "2018",
                timeFrameEnd: "2022",
                qualityAssessmentTool: "",
                qualityAssessmentNotes: "",
            },
        });

        const result = isHighConfidenceExclusion(study, protocol);
        expect(result).toEqual({ exclude: false, reasons: [] });
    });

    it("excludes when known year is outside protocol window", () => {
        const study = makeStudy({ year: 2010 });
        const protocol = makeProtocol({
            methodology: {
                studyDesigns: [],
                timeFrameStart: "2018",
                timeFrameEnd: "2022",
                qualityAssessmentTool: "",
                qualityAssessmentNotes: "",
            },
        });

        const result = isHighConfidenceExclusion(study, protocol);
        expect(result.exclude).toBe(true);
        expect(result.reasons[0]).toContain("Published outside protocol time frame");
    });

    it("does not exclude when known year is within protocol window", () => {
        const study = makeStudy({ year: 2020 });
        const protocol = makeProtocol({
            methodology: {
                studyDesigns: [],
                timeFrameStart: "2018",
                timeFrameEnd: "2022",
                qualityAssessmentTool: "",
                qualityAssessmentNotes: "",
            },
        });

        const result = isHighConfidenceExclusion(study, protocol);
        expect(result).toEqual({ exclude: false, reasons: [] });
    });

    it("does not exclude when study type is missing even if protocol requires designs", () => {
        const study = makeStudy({ details: {} });
        const protocol = makeProtocol({
            methodology: {
                studyDesigns: ["Randomized Controlled Trials (RCTs)"],
                timeFrameStart: "",
                timeFrameEnd: "",
                qualityAssessmentTool: "",
                qualityAssessmentNotes: "",
            },
        });

        const result = isHighConfidenceExclusion(study, protocol);
        expect(result).toEqual({ exclude: false, reasons: [] });
    });

    it("excludes when known study type mismatches protocol designs", () => {
        const study = makeStudy({ details: { studyType: "Case-Report" } });
        const protocol = makeProtocol({
            methodology: {
                studyDesigns: ["Randomized Controlled Trials (RCTs)"],
                timeFrameStart: "",
                timeFrameEnd: "",
                qualityAssessmentTool: "",
                qualityAssessmentNotes: "",
            },
        });

        const result = isHighConfidenceExclusion(study, protocol);
        expect(result.exclude).toBe(true);
        expect(result.reasons[0]).toContain("Study design");
    });

    it('does not exclude when study type is "Other"', () => {
        const study = makeStudy({ details: { studyType: "Other" } });
        const protocol = makeProtocol({
            methodology: {
                studyDesigns: ["Randomized Controlled Trials (RCTs)"],
                timeFrameStart: "",
                timeFrameEnd: "",
                qualityAssessmentTool: "",
                qualityAssessmentNotes: "",
            },
        });

        const result = isHighConfidenceExclusion(study, protocol);
        expect(result).toEqual({ exclude: false, reasons: [] });
    });

    it("returns all high-confidence reasons when multiple hard mismatches are present", () => {
        const study = makeStudy({
            year: 2005,
            details: { studyType: "Case-Report" },
        });
        const protocol = makeProtocol({
            methodology: {
                studyDesigns: ["Randomized Controlled Trials (RCTs)"],
                timeFrameStart: "2018",
                timeFrameEnd: "2022",
                qualityAssessmentTool: "",
                qualityAssessmentNotes: "",
            },
        });

        const result = isHighConfidenceExclusion(study, protocol);
        expect(result.exclude).toBe(true);
        expect(result.reasons).toHaveLength(2);
    });
});
