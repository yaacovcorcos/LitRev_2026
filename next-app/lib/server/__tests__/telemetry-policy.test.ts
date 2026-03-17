import { beforeEach, describe, expect, it } from "vitest";
import {
  __private__,
  assertAnonymousPerformanceMetricAllowed,
  assertAnonymousReliabilityMetricAllowed,
  assertAnonymousTelemetryRateLimit,
  TelemetryAnonymousNotAllowedError,
  TelemetryAnonymousRateLimitedError,
} from "@/lib/server/telemetry-policy";

describe("telemetry-policy", () => {
  beforeEach(() => {
    __private__.anonymousTelemetryBuckets.clear();
  });

  it("allows public auth reliability route-ready telemetry", () => {
    expect(() =>
      assertAnonymousReliabilityMetricAllowed({
        eventId: "evt-1",
        version: 1,
        type: "reliability.v1.route.ready",
        surface: "auth",
        clientTimestamp: "2026-03-17T12:00:00.000Z",
        dimensions: {
          viewport: "phone",
          network: "online",
          flags: {
            scrollOwnershipA1: null,
            streamReliabilityA2: null,
            mobileScrollLockV2: null,
          },
        },
        payload: {
          routeTemplate: "/login",
          state: "signin",
          layoutMode: null,
        },
      }),
    ).not.toThrow();
  });

  it("rejects anonymous reliability route-ready telemetry for non-public routes", () => {
    expect(() =>
      assertAnonymousReliabilityMetricAllowed({
        eventId: "evt-2",
        version: 1,
        type: "reliability.v1.route.ready",
        surface: "auth",
        clientTimestamp: "2026-03-17T12:00:00.000Z",
        dimensions: {
          viewport: "phone",
          network: "online",
          flags: {
            scrollOwnershipA1: null,
            streamReliabilityA2: null,
            mobileScrollLockV2: null,
          },
        },
        payload: {
          routeTemplate: "/ai",
          state: "signin",
          layoutMode: null,
        },
      }),
    ).toThrow(TelemetryAnonymousNotAllowedError);
  });

  it("allows public performance telemetry only for home and other routes", () => {
    expect(() =>
      assertAnonymousPerformanceMetricAllowed({
        eventId: "evt-3",
        version: 1,
        name: "LCP",
        value: 123,
        metricId: "metric-1",
        rating: "good",
        routeTemplate: "/other",
        surface: "other",
        projectId: null,
        clientTimestamp: "2026-03-17T12:00:00.000Z",
        dimensions: {
          viewport: "phone",
          network: "4g",
          online: true,
          synthetic: false,
          appVersion: null,
          commitSha: null,
        },
      }),
    ).not.toThrow();
  });

  it("rate limits anonymous telemetry after the configured threshold", () => {
    for (let index = 0; index < 120; index += 1) {
      assertAnonymousTelemetryRateLimit("203.0.113.77");
    }

    expect(() => assertAnonymousTelemetryRateLimit("203.0.113.77")).toThrow(
      TelemetryAnonymousRateLimitedError,
    );
  });
});
