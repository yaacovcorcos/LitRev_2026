// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { ResizableSplitter } from "../ResizableSplitter";

describe("ResizableSplitter accessibility", () => {
  it("has no obvious axe violations", async () => {
    const { container } = render(
      <ResizableSplitter
        ariaLabel="Resize copilot panel"
        value={360}
        min={300}
        max={560}
        dragDirection="reverse"
        onChange={vi.fn()}
      />,
    );

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});
