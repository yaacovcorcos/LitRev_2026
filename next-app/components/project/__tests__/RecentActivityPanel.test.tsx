// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecentActivityPanel } from "../RecentActivityPanel";

const { mockGetRecentActivityAction } = vi.hoisted(() => ({
    mockGetRecentActivityAction: vi.fn(),
}));

vi.mock("@/app/actions/activity", () => ({
    getRecentActivityAction: mockGetRecentActivityAction,
}));

describe("RecentActivityPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders loading then activity rows", async () => {
        mockGetRecentActivityAction.mockResolvedValue([
            {
                id: "a1",
                kind: "artifact_applied",
                label: 'Applied protocol change: "Eligibility update"',
                timestamp: "2026-02-21T12:00:00.000Z",
                icon: "auto_awesome",
                href: "/project/project-1/protocol",
            },
        ]);

        render(<RecentActivityPanel projectId="project-1" />);

        expect(screen.getByLabelText("Loading recent activity")).toBeTruthy();

        await waitFor(() => {
            expect(screen.getByText('Applied protocol change: "Eligibility update"')).toBeTruthy();
        });
    });

    it("renders empty state when no activity exists", async () => {
        mockGetRecentActivityAction.mockResolvedValue([]);

        render(<RecentActivityPanel projectId="project-1" />);

        await waitFor(() => {
            expect(screen.getByText("No activity yet.")).toBeTruthy();
        });
    });

    it("renders error state on action failure", async () => {
        mockGetRecentActivityAction.mockRejectedValue(new Error("boom"));

        render(<RecentActivityPanel projectId="project-1" />);

        await waitFor(() => {
            expect(screen.getByText("Could not load recent activity.")).toBeTruthy();
        });
    });
});
