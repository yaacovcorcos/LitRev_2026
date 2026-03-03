// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMobileMetrics,
  getMobileMetricEvents,
  recordMobileMetric,
} from "../telemetry";

describe("mobile telemetry", () => {
  beforeEach(() => {
    clearMobileMetrics();
  });

  it("records and retrieves metric events", () => {
    recordMobileMetric({
      type: "mobile_action_tap",
      surface: "ledger",
      payload: {
        route: "/project/abc/ledger",
        actionId: "triage_keep",
        targetMinPx: 44,
        inputMode: "touch",
      },
    });

    const events = getMobileMetricEvents();
    expect(events).toHaveLength(1);
    expect(events[0].version).toBe(1);
    expect(events[0].type).toBe("mobile_action_tap");
  });

  it("clears stored events", () => {
    recordMobileMetric({
      type: "mobile_drawer_opened",
      surface: "ai",
      payload: {
        route: "/ai",
        drawerId: "history",
        source: "button",
      },
    });

    clearMobileMetrics();
    expect(getMobileMetricEvents()).toHaveLength(0);
  });
});
