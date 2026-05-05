// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatTimeline } from "../ChatTimeline";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

describe("ChatTimeline empty state", () => {
  it("supports a minimal empty state without icon, description, or suggestions", () => {
    render(
      <ChatTimeline
        variant="page"
        items={[]}
        isLoading={false}
        emptyState={{
          icon: "",
          title: "How can I help with your research?",
          description: "",
          suggestions: [],
          layout: "minimal",
        }}
        onSuggestionClick={vi.fn()}
      />,
    );

    expect(screen.getByText("How can I help with your research?")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
