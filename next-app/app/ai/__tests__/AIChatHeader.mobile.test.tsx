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
  selectedModel: "gpt-5.6-luna" as const,
  reasoningEffort: "medium" as const,
  deliveryMode: "standard" as const,
  showReasoningControls: true,
  reasoningMode: "summary" as const,
  reasoningVisibilitySupport: "full" as const,
  onHistoryToggle: vi.fn(),
  onNewChat: vi.fn(),
  onSelectProject: vi.fn(),
  onModelChange: vi.fn(),
  onReasoningEffortChange: vi.fn(),
  onDeliveryModeChange: vi.fn(),
  onReasoningModeChange: vi.fn(),
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

    fireEvent.click(screen.getByRole("button", { name: "Open AI options" }));

    expect(screen.getByText("Scope")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Project Alpha" }));
    expect(onSelectProject).toHaveBeenCalledWith("project-1");

    fireEvent.click(screen.getByRole("button", { name: "Open AI options" }));
    fireEvent.click(screen.getByRole("radio", { name: /DeepSeek V4 Pro/i }));
    expect(onModelChange).toHaveBeenCalledWith("deepseek-v4-pro");
  });

  it("exposes effort, visibility, and paid delivery as separate mobile controls", () => {
    const onReasoningEffortChange = vi.fn();
    const onReasoningModeChange = vi.fn();
    const onDeliveryModeChange = vi.fn();
    render(
      <AIChatHeader
        {...defaultProps}
        onReasoningEffortChange={onReasoningEffortChange}
        onReasoningModeChange={onReasoningModeChange}
        onDeliveryModeChange={onDeliveryModeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open AI options" }));

    expect(screen.getByText("Reasoning effort")).toBeTruthy();
    expect(screen.getByText("Reasoning visibility")).toBeTruthy();
    expect(screen.getByText("Delivery")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /^High/i }));
    expect(onReasoningEffortChange).toHaveBeenCalledWith("high");

    fireEvent.click(screen.getByRole("radio", { name: /^Full/i }));
    expect(onReasoningModeChange).toHaveBeenCalledWith("full");

    fireEvent.click(screen.getByRole("switch", { name: /faster delivery: off/i }));
    expect(onDeliveryModeChange).toHaveBeenCalledWith("priority");
  });

  it("keeps compute effort but hides unsupported visible reasoning for direct models", () => {
    render(
      <AIChatHeader
        {...defaultProps}
        showReasoningControls={false}
        reasoningVisibilitySupport="none"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open AI options" }));

    expect(screen.getByText("Reasoning effort")).toBeTruthy();
    expect(screen.queryByText("Reasoning visibility")).toBeNull();
    expect(screen.getByText(/reasoning effort still applies/i)).toBeTruthy();
    expect(screen.getByText(/does not return visible reasoning/i)).toBeTruthy();
  });

  it("shows unconfigured models as disabled setup-required choices", () => {
    render(
      <AIChatHeader
        {...defaultProps}
        modelAvailability={{ "deepseek-v4-pro": false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open AI options" }));

    const unavailableModel = screen.getByRole("radio", { name: /DeepSeek V4 Pro/i }) as HTMLButtonElement;
    expect(unavailableModel.disabled).toBe(true);
    expect(screen.getAllByText("Setup required").length).toBeGreaterThan(0);
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
