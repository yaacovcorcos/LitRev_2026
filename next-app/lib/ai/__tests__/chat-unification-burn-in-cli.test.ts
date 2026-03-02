import { describe, expect, it } from "vitest";
import {
  buildCohortWhereInput,
  evaluateRunEndCoverageGates,
  formatCohortScope,
  hasCohortScope,
  parseCsvIdArg,
  parseIsoDateArg,
  resolveBurnInWindow,
  summarizeRunEndRunIdCoverage,
} from "@/lib/ai/chat-unification-burn-in-cli";

describe("chat unification burn-in CLI helpers", () => {
  it("throws when required --since is missing", () => {
    expect(() => parseIsoDateArg("since", undefined, true)).toThrow(
      "Missing required --since=<iso-date> argument",
    );
  });

  it("throws on invalid ISO timestamps", () => {
    expect(() => parseIsoDateArg("since", "not-a-date", true)).toThrow(
      "Invalid ISO timestamp for --since: not-a-date",
    );
  });

  it("throws when since is greater than until", () => {
    const since = new Date("2026-03-10T00:00:00.000Z");
    const until = new Date("2026-03-05T00:00:00.000Z");
    expect(() => resolveBurnInWindow({ since, until })).toThrow("--since must be <= --until");
  });

  it("enforces a minimum 7-day window unless explicitly overridden", () => {
    const since = new Date("2026-03-01T00:00:00.000Z");
    const until = new Date("2026-03-03T00:00:00.000Z");

    expect(() => resolveBurnInWindow({ since, until })).toThrow(
      "Burn-in window must cover at least 7 days",
    );
    expect(() =>
      resolveBurnInWindow({
        since,
        until,
        allowShortWindow: true,
      }),
    ).not.toThrow();
  });

  it("uses now as implicit until when omitted", () => {
    const since = new Date("2026-03-01T00:00:00.000Z");
    const now = new Date("2026-03-10T00:00:00.000Z");
    const window = resolveBurnInWindow({ since, now });
    expect(window.until.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("parses CSV id args and deduplicates values", () => {
    expect(parseCsvIdArg("workspaceIds", " ws-1,ws-2,ws-1 ")).toEqual(["ws-1", "ws-2"]);
    expect(parseCsvIdArg("workspaceIds", undefined)).toBeNull();
    expect(() => parseCsvIdArg("workspaceIds", " , , ")).toThrow(
      "Invalid --workspaceIds list",
    );
  });

  it("formats and materializes cohort scope filters", () => {
    const scoped = {
      workspaceIds: ["ws-1"],
      userIds: ["u-1", "u-2"],
    };
    const unscoped = {
      workspaceIds: null,
      userIds: null,
    };

    expect(hasCohortScope(scoped)).toBe(true);
    expect(hasCohortScope(unscoped)).toBe(false);
    expect(formatCohortScope(scoped)).toContain("workspaces=ws-1");
    expect(formatCohortScope(scoped)).toContain("users=u-1,u-2");
    expect(formatCohortScope(unscoped)).toBe("all-traffic (no cohort filter)");
    expect(buildCohortWhereInput(scoped)).toEqual({
      OR: [
        { workspaceId: { in: ["ws-1"] } },
        { userId: { in: ["u-1", "u-2"] } },
      ],
    });
    expect(buildCohortWhereInput(unscoped)).toEqual({});
    expect(buildCohortWhereInput({ workspaceIds: ["ws-1"], userIds: null })).toEqual({
      workspaceId: { in: ["ws-1"] },
    });
    expect(buildCohortWhereInput({ workspaceIds: null, userIds: ["u-1"] })).toEqual({
      userId: { in: ["u-1"] },
    });
  });

  it("summarizes run_end runId coverage and enforces optional gates", () => {
    const rows = [
      {
        type: "run_end_observed",
        surface: "ai" as const,
        runId: "run-ai-1",
        recordedAt: new Date("2026-03-02T00:00:00.000Z"),
        conversationId: "conv-ai",
        projectId: null,
      },
      {
        type: "run_end_observed",
        surface: "ai" as const,
        runId: null,
        recordedAt: new Date("2026-03-02T00:00:10.000Z"),
        conversationId: "conv-ai-2",
        projectId: "proj-1",
      },
      {
        type: "run_end_observed",
        surface: "project" as const,
        runId: "run-prj-1",
        recordedAt: new Date("2026-03-02T00:00:20.000Z"),
        conversationId: "conv-prj",
        projectId: "proj-2",
      },
    ];

    const summary = summarizeRunEndRunIdCoverage(rows);
    expect(summary.bySurface.ai.total).toBe(2);
    expect(summary.bySurface.ai.withRunId).toBe(1);
    expect(summary.bySurface.ai.missingRunId).toBe(1);
    expect(summary.bySurface.ai.coverage).toBe(0.5);
    expect(summary.bySurface.ai.missingSamples).toHaveLength(1);
    expect(summary.bySurface.project.coverage).toBe(1);

    const failures = evaluateRunEndCoverageGates(summary, {
      requireRunEndPerSurface: true,
      minRunIdCoveragePerSurface: 0.75,
    });
    expect(failures.some((failure) => failure.includes("ai runId coverage below threshold"))).toBe(
      true,
    );
    expect(
      failures.some((failure) => failure.includes("project runId coverage below threshold")),
    ).toBe(false);
  });
});
