// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import LibraryView from "../page";

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/TopBar", () => ({
  TopBar: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <div>{title}</div>
      {subtitle ? <div>{subtitle}</div> : null}
    </div>
  ),
}));

describe("Library route shell structure", () => {
  it("uses the shared contained-shell scroll structure with its own route layout", () => {
    const { container } = render(<LibraryView />);

    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByLabelText("Search library")).toBeTruthy();
    expect(container.querySelector('.surface-root[data-surface-height="shell"]')).toBeTruthy();
    expect(container.querySelector('.surface-scroll-body[data-surface-padding="responsive"]')).toBeTruthy();
  });
});
