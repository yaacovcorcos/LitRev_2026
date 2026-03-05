// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
    clearAllContextCaptureHistory,
    clearContextCaptureHistory,
    loadContextCaptureHistory,
    pushContextCaptureHistory,
} from "../history";
import {
    CONTEXT_CAPTURE_STUDY_SET_MAX,
    buildDraftSelectionTarget,
    buildProtocolFieldTarget,
    buildStudySetTarget,
    buildStudyTarget,
} from "../targets";

describe("context capture history", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
    });

    it("stores draft selections with bounded excerpts only", () => {
        const longSelection = "A".repeat(300);

        pushContextCaptureHistory("proj_123", [
            buildDraftSelectionTarget({
                projectId: "proj_123",
                section: "Results",
                selectedText: longSelection,
                surroundingText: "B".repeat(500),
            }),
        ]);

        const [entry] = loadContextCaptureHistory("proj_123");
        expect(entry.target.kind).toBe("draft_selection");
        if (entry.target.kind !== "draft_selection") {
            throw new Error("Expected draft_selection history target");
        }
        expect(entry.target.selectedText.length).toBeLessThanOrEqual(120);
        expect(entry.target.surroundingText).toBeUndefined();
    });

    it("deduplicates history entries by stable target identity", () => {
        const studyTarget = buildStudyTarget({
            projectId: "proj_123",
            study: {
                studyId: "study_1",
                title: "Study One",
                authors: "Smith",
                year: 2024,
            },
        });

        pushContextCaptureHistory("proj_123", [studyTarget]);
        pushContextCaptureHistory("proj_123", [studyTarget]);

        expect(loadContextCaptureHistory("proj_123")).toHaveLength(1);

        clearContextCaptureHistory("proj_123");
        expect(loadContextCaptureHistory("proj_123")).toEqual([]);
    });

    it("preserves all capped studies in study-set history entries", () => {
        pushContextCaptureHistory("proj_123", [
            buildStudySetTarget({
                projectId: "proj_123",
                studies: Array.from({ length: CONTEXT_CAPTURE_STUDY_SET_MAX }, (_, index) => ({
                    studyId: `study_${index + 1}`,
                    title: `Study ${index + 1}`,
                    authors: `Author ${index + 1}`,
                    year: 2020 + index,
                    abstract: `Abstract ${index + 1}`,
                })),
            }),
        ]);

        const [entry] = loadContextCaptureHistory("proj_123");
        expect(entry.target.kind).toBe("study_set");
        if (entry.target.kind !== "study_set") {
            throw new Error("Expected study_set history target");
        }

        expect(entry.target.studyIds).toHaveLength(CONTEXT_CAPTURE_STUDY_SET_MAX);
        expect(entry.target.studies).toHaveLength(CONTEXT_CAPTURE_STUDY_SET_MAX);
        expect(entry.target.studies.every((study) => study.abstract === undefined)).toBe(true);
    });

    it("retains a bounded protocol field value for history reuse", () => {
        pushContextCaptureHistory("proj_123", [
            buildProtocolFieldTarget({
                projectId: "proj_123",
                section: "Research Question",
                sectionKey: "research-question",
                fieldPath: "researchQuestion",
                fieldLabel: "Research Question",
                value: "A".repeat(400),
            }),
        ]);

        const [entry] = loadContextCaptureHistory("proj_123");
        expect(entry.target.kind).toBe("protocol_field");
        if (entry.target.kind !== "protocol_field") {
            throw new Error("Expected protocol_field history target");
        }

        expect(entry.target.value.length).toBeGreaterThan(0);
        expect(entry.target.value.length).toBeLessThanOrEqual(240);
    });

    it("clears all stored project histories on sign-out cleanup", () => {
        const studyTarget = buildStudyTarget({
            projectId: "proj_123",
            study: {
                studyId: "study_1",
                title: "Study One",
            },
        });

        pushContextCaptureHistory("proj_123", [studyTarget]);
        pushContextCaptureHistory("proj_456", [
            {
                ...studyTarget,
                projectId: "proj_456",
                studyId: "study_2",
                title: "Study Two",
            },
        ]);

        clearAllContextCaptureHistory();

        expect(loadContextCaptureHistory("proj_123")).toEqual([]);
        expect(loadContextCaptureHistory("proj_456")).toEqual([]);
    });
});
