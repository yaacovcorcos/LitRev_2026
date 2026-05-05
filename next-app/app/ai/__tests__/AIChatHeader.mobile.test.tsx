// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AIChatHeader } from "../AIChatHeader";

vi.mock("next/link", async () => {
  const { nextLinkPrefetchMock } = await import("@/test-utils/next-link-prefetch-mock");
  return nextLinkPrefetchMock;
});

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

const defaultProps = {
  isPhoneViewport: true,
  isHistoryCollapsed: true,
  historyContentId: "chat-history-panel",
  selectedProjectId: null,
  selectedScopeLabel: "Global",
  projects: [{ id: "project-1", name: "Project Alpha" }],
  selectedModel: "gpt-5.2" as const,
  showReasoningControls: true,
  reasoningMode: "summary" as const,
  reasoningSupport: "explicit" as const,
  activeTimelineLength: 0,
  onHistoryToggle: vi.fn(),
  onNewChat: vi.fn(),
  onSelectProject: vi.fn(),
  onModelChange: vi.fn(),
  onReasoningModeChange: vi.fn(),
  onExportMarkdown: vi.fn(),
  onExportPdf: vi.fn(),
};

describe("AIChatHeader mobile shell", () => {
  it("keeps the phone header minimal and moves scope/model into the title pill", () => {
    const onSelectProject = vi.fn();
    const onModelChange = vi.fn();
    render(
      <AIChatHeader
        {...defaultProps}
        onSelectProject={onSelectProject}
        onModelChange={onModelChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Open chat history" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More chat actions" })).toBeNull();
    expect(screen.queryByRole("button", { name: /reasoning/i })).toBeNull();
    expect(screen.queryByText("Export MD")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open AI options" }));

    expect(screen.getByText("Scope")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Project Alpha" }));
    expect(onSelectProject).toHaveBeenCalledWith("project-1");

    fireEvent.click(screen.getByRole("button", { name: "Open AI options" }));
    fireEvent.click(screen.getByRole("button", { name: "Grok 4.1 Fast" }));
    expect(onModelChange).toHaveBeenCalledWith("grok-4-1-fast");
  });

  it("keeps export actions contextual behind the mobile more menu", () => {
    const onExportMarkdown = vi.fn();
    render(
      <AIChatHeader
        {...defaultProps}
        activeTimelineLength={2}
        onExportMarkdown={onExportMarkdown}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More chat actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Export Markdown" }));
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);
  });

  it("shows a compact return-to-project action when a previous project is available", () => {
    render(
      <AIChatHeader
        {...defaultProps}
        returnProject={{ id: "project-1", name: "Project Alpha", href: "/project/project-1" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More chat actions" }));

    const returnLink = screen.getByRole("link", { name: "Back to Project Alpha" });
    expect(returnLink.getAttribute("href")).toBe("/project/project-1");
  });

  it("keeps the return-to-project action visible in the desktop header", () => {
    render(
      <AIChatHeader
        {...defaultProps}
        isPhoneViewport={false}
        returnProject={{ id: "project-1", name: "Project Alpha", href: "/project/project-1" }}
      />,
    );

    const returnLink = screen.getByRole("link", { name: "Back to Project Alpha" });
    expect(returnLink.getAttribute("href")).toBe("/project/project-1");
  });
});
