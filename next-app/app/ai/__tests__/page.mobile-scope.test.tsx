// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  installAiViewTestLifecycle,
  renderAiView,
  setAiViewPhoneViewport,
} from "./page-support";

installAiViewTestLifecycle();

describe("/ai page mobile-only shell scoping", () => {
  it("keeps the desktop AI entry surface on the full workspace layout", async () => {
    renderAiView();

    await waitFor(() => {
      expect(screen.getByTestId("app-shell").getAttribute("data-mobile-full-bleed")).toBe("false");
    });

    const emptyState = screen.getByTestId("ai-empty-state");
    expect(emptyState.getAttribute("data-layout")).toBe("default");
    expect(screen.getByTestId("ai-empty-state-icon").textContent).toBe("auto_awesome");
    expect(screen.getByText("Ask me anything about your literature review, or try one of these:")).toBeTruthy();
    expect(screen.getByTestId("ai-empty-state-suggestion-count").textContent).toBe("6");
    expect(screen.getByRole("button", { name: "Summarize a paper" })).toBeTruthy();

    const composer = screen.getByTestId("ai-composer");
    expect(composer.getAttribute("data-hide-model-control")).toBe("no");
    expect(composer.getAttribute("data-compact-mobile-chrome")).toBe("no");
    expect(screen.getByRole("button", { name: "compress history" })).toBeTruthy();
  });

  it("keeps the minimalist shell only on phone viewports", async () => {
    setAiViewPhoneViewport(true);

    renderAiView();

    await waitFor(() => {
      expect(screen.getByTestId("app-shell").getAttribute("data-mobile-full-bleed")).toBe("true");
    });

    const emptyState = screen.getByTestId("ai-empty-state");
    expect(emptyState.getAttribute("data-layout")).toBe("minimal");
    expect(screen.getByTestId("ai-empty-state-icon").textContent).toBe("");
    expect(screen.queryByText("Ask me anything about your literature review, or try one of these:")).toBeNull();
    expect(screen.getByTestId("ai-empty-state-suggestion-count").textContent).toBe("0");
    expect(screen.queryByRole("button", { name: "Summarize a paper" })).toBeNull();

    const composer = screen.getByTestId("ai-composer");
    expect(composer.getAttribute("data-hide-model-control")).toBe("yes");
    expect(composer.getAttribute("data-compact-mobile-chrome")).toBe("yes");
    expect(screen.queryByRole("button", { name: "compress history" })).toBeNull();
  });
});
