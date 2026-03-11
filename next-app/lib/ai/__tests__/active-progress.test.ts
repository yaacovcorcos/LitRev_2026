import { describe, expect, it } from "vitest";
import { normalizeTimelineProgressItems, selectActiveProgress } from "../active-progress";
import type { TimelineItem } from "@/types/timeline";

describe("active progress selection", () => {
    it("returns null when no progress items exist", () => {
        const items: TimelineItem[] = [
            {
                type: "assistant_message",
                id: "a1",
                content: "Done.",
                createdAt: "2026-03-11T00:00:00.000Z",
            },
        ];

        expect(selectActiveProgress(normalizeTimelineProgressItems(items))).toEqual({
            activeProgress: null,
            suppressedProgressId: null,
        });
    });

    it("selects the last normalized progress item in surface order", () => {
        const items: TimelineItem[] = [
            { type: "progress", id: "progress-1", message: "Searching PubMed", current: 1, total: 3 },
            { type: "checkpoint", id: "cp-1", label: "Search returned 12 results", createdAt: "2026-03-11T00:00:00.000Z" },
            { type: "progress", id: "progress-2", message: "Reviewing PubMed results", current: 2, total: 3 },
        ];

        expect(selectActiveProgress(normalizeTimelineProgressItems(items))).toEqual({
            activeProgress: {
                id: "progress-2",
                type: "progress",
                message: "Reviewing PubMed results",
                current: 2,
                total: 3,
            },
            suppressedProgressId: "progress-2",
        });
    });
});
