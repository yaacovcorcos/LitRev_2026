// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("renders loading then activity rows", async () => {
        mockGetRecentActivityAction.mockResolvedValue({ success: true, data: [
            {
                id: "a1",
                kind: "artifact_applied",
                label: 'Applied protocol change: "Eligibility update"',
                timestamp: "2026-02-21T12:00:00.000Z",
                icon: "auto_awesome",
                href: "/project/project-1/protocol",
            },
        ] });

        render(<RecentActivityPanel projectId="project-1" />);

        expect(screen.getByLabelText("Loading recent activity")).toBeTruthy();

        await waitFor(() => {
            expect(screen.getByText('Applied protocol change: "Eligibility update"')).toBeTruthy();
        });
    });

    it("renders empty state when no activity exists", async () => {
        mockGetRecentActivityAction.mockResolvedValue({ success: true, data: [] });

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

    it("keeps the loading shell visible and defers the fetch until idle when requested", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("requestIdleCallback", undefined);
        vi.stubGlobal("cancelIdleCallback", undefined);
        mockGetRecentActivityAction.mockResolvedValue({ success: true, data: [] });

        render(<RecentActivityPanel projectId="project-1" deferUntilIdle />);

        expect(screen.getByLabelText("Loading recent activity")).toBeTruthy();
        expect(mockGetRecentActivityAction).not.toHaveBeenCalled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(250);
        });

        expect(mockGetRecentActivityAction).toHaveBeenCalledWith("project-1", 8);
    });
});
