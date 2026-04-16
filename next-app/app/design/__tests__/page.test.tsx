// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import DesignLabIndexPage from "../page";

vi.mock("@/components/design-lab/DesignLabShell", () => ({
  DesignLabShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <div data-testid="design-shell">
      <div>{title}</div>
      {children}
    </div>
  ),
}));

vi.mock("@/components/design-lab/DesignLabIndexContent", () => ({
  DesignLabIndexContent: () => <div>Index content</div>,
}));

describe("design lab index page", () => {
  it("renders inside the shared design shell", () => {
    render(<DesignLabIndexPage />);

    expect(screen.getByTestId("design-shell")).toBeTruthy();
    expect(screen.getByText("Frontend-only design sandbox")).toBeTruthy();
    expect(screen.getByText("Index content")).toBeTruthy();
  });
});
