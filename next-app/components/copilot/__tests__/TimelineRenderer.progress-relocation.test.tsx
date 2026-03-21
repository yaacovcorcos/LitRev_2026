// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineRenderer } from "../TimelineRenderer";
import type { TimelineItem } from "@/types/timeline";

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "project-1" }),
}));

describe("TimelineRenderer progress suppression", () => {
    const emptyState = {
        icon: "chat",
        title: "Empty",
        description: "Empty",
        suggestions: [],
    };

    it("suppresses only the matching progress item", () => {
        const items: TimelineItem[] = [
            { type: "progress", id: "progress-1", message: "Searching PubMed", current: 1, total: 3 },
            {
                type: "tool_activity",
                id: "tool-1",
                callId: "tool-call-1",
                toolName: "search_pubmed",
                status: "running",
                startedAt: "2026-03-11T00:00:00.000Z",
                updatedAt: "2026-03-11T00:00:00.000Z",
                createdAt: "2026-03-11T00:00:00.000Z",
            },
            { type: "checkpoint", id: "checkpoint-1", label: "PubMed returned 18 results", createdAt: "2026-03-11T00:00:01.000Z" },
            { type: "progress", id: "progress-2", message: "Reviewing PubMed results", current: 2, total: 3 },
        ];

        render(
            <TimelineRenderer
                items={items}
                isLoading={false}
                emptyState={emptyState}
                onSuggestionClick={vi.fn()}
                suppressedProgressId="progress-2"
            />,
        );

        expect(screen.getAllByText("Searching PubMed").length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText("Reviewing PubMed results")).toBeNull();
        expect(screen.getByText("PubMed")).toBeTruthy();
        expect(screen.getByText("PubMed returned 18 results")).toBeTruthy();
    });
});
