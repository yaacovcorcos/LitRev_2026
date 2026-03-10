// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineRenderer } from "../TimelineRenderer";
import type { TimelineItem } from "@/types/timeline";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

function makeItems(count: number): TimelineItem[] {
  return Array.from({ length: count }, (_, index) => ({
    type: index % 2 === 0 ? "user_message" : "assistant_message",
    id: `item-${index}`,
    content: `Fixture message ${index}`,
    createdAt: new Date(2026, 0, 1, 0, index).toISOString(),
  }));
}

describe("TimelineRenderer shared defaults", () => {
  it("renders the full timeline when no ai-only windowing props are provided", async () => {
    render(
      <TimelineRenderer
        variant="page"
        items={makeItems(120)}
        isLoading={false}
        emptyState={{
          icon: "chat",
          title: "Empty",
          description: "Empty",
          suggestions: [],
        }}
        onSuggestionClick={() => {}}
      />,
    );

    expect(await screen.findByText("Fixture message 0")).toBeTruthy();
    expect(screen.getByText("Fixture message 119")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show earlier messages/i })).toBeNull();
  }, 10000);
});
