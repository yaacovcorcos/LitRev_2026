// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMobileMetrics,
  getMobileMetricEvents,
  isMobileTelemetryContext,
  recordMobileMetric,
} from "../telemetry";
import { COARSE_POINTER_MEDIA_QUERY } from "../breakpoints";

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

  it("detects mobile telemetry context from phone-width viewport or coarse pointer", () => {
    const originalMatchMedia = window.matchMedia;
    const originalInnerWidth = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", {
        value: 430,
        configurable: true,
      });
      window.matchMedia = ((query: string) => ({
        matches: query === COARSE_POINTER_MEDIA_QUERY,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;

      expect(isMobileTelemetryContext()).toBe(true);
    } finally {
      window.matchMedia = originalMatchMedia;
      Object.defineProperty(window, "innerWidth", {
        value: originalInnerWidth,
        configurable: true,
      });
    }
  });
});
