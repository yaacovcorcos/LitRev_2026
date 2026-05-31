// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import NotFound from "../not-found";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ activeNav, children }: { activeNav: string; children: ReactNode }) => (
    <main data-active-nav={activeNav}>{children}</main>
  ),
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({
    title,
    description,
    primaryAction,
  }: {
    title: string;
    description?: string;
    primaryAction?: { label: string; href?: string };
  }) => (
    <section>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {primaryAction?.href ? <a href={primaryAction.href}>{primaryAction.label}</a> : null}
    </section>
  ),
}));

describe("app not-found route", () => {
  it("renders a LitRev workspace fallback instead of Next.js default copy", () => {
    render(<NotFound />);

    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(screen.getByText("The LitRev page you requested does not exist or is no longer available.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to workspace" }).getAttribute("href")).toBe("/");
  });
});
