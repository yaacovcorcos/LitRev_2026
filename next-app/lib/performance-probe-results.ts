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

function sortNumbers(values: number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

function roundMetric(metricName: ProbeMetricName, value: number): number {
  if (metricName === "CLS") {
    return Number(value.toFixed(3));
  }
  return Math.round(value);
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

  for (const sample of samples) {
    if (!routes[sample.routeTemplate]) {
      routes[sample.routeTemplate] = {};
    }

    const profileBucket = routes[sample.routeTemplate]![sample.profile] ?? {
      samples: 0,
      p75: {
        LCP: 0,
        INP: 0,
        CLS: 0,
        TTFB: 0,
      },
    };

    routes[sample.routeTemplate]![sample.profile] = profileBucket;
  }

  for (const [routeTemplate, profileBuckets] of Object.entries(routes)) {
    for (const profile of Object.keys(profileBuckets)) {
      const matchingSamples = samples.filter(
        (sample) => sample.routeTemplate === routeTemplate && sample.profile === profile,
      );

      profileBuckets[profile] = {
        samples: matchingSamples.length,
        p75: {
          LCP: roundMetric("LCP", percentile75(matchingSamples.map((sample) => sample.metrics.LCP))),
          INP: roundMetric("INP", percentile75(matchingSamples.map((sample) => sample.metrics.INP))),
          CLS: roundMetric("CLS", percentile75(matchingSamples.map((sample) => sample.metrics.CLS))),
          TTFB: roundMetric("TTFB", percentile75(matchingSamples.map((sample) => sample.metrics.TTFB))),
        },
      };
    }
  }

  return {
    capturedAt,
    commit,
    source,
    runId,
    metadata: {
      sampleCount: samples.length,
      routeProfileSampleCounts: samples.reduce<Record<string, number>>((acc, sample) => {
        const key = `${sample.routeTemplate}:${sample.profile}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
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
