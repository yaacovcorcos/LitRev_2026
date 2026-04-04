export const BROWSER_PROBE_GLOBAL_KEY = "__perfProbe" as const;

export type BrowserProbeMetrics = {
  lcp: number | null;
  cls: number;
  inp: number | null;
};

export type BrowserProbeWindow = Window & typeof globalThis & {
  [BROWSER_PROBE_GLOBAL_KEY]?: BrowserProbeMetrics;
};

const BROWSER_PROBE_INIT_SCRIPT = String.raw`(() => {
  const target = window;
  const ensureProbe = () => {
    if (!target.__perfProbe) {
      target.__perfProbe = {
        lcp: null,
        cls: 0,
        inp: null,
      };
    }
    return target.__perfProbe;
  };

  const probe = ensureProbe();

  try {
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        probe.lcp = lastEntry.startTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    probe.lcp = null;
  }

  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          probe.cls += entry.value ?? 0;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    probe.cls = 0;
  }

  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const duration = entry.duration ?? null;
        if (duration == null) continue;
        probe.inp = Math.max(probe.inp ?? 0, duration);
      }
    }).observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    });
  } catch {
    probe.inp = null;
  }

  const recordPaintLatency = () => {
    const start = performance.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const latency = performance.now() - start;
        probe.inp = Math.max(probe.inp ?? 0, latency);
      });
    });
  };

  window.addEventListener("pointerdown", recordPaintLatency, {
    capture: true,
    passive: true,
  });
  window.addEventListener("keydown", recordPaintLatency, {
    capture: true,
  });
})();`;

export function getBrowserProbeInitScriptContent(): string {
  return BROWSER_PROBE_INIT_SCRIPT;
}
