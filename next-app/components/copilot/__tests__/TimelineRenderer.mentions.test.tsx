// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TimelineRenderer } from "../TimelineRenderer";
import type { TimelineItem } from "@/types/timeline";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

const addMentionedStudyAction = vi.fn();
vi.mock("@/app/actions/ledger", () => ({
  addMentionedStudyAction: (...args: unknown[]) => addMentionedStudyAction(...args),
}));

vi.mock("@/lib/agent/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent/feature-flags")>("@/lib/agent/feature-flags");
  return {
    ...actual,
    isChatStudyMentionsEnabled: () => true,
  };
});

describe("TimelineRenderer mention and metadata behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strips hidden metadata blocks from rendered assistant text", () => {
    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: `Visible narrative\n\n<!-- SCOPING_REPORT: {\"topic\":\"x\"} -->\n<!-- MENTIONED_STUDIES: {\"studies\":[{\"title\":\"Study\",\"doi\":\"10.1000/x\"}]} -->`,
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    expect(screen.getByText("Visible narrative")).not.toBeNull();
    expect(screen.queryByText(/SCOPING_REPORT/i)).toBeNull();
    expect(screen.queryByText(/MENTIONED_STUDIES/i)).toBeNull();
  });

  it("renders mentioned-study chips and supports one-click add", async () => {
    addMentionedStudyAction.mockResolvedValue({ success: true, data: {
      created: true,
      study: { id: "study-1", title: "Turner et al. 2016" },
    } });

    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: "See [Turner et al. 2016](https://doi.org/10.1097/j.pain.0000000000000635)",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    const addBtn = screen.getByRole("button", { name: "Add to ledger" });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(addMentionedStudyAction).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "Added" })).not.toBeNull();
    });

    expect(addMentionedStudyAction).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ doi: "10.1097/j.pain.0000000000000635" })
    );
  });

  it("shows already-in-ledger state when server reports duplicate", async () => {
    addMentionedStudyAction.mockResolvedValue({ success: true, data: {
      created: false,
      matchedBy: "doi",
      study: { id: "study-1", title: "Turner et al. 2016" },
    } });

    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: "See [Turner et al. 2016](https://doi.org/10.1097/j.pain.0000000000000635)",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to ledger" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Already in ledger" })).not.toBeNull();
    });
  });
});
