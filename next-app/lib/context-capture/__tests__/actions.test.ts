import { describe, expect, it } from "vitest";
import { actionSupportsKind, canActionApplyToTargets } from "../actions";
import { buildDraftSelectionTarget } from "../targets";

describe("context capture actions", () => {
    it("allows draft selections to reuse the shared send-to-copilot action", () => {
        expect(actionSupportsKind("send_to_copilot", "draft_selection")).toBe(true);

        const draftTarget = buildDraftSelectionTarget({
            projectId: "proj_123",
            section: "Results",
            selectedText: "The intervention group improved more than control.",
            surroundingText: "The intervention group improved more than control across the primary outcome.",
        });

        expect(canActionApplyToTargets("send_to_copilot", [draftTarget])).toBe(true);
    });
});
