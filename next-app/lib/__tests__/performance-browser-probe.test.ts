import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BROWSER_PROBE_GLOBAL_KEY,
  getBrowserProbeInitScriptContent,
} from "@/lib/performance-browser-probe";

type ProbeWindow = {
  [BROWSER_PROBE_GLOBAL_KEY]?: {
    lcp: number | null;
    cls: number;
    inp: number | null;
  };
  addEventListener: ReturnType<typeof vi.fn>;
};

type ListenerMap = Map<string, Array<() => void>>;

class FakePerformanceObserver {
  static callbacks = new Map<string, (entryList: { getEntries: () => unknown[] }) => void>();

  constructor(
    private readonly callback: (entryList: { getEntries: () => unknown[] }) => void,
  ) {}

  observe(options: { type?: string }) {
    if (options.type) {
      FakePerformanceObserver.callbacks.set(options.type, this.callback);
    }
  }

  static reset() {
    FakePerformanceObserver.callbacks.clear();
  }

  static trigger(type: string, entries: unknown[]) {
    const callback = FakePerformanceObserver.callbacks.get(type);
    if (!callback) {
      throw new Error(`Missing observer for ${type}`);
    }
    callback({
      getEntries: () => entries,
    });
  }
}

function setupProbeEnvironment() {
  const listeners: ListenerMap = new Map();
  const frameQueue: Array<() => void> = [];
  let now = 0;

  const probeWindow: ProbeWindow = {
    addEventListener: vi.fn((type: string, listener: () => void) => {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    }),
  };

  const performanceStub = {
    now: vi.fn(() => {
      now += 16;
      return now;
    }),
  };

  const requestAnimationFrameStub = vi.fn((callback: () => void) => {
    frameQueue.push(callback);
    return frameQueue.length;
  });

  vi.stubGlobal("window", probeWindow);
  vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
  vi.stubGlobal("performance", performanceStub);
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrameStub);

  return {
    frameQueue,
    listeners,
    probeWindow,
    requestAnimationFrameStub,
  };
}

describe("performance-browser-probe", () => {
  beforeEach(() => {
    FakePerformanceObserver.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    FakePerformanceObserver.reset();
  });

  it("initializes probe state and captures observer-driven metrics", () => {
    const { listeners, probeWindow } = setupProbeEnvironment();

    new Function(getBrowserProbeInitScriptContent())();

    expect(probeWindow[BROWSER_PROBE_GLOBAL_KEY]).toEqual({
      lcp: null,
      cls: 0,
      inp: null,
    });
    expect(listeners.get("pointerdown")).toHaveLength(1);
    expect(listeners.get("keydown")).toHaveLength(1);

    FakePerformanceObserver.trigger("largest-contentful-paint", [{ startTime: 321.4 }]);
    FakePerformanceObserver.trigger("layout-shift", [
      { hadRecentInput: false, value: 0.03 },
      { hadRecentInput: true, value: 0.04 },
    ]);
    FakePerformanceObserver.trigger("event", [
      { duration: 24 },
      { duration: 58 },
    ]);

    expect(probeWindow[BROWSER_PROBE_GLOBAL_KEY]).toEqual({
      lcp: 321.4,
      cls: 0.03,
      inp: 58,
    });
  });

  it("captures paint-latency fallback from pointer interactions", () => {
    const { frameQueue, listeners, probeWindow, requestAnimationFrameStub } = setupProbeEnvironment();

    new Function(getBrowserProbeInitScriptContent())();

    const pointerListeners = listeners.get("pointerdown") ?? [];
    expect(pointerListeners).toHaveLength(1);

    pointerListeners[0]!();
    while (frameQueue.length > 0) {
      frameQueue.shift()?.();
    }

    expect(requestAnimationFrameStub).toHaveBeenCalledTimes(2);
    expect(probeWindow[BROWSER_PROBE_GLOBAL_KEY]?.inp).toBe(16);
  });
});
