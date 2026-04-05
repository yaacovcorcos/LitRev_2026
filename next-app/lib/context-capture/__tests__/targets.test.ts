import { describe, expect, it } from "vitest";
import {
    CONTEXT_CAPTURE_STUDY_SET_MAX,
    buildProtocolCriterionTarget,
    buildStudySetTarget,
    buildNoteTarget,
    contextTargetToPopupContext,
    popupContextToContextTarget,
} from "../targets";

describe("context capture target builders", () => {
    it("caps study-set targets to the v1 selection limit", () => {
        const target = buildStudySetTarget({
            projectId: "proj_123",
            studies: Array.from({ length: CONTEXT_CAPTURE_STUDY_SET_MAX + 2 }, (_, index) => ({
                studyId: `study_${index}`,
                title: `Study ${index}`,
                authors: `Author ${index}`,
                year: 2020 + index,
            })),
        });

        expect(target.studyIds).toHaveLength(CONTEXT_CAPTURE_STUDY_SET_MAX);
        expect(target.studies).toHaveLength(CONTEXT_CAPTURE_STUDY_SET_MAX);
        expect(target.preview).toContain("+3 more");
    });

    it("adapts protocol criteria to popup-safe criterion context", () => {
        const target = buildProtocolCriterionTarget({
            projectId: "proj_123",
            criterionType: "inclusion",
            criterionIndex: 1,
            text: "Adults with randomized controlled trials only",
        });

        expect(contextTargetToPopupContext(target)).toEqual({
            type: "criterion",
            projectId: "proj_123",
            criterionType: "inclusion",
            criterionIndex: 1,
            text: "Adults with randomized controlled trials only",
        });
    });

    it("rebuilds protocol criterion targets from popup context without losing identity", () => {
        expect(popupContextToContextTarget({
            type: "criterion",
            projectId: "proj_123",
            criterionType: "exclusion",
            criterionIndex: 2,
            text: "Exclude conference abstracts",
        })).toMatchObject({
            kind: "protocol_criterion",
            projectId: "proj_123",
            criterionType: "exclusion",
            criterionIndex: 2,
            text: "Exclude conference abstracts",
        });
    });

    it("keeps notes out of popup transport", () => {
        const target = buildNoteTarget({
            projectId: "proj_123",
            noteId: "note_123",
            title: "Reviewer note",
            content: {
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Important note content" }] }],
            },
        });

        expect(contextTargetToPopupContext(target)).toBeNull();
    });
});
