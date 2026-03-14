// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  addProjectDataChangedListener,
  dispatchProjectDataChanged,
  type ProjectDataChangedDetail,
} from "@/lib/project-data-events";

describe("project-data-events", () => {
  it("deduplicates domains and propagates the canonical reason", () => {
    const listener = vi.fn<(detail: ProjectDataChangedDetail) => void>();
    const remove = addProjectDataChangedListener(listener);

    dispatchProjectDataChanged({
      projectId: "project-1",
      domains: ["ledger", "ledger", "notes"],
      reason: "server_mutation",
      source: "test_dispatch",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      projectId: "project-1",
      domains: ["ledger", "notes"],
      reason: "server_mutation",
      source: "test_dispatch",
    });

    remove();
  });

  it("keeps domain-only listeners working when they ignore reason", () => {
    const seenDomains: string[][] = [];
    const remove = addProjectDataChangedListener((detail) => {
      seenDomains.push(detail.domains);
    });

    dispatchProjectDataChanged({
      projectId: "project-2",
      domains: ["memory"],
      reason: "artifact_accept",
      source: "artifact_review",
    });

    expect(seenDomains).toEqual([["memory"]]);
    remove();
  });

  it("emits the legacy ledger bridge only when the ledger domain is invalidated", () => {
    const ledgerHandler = vi.fn<(event: Event) => void>();
    window.addEventListener("litrev:ledger-changed", ledgerHandler);

    dispatchProjectDataChanged({
      projectId: "project-3",
      domains: ["notes"],
      reason: "manual_refresh",
    });
    dispatchProjectDataChanged({
      projectId: "project-3",
      domains: ["ledger", "ledger"],
      reason: "server_mutation",
    });

    expect(ledgerHandler).toHaveBeenCalledTimes(1);
    const detail = (ledgerHandler.mock.calls[0]?.[0] as CustomEvent<{ projectId: string }>).detail;
    expect(detail).toEqual({ projectId: "project-3" });

    window.removeEventListener("litrev:ledger-changed", ledgerHandler);
  });
});
