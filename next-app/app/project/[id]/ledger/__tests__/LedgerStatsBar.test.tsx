// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Study } from "@/types/ledger";
import { LedgerStatsBar } from "../LedgerStatsBar";

function makeStudy(
  id: string,
  triageDecision?: "keep" | "exclude" | "maybe",
): Study {
  return {
    id,
    title: `Study ${id}`,
    authors: "Doe",
    year: 2024,
    status: "pending",
    quality: "-",
    details: triageDecision ? { triageDecision } : {},
  };
}

describe("LedgerStatsBar", () => {
  it("renders aggregate triage counts", () => {
    render(
      <LedgerStatsBar
        studies={[
          makeStudy("s1", "keep"),
          makeStudy("s2", "exclude"),
          makeStudy("s3", "maybe"),
          makeStudy("s4"),
        ]}
        selectedCount={0}
      />,
    );

    expect(screen.getByText("4 total")).toBeDefined();
    expect(screen.getByText("1 kept")).toBeDefined();
    expect(screen.getByText("1 excluded")).toBeDefined();
    expect(screen.getByText("1 maybe")).toBeDefined();
    expect(screen.getByText("1 untriaged")).toBeDefined();
  });

  it("renders selected chip only when selectedCount > 0", () => {
    const { rerender } = render(
      <LedgerStatsBar studies={[makeStudy("s1")]} selectedCount={0} />,
    );

    expect(screen.queryByText("0 selected")).toBeNull();

    rerender(<LedgerStatsBar studies={[makeStudy("s1")]} selectedCount={2} />);
    expect(screen.getByText("2 selected")).toBeDefined();
  });
});
