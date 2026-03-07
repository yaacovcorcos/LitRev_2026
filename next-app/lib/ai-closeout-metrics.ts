export type ThresholdRule = {
  minPercent: number;
  minAbsolute: number;
};

export type AiCloseoutThresholds = {
  bundleBytes: ThresholdRule;
  composerReadyMs: ThresholdRule;
  timelineReadyMs: ThresholdRule;
};

export type AiScenarioCapture = {
  composerReadyMs?: number | null;
  timelineReadyMs?: number | null;
  routeMarkerComposerReadyMs?: number | null;
  routeMarkerTimelineReadyMs?: number | null;
  activeConversationId?: string | null;
  visibleItems?: number | null;
  hiddenItems?: number | null;
  totalItems?: number | null;
};

export type AiCaptureReport = {
  label: string;
  commit: string;
  appRoot: string;
  bundle: {
    chunkCount: number;
    totalBytes: number;
  };
  scenarios: {
    empty: AiScenarioCapture;
    populated: AiScenarioCapture;
  };
};

export type ImprovementCheck = {
  baseline: number;
  head: number;
  delta: number;
  percentDelta: number;
  absoluteThreshold: number;
  percentThreshold: number;
  passed: boolean;
};

export type AiCloseoutEvaluation = {
  bundleBytes: ImprovementCheck;
  composerReadyMs: ImprovementCheck;
  timelineReadyMs: ImprovementCheck;
  passed: boolean;
};

export const AI_CLOSEOUT_THRESHOLDS: AiCloseoutThresholds = {
  bundleBytes: {
    minPercent: 5,
    minAbsolute: 50 * 1024,
  },
  composerReadyMs: {
    minPercent: 10,
    minAbsolute: 75,
  },
  timelineReadyMs: {
    minPercent: 15,
    minAbsolute: 150,
  },
};

export function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error("median() requires at least one value.");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return sorted[middle];
}

function buildImprovementCheck(
  baseline: number,
  head: number,
  threshold: ThresholdRule,
): ImprovementCheck {
  if (!(baseline > 0) || !(head >= 0)) {
    throw new Error(`Invalid closeout comparison values: baseline=${baseline}, head=${head}`);
  }
  const delta = baseline - head;
  const percentDelta = (delta / baseline) * 100;
  const passed = delta >= threshold.minAbsolute && percentDelta >= threshold.minPercent;
  return {
    baseline,
    head,
    delta,
    percentDelta,
    absoluteThreshold: threshold.minAbsolute,
    percentThreshold: threshold.minPercent,
    passed,
  };
}

function requireMetric(value: number | null | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Missing ${label} metric in AI closeout capture.`);
  }
  return value;
}

export function evaluateAiCloseout(
  baseline: AiCaptureReport,
  head: AiCaptureReport,
  thresholds: AiCloseoutThresholds = AI_CLOSEOUT_THRESHOLDS,
): AiCloseoutEvaluation {
  const bundleBytes = buildImprovementCheck(
    baseline.bundle.totalBytes,
    head.bundle.totalBytes,
    thresholds.bundleBytes,
  );
  const composerReadyMs = buildImprovementCheck(
    requireMetric(baseline.scenarios.empty.composerReadyMs, "baseline empty composerReadyMs"),
    requireMetric(head.scenarios.empty.composerReadyMs, "head empty composerReadyMs"),
    thresholds.composerReadyMs,
  );
  const timelineReadyMs = buildImprovementCheck(
    requireMetric(baseline.scenarios.populated.timelineReadyMs, "baseline populated timelineReadyMs"),
    requireMetric(head.scenarios.populated.timelineReadyMs, "head populated timelineReadyMs"),
    thresholds.timelineReadyMs,
  );

  return {
    bundleBytes,
    composerReadyMs,
    timelineReadyMs,
    passed: bundleBytes.passed && composerReadyMs.passed && timelineReadyMs.passed,
  };
}
