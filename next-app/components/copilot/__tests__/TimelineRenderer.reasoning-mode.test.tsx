// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineRenderer } from "../TimelineRenderer";
import type { TimelineItem } from "@/types/timeline";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

vi.mock("@/app/actions/ledger", () => ({
  addMentionedStudyAction: vi.fn(async () => ({ created: true, study: { id: "s1" } })),
}));

vi.mock("@/lib/agent/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent/feature-flags")>("@/lib/agent/feature-flags");
  return {
    ...actual,
    isChatStudyMentionsEnabled: () => false,
  };
});

function buildAssistantItem(reasoningText: string, state: "streaming" | "done" = "done"): TimelineItem[] {
  return [
    {
      type: "assistant_message",
      id: "a-1",
      content: "Final answer.",
      reasoning: {
        text: reasoningText,
        state,
      },
      createdAt: "2026-02-25T00:00:00.000Z",
    },
  ];
}

describe("TimelineRenderer reasoning visibility modes", () => {
  it("hides reasoning UI in off mode", () => {
    render(
      <TimelineRenderer
        items={buildAssistantItem("Detailed internal reasoning here")}
        reasoningMode="off"
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /reasoning/i })).toBeNull();
    expect(screen.queryByText(/Detailed internal reasoning here/i)).toBeNull();
  });

  it("shows truncated preview and local expand in summary mode", () => {
    const longReasoning = "R".repeat(700);
    render(
      <TimelineRenderer
        items={buildAssistantItem(longReasoning)}
        reasoningMode="summary"
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: /Reasoning \(summary\)/i });
    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /Show full/i })).not.toBeNull();
    expect(
      screen.getByText((content) => content.startsWith("R") && content.endsWith("..."))
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show full/i }));
    expect(screen.getByRole("button", { name: /Show less/i })).not.toBeNull();
  });

  it("keeps live reasoning collapsed by default in full mode", () => {
    render(
      <TimelineRenderer
        items={buildAssistantItem("Streaming reasoning body", "streaming")}
        reasoningMode="full"
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: /Thinking/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Streaming reasoning body/)).toBeNull();
  });

  it("keeps live reasoning collapsed by default in summary mode", () => {
    render(
      <TimelineRenderer
        items={buildAssistantItem("Streaming summary reasoning", "streaming")}
        reasoningMode="summary"
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: /Thinking/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Streaming summary reasoning/)).toBeNull();
    expect(screen.getByText(/Live/i)).not.toBeNull();
  });
});
