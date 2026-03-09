// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  recordFoundationRouteFlowCompleted,
  useFoundationRouteReady,
} from "@/lib/mobile/foundation-reliability";

const recordReliabilityMetric = vi.fn();

vi.mock("@/lib/ai/reliability-telemetry", () => ({
  recordReliabilityMetric: (...args: unknown[]) => recordReliabilityMetric(...args),
}));

function RouteReadyProbe(props: {
  enabled?: boolean;
  routeTemplate: "/" | "/login";
  state: "loading" | "workspace";
}) {
  useFoundationRouteReady({
    enabled: props.enabled,
    routeTemplate: props.routeTemplate,
    surface: props.routeTemplate === "/" ? "home" : "auth",
    state: props.state,
  });
  return null;
}

describe("foundation reliability helpers", () => {
  beforeEach(() => {
    recordReliabilityMetric.mockReset();
  });

  it("records route readiness once per state key", () => {
    const { rerender } = render(<RouteReadyProbe routeTemplate="/" state="loading" />);

    expect(recordReliabilityMetric).toHaveBeenCalledTimes(1);
    rerender(<RouteReadyProbe routeTemplate="/" state="loading" />);
    expect(recordReliabilityMetric).toHaveBeenCalledTimes(1);

    rerender(<RouteReadyProbe routeTemplate="/" state="workspace" />);
    expect(recordReliabilityMetric).toHaveBeenCalledTimes(2);
  });

  it("records flow completion with route metadata", () => {
    recordFoundationRouteFlowCompleted({
      routeTemplate: "/login",
      surface: "auth",
      flow: "magic_link_requested",
    });

    expect(recordReliabilityMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "reliability.v1.route.flow_completed",
        surface: "auth",
        payload: {
          routeTemplate: "/login",
          flow: "magic_link_requested",
          layoutMode: null,
        },
      }),
    );
  });
});
