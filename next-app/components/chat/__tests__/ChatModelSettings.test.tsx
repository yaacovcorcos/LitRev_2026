// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ChatDeliveryModeControl,
  ChatModelSelector,
  ChatModelSettingsDialog,
  ChatReasoningEffortSelector,
} from "../ChatModelSettings";

describe("ChatModelSettings", () => {
  it("renders the full seven-model portfolio with setup readiness", () => {
    render(
      <ChatModelSelector
        selectedModel="gpt-5.6-luna"
        onModelChange={vi.fn()}
        availability={{ "deepseek-v4-flash": false }}
        presentation="inline"
      />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect((screen.getByRole("radio", { name: /DeepSeek V4 Flash/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Setup required")).toBeTruthy();
    expect(screen.getByText("Fast & Cheapest")).toBeTruthy();
    expect(screen.getAllByText("Premium")).toHaveLength(2);
  });

  it("requires explicit confirmation before selecting premium Sol", () => {
    const onModelChange = vi.fn();
    render(
      <ChatModelSelector
        selectedModel="gpt-5.6-luna"
        onModelChange={onModelChange}
        presentation="inline"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /GPT-5.6 Sol/i }));

    expect(onModelChange).not.toHaveBeenCalled();
    expect(screen.getByText(/costs about 5× Luna/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use Sol" }));
    expect(onModelChange).toHaveBeenCalledWith("gpt-5.6-sol");
  });

  it("keeps model choices disabled until authenticated readiness is known", () => {
    render(
      <ChatModelSelector
        selectedModel="gpt-5.6-luna"
        onModelChange={vi.fn()}
        availability={{ "gpt-5.6-luna": true }}
        availabilityStatus="loading"
        presentation="inline"
      />,
    );

    expect(screen.getAllByText("Checking model setup…").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("radio").every((option) => (option as HTMLButtonElement).disabled)).toBe(true);
  });

  it("offers an explicit retry when model readiness fails", () => {
    const onRetryAvailability = vi.fn();
    render(
      <ChatModelSelector
        selectedModel="gpt-5.6-luna"
        onModelChange={vi.fn()}
        availabilityStatus="error"
        onRetryAvailability={onRetryAvailability}
        presentation="inline"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryAvailability).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("radio").every((option) => (option as HTMLButtonElement).disabled)).toBe(true);
  });

  it("shows only reasoning efforts supported by the selected model", () => {
    render(
      <ChatReasoningEffortSelector
        selectedModel="deepseek-v4-pro"
        reasoningEffort="high"
        onReasoningEffortChange={vi.fn()}
        presentation="inline"
      />,
    );

    const labels = screen.getAllByRole("radio").map((option) => option.textContent);
    expect(labels).toHaveLength(3);
    expect(labels.some((label) => label?.includes("Fast"))).toBe(true);
    expect(labels.some((label) => label?.includes("High"))).toBe(true);
    expect(labels.some((label) => label?.includes("Maximum"))).toBe(true);
    expect(labels.some((label) => label?.includes("Medium"))).toBe(false);
  });

  it("offers faster delivery only when the selected model supports it", () => {
    const { rerender } = render(
      <ChatDeliveryModeControl
        selectedModel="deepseek-v4-pro"
        deliveryMode="standard"
        onDeliveryModeChange={vi.fn()}
        presentation="inline"
      />,
    );

    expect(screen.queryByRole("switch")).toBeNull();

    const onDeliveryModeChange = vi.fn();
    rerender(
      <ChatDeliveryModeControl
        selectedModel="grok-4.5"
        deliveryMode="standard"
        onDeliveryModeChange={onDeliveryModeChange}
        presentation="inline"
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: /faster delivery: off/i }));
    expect(onDeliveryModeChange).toHaveBeenCalledWith("priority");
    expect(screen.getByText(/2× token price/i)).toBeTruthy();
  });

  it("does not render an empty delivery section for standard-only models", () => {
    render(
      <ChatModelSettingsDialog
        selectedModel="deepseek-v4-pro"
        onModelChange={vi.fn()}
        availability={{ "deepseek-v4-pro": true }}
        availabilityStatus="ready"
        reasoningEffort="high"
        onReasoningEffortChange={vi.fn()}
        deliveryMode="standard"
        onDeliveryModeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /AI settings/i }));
    expect(screen.queryByRole("heading", { name: "Delivery" })).toBeNull();
    expect(screen.getByText(/Choose the model and reasoning effort for the next message/i)).toBeTruthy();
  });
});
