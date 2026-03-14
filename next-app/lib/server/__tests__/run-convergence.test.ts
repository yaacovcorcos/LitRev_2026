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
          runPhase: "act",
          phaseEnteredAt: new Date("2026-03-13T11:59:20.000Z"),
          lastActivityAt: new Date("2026-03-13T11:59:40.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:59:35.000Z"),
          durabilityState: "durable",
          durabilityDegradedReason: null,
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
          runPhase: "act",
          phaseEnteredAt: new Date("2026-03-13T11:58:30.000Z"),
          lastActivityAt: new Date("2026-03-13T11:59:50.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:58:00.000Z"),
          durabilityState: "durable",
          durabilityDegradedReason: null,
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
          runPhase: "finalize",
          phaseEnteredAt: new Date("2026-03-13T11:59:20.000Z"),
          lastActivityAt: new Date("2026-03-13T11:59:50.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:58:00.000Z"),
          durabilityState: "durable",
          durabilityDegradedReason: null,
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
          runPhase: "finalize",
          phaseEnteredAt: new Date("2026-03-13T11:59:20.000Z"),
          lastActivityAt: new Date("2026-03-13T11:59:55.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:59:50.000Z"),
          durabilityState: "durable",
          durabilityDegradedReason: null,
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

  it("recommends stop-and-retry when durability has already degraded", () => {
    expect(
      assessRunConvergence(
        {
          status: "running",
          runPhase: "verify",
          phaseEnteredAt: new Date("2026-03-13T11:59:20.000Z"),
          lastActivityAt: new Date("2026-03-13T11:59:55.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:59:50.000Z"),
          durabilityState: "degraded",
          durabilityDegradedReason: "tool_result_persistence_failed",
          finalizationState: "not_started",
          abnormalEndClassification: null,
        },
        now,
        staleMs,
      ),
    ).toMatchObject({
      durabilityDegraded: true,
      recoveryRecommendation: "stop_and_retry",
      abnormalEndClassification: "recovery_required_persistence_failed",
    });
  });

  it("treats ask-phase runs as user-action-needed instead of reconnectable", () => {
    expect(
      assessRunConvergence(
        {
          status: "running",
          runPhase: "ask",
          phaseEnteredAt: new Date("2026-03-13T11:59:20.000Z"),
          lastActivityAt: new Date("2026-03-13T11:59:55.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:59:50.000Z"),
          durabilityState: "durable",
          durabilityDegradedReason: null,
          finalizationState: "not_started",
          abnormalEndClassification: null,
        },
        now,
        staleMs,
      ),
    ).toMatchObject({
      recoveryRecommendation: "stop_and_retry",
      noForwardDurableProgress: false,
    });
  });

  it("treats stale finalize-phase runs as bounded user action even with a fresh heartbeat", () => {
    expect(
      assessRunConvergence(
        {
          status: "running",
          runPhase: "finalize",
          phaseEnteredAt: new Date("2026-03-13T11:57:00.000Z"),
          lastActivityAt: new Date("2026-03-13T11:59:55.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:59:54.000Z"),
          durabilityState: "durable",
          durabilityDegradedReason: null,
          finalizationState: "in_progress",
          abnormalEndClassification: null,
        },
        now,
        staleMs,
      ),
    ).toMatchObject({
      phaseStale: true,
      recoveryRecommendation: "stop_and_retry",
      abnormalEndClassification: "finalization_failed",
    });
  });

  it("treats old phaseEnteredAt conservatively for legacy active rows outside finalize", () => {
    expect(
      assessRunConvergence(
        {
          status: "running",
          runPhase: "act",
          phaseEnteredAt: new Date("2026-03-13T11:00:00.000Z"),
          lastActivityAt: new Date("2026-03-13T11:59:55.000Z"),
          lastDurableProgressAt: new Date("2026-03-13T11:59:50.000Z"),
          durabilityState: "durable",
          durabilityDegradedReason: null,
          finalizationState: "not_started",
          abnormalEndClassification: null,
        },
        now,
        staleMs,
      ),
    ).toMatchObject({
      phaseStale: true,
      recoveryRecommendation: "reconnect",
      abnormalEndClassification: null,
    });
  });
});
