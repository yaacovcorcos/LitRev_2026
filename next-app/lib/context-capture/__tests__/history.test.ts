// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
    clearAllContextCaptureHistory,
    clearContextCaptureHistory,
    loadContextCaptureHistory,
    pushContextCaptureHistory,
} from "../history";
import { buildDraftSelectionTarget, buildStudyTarget } from "../targets";

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
