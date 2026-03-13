import { describe, expect, it } from "vitest";

import { assessRunConvergence } from "@/lib/server/agent/run-convergence";

describe("run convergence", () => {
  const now = new Date("2026-03-13T12:00:00.000Z");
  const staleMs = 90_000;

  it("recommends reconnect for healthy active runs making durable progress", () => {
    expect(
      assessRunConvergence(
        {
          status: "running",
          lastActivityAt: new Date("2026-03-13T11:59:40.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:59:35.000Z"),
          finalizationState: "not_started",
          abnormalEndClassification: null,
        },
        now,
        staleMs,
      ),
    ).toMatchObject({
      recoveryRecommendation: "reconnect",
      noForwardDurableProgress: false,
      abnormalEndClassification: null,
    });
  });

  it("recommends stop-and-retry when durable progress stalls while the heartbeat stays fresh", () => {
    expect(
      assessRunConvergence(
        {
          status: "running",
          lastActivityAt: new Date("2026-03-13T11:59:50.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:58:00.000Z"),
          finalizationState: "not_started",
          abnormalEndClassification: null,
        },
        now,
        staleMs,
      ),
    ).toMatchObject({
      recoveryRecommendation: "stop_and_retry",
      noForwardDurableProgress: true,
      abnormalEndClassification: "no_forward_durable_progress",
    });
  });

  it("treats finalization in progress as reconnectable while the heartbeat remains fresh", () => {
    expect(
      assessRunConvergence(
        {
          status: "running",
          lastActivityAt: new Date("2026-03-13T11:59:50.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:58:00.000Z"),
          finalizationState: "in_progress",
          abnormalEndClassification: null,
        },
        now,
        staleMs,
      ),
    ).toMatchObject({
      recoveryRecommendation: "reconnect",
      noForwardDurableProgress: false,
    });
  });

  it("recommends stop-and-retry for runs with failed finalization", () => {
    expect(
      assessRunConvergence(
        {
          status: "running",
          lastActivityAt: new Date("2026-03-13T11:59:55.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:59:50.000Z"),
          finalizationState: "failed",
          abnormalEndClassification: "finalization_failed",
        },
        now,
        staleMs,
      ),
    ).toMatchObject({
      recoveryRecommendation: "stop_and_retry",
      abnormalEndClassification: "finalization_failed",
    });
  });
});
