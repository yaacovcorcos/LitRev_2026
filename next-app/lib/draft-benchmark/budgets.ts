export type DraftBenchmarkMetric =
  | "coldOpenMs"
  | "warmOpenMs"
  | "typingLatencyMs"
  | "commandOpenMs"
  | "citationSearchOpenMs"
  | "saveAckMs"
  | "recoverSuccessRate"
  | "anchorStabilityRate"
  | "importBlockingLossCount"
  | "browserSmokeFailureCount";

export type DraftBenchmarkScale = "short" | "medium" | "large" | "default";
export type DraftBenchmarkBlockingSlice =
  | "DAP-01"
  | "DAP-02"
  | "DAP-03A"
  | "DAP-04"
  | "DAP-05"
  | "DAP-06";

export type DraftBenchmarkBudget = {
  unit: "ms" | "ratio" | "count";
  direction: "max" | "min";
  thresholds: Partial<Record<DraftBenchmarkScale, number>>;
  blockingFor: DraftBenchmarkBlockingSlice[];
  description: string;
};

export const DRAFT_BENCHMARK_BUDGETS: Record<DraftBenchmarkMetric, DraftBenchmarkBudget> = {
  coldOpenMs: {
    unit: "ms",
    direction: "max",
    thresholds: {
      short: 1200,
      medium: 1800,
      large: 3000,
    },
    blockingFor: ["DAP-01"],
    description: "Cold editor boot for the benchmark manuscript scale.",
  },
  warmOpenMs: {
    unit: "ms",
    direction: "max",
    thresholds: {
      short: 600,
      medium: 900,
      large: 1500,
    },
    blockingFor: ["DAP-01"],
    description: "Warm re-open after prior draft initialization.",
  },
  typingLatencyMs: {
    unit: "ms",
    direction: "max",
    thresholds: {
      medium: 35,
      large: 60,
    },
    blockingFor: ["DAP-01", "DAP-02"],
    description: "Visible text-input latency under medium and large manuscript load.",
  },
  commandOpenMs: {
    unit: "ms",
    direction: "max",
    thresholds: {
      default: 120,
    },
    blockingFor: ["DAP-02"],
    description: "Command/slash surface open latency.",
  },
  citationSearchOpenMs: {
    unit: "ms",
    direction: "max",
    thresholds: {
      default: 250,
    },
    blockingFor: ["DAP-03A"],
    description: "Citation-search panel initial open latency.",
  },
  saveAckMs: {
    unit: "ms",
    direction: "max",
    thresholds: {
      default: 200,
    },
    blockingFor: ["DAP-01", "DAP-04"],
    description: "Time until the UI can truthfully acknowledge a local save.",
  },
  recoverSuccessRate: {
    unit: "ratio",
    direction: "min",
    thresholds: {
      default: 0.99,
    },
    blockingFor: ["DAP-04"],
    description: "Crash/reload recovery success rate.",
  },
  anchorStabilityRate: {
    unit: "ratio",
    direction: "min",
    thresholds: {
      default: 0.995,
    },
    blockingFor: ["DAP-05", "DAP-06"],
    description: "Comment/suggestion/AI anchor resolution success after structural edits.",
  },
  importBlockingLossCount: {
    unit: "count",
    direction: "max",
    thresholds: {
      default: 0,
    },
    blockingFor: ["DAP-03A"],
    description: "Count of silent or blocking import losses allowed in the harness.",
  },
  browserSmokeFailureCount: {
    unit: "count",
    direction: "max",
    thresholds: {
      default: 0,
    },
    blockingFor: ["DAP-01", "DAP-02"],
    description: "Cross-browser smoke failures allowed across Chromium, WebKit, and Firefox.",
  },
};

export const DRAFT_BENCHMARK_BLOCKING_METRICS = Object.entries(DRAFT_BENCHMARK_BUDGETS)
  .filter(([, budget]) => budget.blockingFor.length > 0)
  .map(([metric]) => metric as DraftBenchmarkMetric);
