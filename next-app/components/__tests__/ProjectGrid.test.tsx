// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectGrid } from "../ProjectGrid";

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...props
  }: {
    href: string;
    prefetch?: boolean;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/project/SampleReviewCard", () => ({
  SampleReviewCard: () => null,
}));

describe("ProjectGrid", () => {
  it("disables route prefetch on project cards", () => {
    render(
      <ProjectGrid
        projects={[
          {
            id: "project-1",
            name: "Alpha Review",
            status: "ready",
            statusText: "Status: Review Ready",
            modified: "2026-03-01T00:00:00.000Z",
            created: "2026-03-01T00:00:00.000Z",
          },
        ]}
        viewMode="grid"
        onNewProject={() => {}}
        showSampleCard={false}
      />,
    );

    const projectLink = screen.getByRole("link", { name: "Open project Alpha Review" });
    expect(projectLink.getAttribute("href")).toBe("/project/project-1");
    expect(projectLink.getAttribute("data-prefetch")).toBe("false");
  });
});
