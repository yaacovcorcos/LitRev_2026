import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatReasoningModeDropdown } from "../ChatReasoningModeDropdown";

describe("ChatReasoningModeDropdown SSR", () => {
  it("renders a stable non-Radix trigger before hydration", () => {
    const html = renderToString(
      <ChatReasoningModeDropdown
        reasoningMode="full"
        onReasoningModeChange={vi.fn()}
      >
        <button type="button" aria-label="Reasoning visibility: full">
          Trigger
        </button>
      </ChatReasoningModeDropdown>,
    );

    expect(html).toContain("Reasoning visibility: full");
    expect(html).not.toContain("aria-controls=");
    expect(html).not.toContain("radix-");
  });
});
