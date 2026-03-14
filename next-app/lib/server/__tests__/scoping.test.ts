import { describe, expect, it } from "vitest";
import {
    appendScopingReportComment,
    buildFallbackScopingReport,
    detectScopingHandoffSelection,
    extractLatestScopingReport,
    extractScopingReportFromText,
    stripScopingReportMarkup,
} from "../ai/scoping";
import { ScopingReportSchema } from "@/types/artifacts";

const SAMPLE_REPORT = {
    topic: "Mindfulness for chronic pain in older adults",
    searchesRun: [
        { database: "pubmed", query: "mindfulness chronic pain elderly", resultCount: 45, angle: "broad" },
    ],
    landscape: {
        majorThemes: ["MBSR", "quality of life"],
        evidenceGaps: ["adults over 75"],
        methodologicalPatterns: ["RCT-heavy"],
        evidenceDensity: "moderate" as const,
        timeframe: { earliest: 2008, latest: 2025 },
    },
    recommendedQuestions: [
        {
            question: "Does MBSR improve pain outcomes in older adults with chronic musculoskeletal pain?",
            rationale: "Strong evidence density and clear outcomes.",
            feasibility: "high" as const,
            novelty: "medium" as const,
        },
        {
            question: "What mechanisms explain mindfulness effects on pain perception in older adults?",
            rationale: "Higher novelty with moderate evidence.",
            feasibility: "medium" as const,
            novelty: "high" as const,
        },
    ],
    nextStep: "Choose a question and move to protocol definition.",
    workflow: {
        entryIntent: "explore" as const,
        phase: "handoff" as const,
        handoffOffered: false,
        recommendedDefaultQuestionIndex: 1,
    },
};

describe("scoping helpers", () => {
    it("extracts and validates report from <scoping_report> block", () => {
        const text = `Summary...\n<scoping_report>${JSON.stringify(SAMPLE_REPORT)}</scoping_report>`;
        const parsed = extractScopingReportFromText(text);
        expect(parsed).not.toBeNull();
        expect(parsed?.topic).toContain("Mindfulness");
        expect(parsed?.recommendedQuestions).toHaveLength(2);
    });

    it("stores report as hidden HTML comment and can re-read it", () => {
        const content = appendScopingReportComment("Scoping narrative output", SAMPLE_REPORT);
        const parsed = extractScopingReportFromText(content);
        expect(parsed?.topic).toBe(SAMPLE_REPORT.topic);
        expect(content).toContain("<!-- SCOPING_REPORT:");
    });

    it("removes report markup from display text", () => {
        const withMarkup = `Narrative\n<scoping_report>${JSON.stringify(SAMPLE_REPORT)}</scoping_report>`;
        const stripped = stripScopingReportMarkup(withMarkup);
        expect(stripped).toBe("Narrative");
    });

    it("detects handoff selection by question index", () => {
        const selection = detectScopingHandoffSelection("Go with question 2", SAMPLE_REPORT);
        expect(selection).toEqual({
            index: 2,
            question: SAMPLE_REPORT.recommendedQuestions[1].question,
        });
    });

    it("detects handoff selection by verbatim text", () => {
        const selection = detectScopingHandoffSelection(
            "Let's use: What mechanisms explain mindfulness effects on pain perception in older adults?",
            SAMPLE_REPORT
        );
        expect(selection?.index).toBe(2);
    });

    it("supports single-option yes confirmation", () => {
        const oneOption = { ...SAMPLE_REPORT, recommendedQuestions: [SAMPLE_REPORT.recommendedQuestions[0]] };
        const selection = detectScopingHandoffSelection("yes", oneOption);
        expect(selection?.index).toBe(1);
    });

    it("maps broad assent to the recommended default", () => {
        const selection = detectScopingHandoffSelection("continue with what you have", SAMPLE_REPORT);
        expect(selection).toEqual({
            index: 1,
            question: SAMPLE_REPORT.recommendedQuestions[0].question,
        });
    });

    it("detects theme-overlap handoff selection", () => {
        const selection = detectScopingHandoffSelection("Go with the pain perception mechanisms one", SAMPLE_REPORT);
        expect(selection?.index).toBe(2);
    });

    it("falls back to the default after a handoff was already offered", () => {
        const previouslyOffered = {
            ...SAMPLE_REPORT,
            workflow: {
                ...SAMPLE_REPORT.workflow,
                handoffOffered: true,
            },
        };
        const selection = detectScopingHandoffSelection("not sure", previouslyOffered);
        expect(selection?.index).toBe(1);
    });

    it("extracts latest report from assistant history", () => {
        const first = appendScopingReportComment("Older", { ...SAMPLE_REPORT, topic: "Older topic" });
        const second = appendScopingReportComment("Newer", SAMPLE_REPORT);
        const report = extractLatestScopingReport([
            { role: "assistant", content: first },
            { role: "user", content: "thanks" },
            { role: "assistant", content: second },
        ]);
        expect(report?.topic).toBe(SAMPLE_REPORT.topic);
    });

    it("builds a schema-valid fallback report", () => {
        const fallback = buildFallbackScopingReport("Atrial fibrillation in athletes");
        const parsed = ScopingReportSchema.safeParse(fallback);
        expect(parsed.success).toBe(true);
    });
});
