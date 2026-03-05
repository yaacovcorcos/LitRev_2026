import type { PerformanceRouteTemplate } from "@/types/performance-telemetry";

export const PROBE_METRIC_NAMES = ["LCP", "INP", "CLS", "TTFB"] as const;
export type ProbeMetricName = (typeof PROBE_METRIC_NAMES)[number];

export const SUPPORTED_PROBE_PROFILES = ["desktop-normal", "mobile-mid"] as const;
export type ProbeProfile = (typeof SUPPORTED_PROBE_PROFILES)[number];

export type ProbeSample = {
  routeTemplate: PerformanceRouteTemplate;
  profile: ProbeProfile;
  metrics: Record<ProbeMetricName, number>;
};

type ProbeArtifactArgs = {
  capturedAt: string;
  commit: string;
  source: string;
  runId: string;
  samples: ProbeSample[];
};

type MetricBuckets = Record<ProbeMetricName, number[]>;

type RouteProfileAggregate = {
  routeTemplate: PerformanceRouteTemplate;
  profile: ProbeProfile;
  metrics: MetricBuckets;
};

function sortNumbers(values: number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

function roundMetric(metricName: ProbeMetricName, value: number): number {
  if (metricName === "CLS") {
    return Number(value.toFixed(3));
  }
  return Math.round(value);
}

function createMetricBuckets(): MetricBuckets {
  return {
    LCP: [],
    INP: [],
    CLS: [],
    TTFB: [],
  };
}

export function percentile75(values: number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute p75 from an empty sample set.");
  }

  const sorted = sortNumbers(values);
  const index = Math.max(0, Math.ceil(sorted.length * 0.75) - 1);
  return sorted[index] ?? sorted[sorted.length - 1]!;
}

export function buildProbeResultsArtifact({
  capturedAt,
  commit,
  source,
  runId,
  samples,
}: ProbeArtifactArgs) {
  const routes: Record<string, Record<string, { samples: number; p75: Record<ProbeMetricName, number> }>> = {};
  const routeProfileSampleCounts: Record<string, number> = {};
  const aggregates = new Map<string, RouteProfileAggregate>();

  for (const sample of samples) {
    const key = `${sample.routeTemplate}:${sample.profile}`;
    routeProfileSampleCounts[key] = (routeProfileSampleCounts[key] ?? 0) + 1;

    const aggregate = aggregates.get(key) ?? {
      routeTemplate: sample.routeTemplate,
      profile: sample.profile,
      metrics: createMetricBuckets(),
    };

    for (const metricName of PROBE_METRIC_NAMES) {
      aggregate.metrics[metricName].push(sample.metrics[metricName]);
    }

    aggregates.set(key, aggregate);
  }

  for (const aggregate of aggregates.values()) {
    if (!routes[aggregate.routeTemplate]) {
      routes[aggregate.routeTemplate] = {};
    }

    const routeProfileKey = `${aggregate.routeTemplate}:${aggregate.profile}`;
    routes[aggregate.routeTemplate]![aggregate.profile] = {
      samples: routeProfileSampleCounts[routeProfileKey] ?? 0,
      p75: {
        LCP: roundMetric("LCP", percentile75(aggregate.metrics.LCP)),
        INP: roundMetric("INP", percentile75(aggregate.metrics.INP)),
        CLS: roundMetric("CLS", percentile75(aggregate.metrics.CLS)),
        TTFB: roundMetric("TTFB", percentile75(aggregate.metrics.TTFB)),
      },
    };
  }

  return {
    capturedAt,
    commit,
    source,
    runId,
    metadata: {
      sampleCount: samples.length,
      routeProfileSampleCounts,
    },
    routes,
  };
}

export function findCoverageIssues(args: {
  results: ReturnType<typeof buildProbeResultsArtifact>;
  mandatoryRoutes: string[];
  mandatoryProfiles: string[];
  minSamples: number;
}) {
  const issues: string[] = [];

  for (const routeTemplate of args.mandatoryRoutes) {
    for (const profile of args.mandatoryProfiles) {
      const entry = args.results.routes[routeTemplate]?.[profile];
      if (!entry) {
        issues.push(`[missing-route-profile] ${routeTemplate} ${profile}`);
        continue;
      }

      if (entry.samples < args.minSamples) {
        issues.push(
          `[insufficient-sample] ${routeTemplate} ${profile}: samples=${entry.samples}, required=${args.minSamples}`,
        );
      }

      for (const metricName of PROBE_METRIC_NAMES) {
        const metricValue = entry.p75[metricName];
        if (!Number.isFinite(metricValue)) {
          issues.push(`[missing-metric] ${routeTemplate} ${profile} ${metricName}`);
        }
      }
    }
  }

  return issues;
}
