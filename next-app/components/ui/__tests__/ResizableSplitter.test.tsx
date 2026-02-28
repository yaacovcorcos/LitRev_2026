// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ResizableSplitter } from "../ResizableSplitter";

function SplitterHarness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState(360);
  return (
    <>
      <ResizableSplitter
        ariaLabel="Resize copilot panel"
        value={value}
        min={300}
        max={560}
        step={20}
        dragDirection="reverse"
        disabled={disabled}
        onChange={setValue}
      />
      <output data-testid="width">{value}</output>
    </>
  );
}

describe("ResizableSplitter", () => {
  it("exposes separator semantics and keyboard resizing", () => {
    render(<SplitterHarness />);
    const splitter = screen.getByRole("separator", { name: "Resize copilot panel" });
    const width = screen.getByTestId("width");

    expect(splitter.getAttribute("aria-valuemin")).toBe("300");
    expect(splitter.getAttribute("aria-valuemax")).toBe("560");
    expect(splitter.getAttribute("aria-valuenow")).toBe("360");

    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(width.textContent).toBe("380");

    fireEvent.keyDown(splitter, { key: "ArrowRight" });
    expect(width.textContent).toBe("360");

    fireEvent.keyDown(splitter, { key: "Home" });
    expect(width.textContent).toBe("300");

    fireEvent.keyDown(splitter, { key: "End" });
    expect(width.textContent).toBe("560");
  });

  it("does not resize when disabled", () => {
    render(<SplitterHarness disabled />);
    const splitter = screen.getByRole("separator", { name: "Resize copilot panel" });
    const width = screen.getByTestId("width");

    expect(splitter.getAttribute("tabindex")).toBe("-1");
    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(width.textContent).toBe("360");
  });
});
