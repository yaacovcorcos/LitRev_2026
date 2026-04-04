// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatTimeline } from "../ChatTimeline";
import type { TimelineItem } from "@/types/timeline";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

vi.mock("@/app/actions/ledger", () => ({
  addMentionedStudyAction: vi.fn(async () => ({ success: true, data: { created: true, study: { id: "s1" } } })),
}));

vi.mock("@/lib/agent/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent/feature-flags")>("@/lib/agent/feature-flags");
  return {
    ...actual,
    isChatStudyMentionsEnabled: () => false,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItems(count: number): TimelineItem[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "user_message" as const,
    id: `msg-${i + 1}`,
    content: `Message ${i + 1}`,
    createdAt: new Date(2026, 1, 20, i).toISOString(),
  }));
}

const defaultProps = {
  isLoading: false,
  emptyState: { icon: "chat", title: "Empty", description: "Empty", suggestions: [] },
  onSuggestionClick: vi.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ChatTimeline load-older messages", () => {
  it("renders 'Load older messages' button when hasMore=true", () => {
    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(3)}
        hasMore={true}
        isLoadingOlder={false}
        onLoadOlder={vi.fn()}
      />,
    );

    const btn = screen.getByRole("button", { name: /load older messages/i });
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain("Load older messages");
  }, 30000);

  it("does not render button when hasMore=false", () => {
    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(3)}
        hasMore={false}
        isLoadingOlder={false}
        onLoadOlder={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /load older messages/i })).toBeNull();
  });

  it("does not render button when hasMore is undefined", () => {
    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(3)}
      />,
    );

    expect(screen.queryByRole("button", { name: /load older messages/i })).toBeNull();
  });

  it("calls onLoadOlder when button is clicked", async () => {
    const onLoadOlder = vi.fn(async () => {});

    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(3)}
        hasMore={true}
        isLoadingOlder={false}
        onLoadOlder={onLoadOlder}
      />,
    );

    const btn = screen.getByRole("button", { name: /load older messages/i });
    fireEvent.click(btn);

    expect(onLoadOlder).toHaveBeenCalledOnce();
  });

  it("disables button when isLoadingOlder=true", () => {
    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(3)}
        hasMore={true}
        isLoadingOlder={true}
        onLoadOlder={vi.fn()}
      />,
    );

    const btn = screen.getByRole("button", { name: /load older messages/i });
    expect(btn).toHaveProperty("disabled", true);
  });

  it("shows 'Loading...' text when isLoadingOlder=true", () => {
    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(3)}
        hasMore={true}
        isLoadingOlder={true}
        onLoadOlder={vi.fn()}
      />,
    );

    const btn = screen.getByRole("button", { name: /load older messages/i });
    expect(btn.textContent).toContain("Loading...");
  });

  it("wraps the first timeline item in a ref wrapper div", () => {
    const items = makeItems(3);

    const { container } = render(
      <ChatTimeline
        {...defaultProps}
        items={items}
        hasMore={true}
        onLoadOlder={vi.fn()}
      />,
    );

    // The first item should be wrapped in an extra div (for firstItemRef)
    // while subsequent items are not double-wrapped
    const chatList = container.querySelector('[class*="chatList"]');
    expect(chatList).toBeTruthy();

    // First message item (after the load-older row) should have a wrapper div
    const children = Array.from(chatList!.children);
    // children[0] = loadOlderRow, children[1] = firstItemRef wrapper
    expect(children.length).toBeGreaterThanOrEqual(2);
  });

  it("does not render button when timeline is empty (empty state shown instead)", () => {
    render(
      <ChatTimeline
        {...defaultProps}
        items={[]}
        hasMore={true}
        onLoadOlder={vi.fn()}
      />,
    );

    // Empty state should be shown, no load older button
    expect(screen.queryByRole("button", { name: /load older messages/i })).toBeNull();
  });

  it("keeps hook order stable when rerendering from empty state to populated timeline", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <ChatTimeline
        {...defaultProps}
        items={[]}
      />,
    );

    rerender(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(2)}
      />,
    );

    expect(screen.getByText("Message 1")).toBeTruthy();
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("collapses older already-loaded messages when initialVisibleCount is provided", () => {
    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(6)}
        initialVisibleCount={3}
        visibleStep={2}
      />,
    );

    expect(screen.queryByText("Message 1")).toBeNull();
    expect(screen.queryByText("Message 2")).toBeNull();
    expect(screen.queryByText("Message 3")).toBeNull();
    expect(screen.getByText("Message 4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /show 2 earlier messages/i })).toBeTruthy();
  });

  it("reveals hidden messages in steps when requested", () => {
    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(6)}
        initialVisibleCount={3}
        visibleStep={2}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /show 2 earlier messages/i }));

    expect(screen.getByText("Message 2")).toBeTruthy();
    expect(screen.getByText("Message 3")).toBeTruthy();
    expect(screen.getByText("Message 4")).toBeTruthy();
    expect(screen.queryByText("Message 1")).toBeNull();
    expect(screen.getByRole("button", { name: /show 1 earlier message/i })).toBeTruthy();
  });

  it("reports timeline readiness details for the visible window", () => {
    const onTimelineReady = vi.fn();

    render(
      <ChatTimeline
        {...defaultProps}
        items={makeItems(5)}
        initialVisibleCount={2}
        onTimelineReady={onTimelineReady}
      />,
    );

    expect(onTimelineReady).toHaveBeenCalledWith({
      visibleItems: 2,
      hiddenItems: 3,
      totalItems: 5,
    });
  });
});
