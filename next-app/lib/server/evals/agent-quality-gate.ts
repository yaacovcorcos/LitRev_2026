import {
  CHAT_UNIFICATION_BURN_IN_METRIC_TYPES,
  CHAT_UNIFICATION_BURN_IN_SURFACES,
} from "@/lib/ai/chat-unification-burn-in-contract";
import {
  DEFAULT_BURN_IN_THRESHOLDS,
  type BurnInThresholds,
} from "@/lib/ai/chat-unification-burn-in";
import { CHAT_STREAM_FIXTURES_V1, type ChatStreamFixture } from "@/lib/ai/stream-fixtures";
import {
  CORE_EVAL_SCENARIOS,
  assertUniqueScenarioIds,
  listSuites,
  parseEvalScenarioCatalog,
  type EvalScenario,
  type EvalSuite,
} from "@/lib/server/evals/scenario-catalog";
import { collectRuntimeSignals } from "@/lib/server/evals/runtime-signal-collector";
import { CHAT_UNIFICATION_METRIC_VERSION } from "@/types/chat-unification";

export type AgentQualityGateCheck = {
  id: string;
  passed: boolean;
  summary: string;
  details?: string[];
};

export type AgentQualityGateReport = {
  passed: boolean;
  failures: string[];
  checks: AgentQualityGateCheck[];
  observedRuntimeSignals: string[];
};

export const REQUIRED_AGENT_EVAL_SUITES = [
  "ask_user",
  "delegation",
  "runtime",
  "screening",
  "search",
] as const satisfies readonly EvalSuite[];

export const REQUIRED_RUNTIME_FIXTURE_SIGNALS = [
  "run_start",
  "run_end:completed",
  "run_end:paused",
  "run_end:failed",
  "run_end:cancelled",
  "stop_reason:cancelled",
  "stop_reason:max_iterations",
  "checkpoint",
  "artifact:plan",
  "tool_call:delegate_search",
  "tool_activity:search_pubmed",
  "tool_activity:search_openalex",
  "tool_result:search_pubmed",
  "user_input_required",
  "decision_request:pending",
  "error",
  "done",
] as const;

const ALLOWED_SEMANTIC_EXPECTED_SIGNALS = new Set([
  "decision",
  "rationale",
  "confidence",
]);

const RUNTIME_OBSERVABLE_EXACT_SIGNALS = new Set([
  "run_start",
  "done",
  "error",
  "checkpoint",
  "user_input_required",
  "decision_request",
]);

const RUNTIME_OBSERVABLE_SIGNAL_PREFIXES = [
  "tool_call:",
  "tool_result:",
  "tool_activity:",
  "run_end:",
  "stop_reason:",
  "decision_request:",
  "user_input_required:",
  "user_input_resolved:",
  "decision_resolution:",
  "artifact:",
  "artifact_status:",
  "error:",
] as const;

const REQUIRED_BURN_IN_MINIMUMS: Pick<
  BurnInThresholds,
  | "minCompletedRuns"
  | "minCompletedRunsPerSurface"
  | "minRetrySamplesOverall"
  | "minRetrySamplesPerSurface"
  | "minRetryMatchedOverall"
  | "minRetryMatchedPerSurface"
  | "minRetryEligibleOverall"
  | "minRetryEligiblePerSurface"
  | "minAskUserSamplesOverall"
  | "minAskUserSamplesPerSurface"
  | "retryContinuityRateMin"
  | "retryMatchRateMin"
  | "retryMatchRateMinPerSurface"
> = {
  minCompletedRuns: 200,
  minCompletedRunsPerSurface: 50,
  minRetrySamplesOverall: 30,
  minRetrySamplesPerSurface: 10,
  minRetryMatchedOverall: 30,
  minRetryMatchedPerSurface: 10,
  minRetryEligibleOverall: 30,
  minRetryEligiblePerSurface: 10,
  minAskUserSamplesOverall: 30,
  minAskUserSamplesPerSurface: 10,
  retryContinuityRateMin: 0.99,
  retryMatchRateMin: 0.95,
  retryMatchRateMinPerSurface: 0.9,
};

function missingValues(required: readonly string[], observed: Iterable<string>): string[] {
  const observedSet = new Set(observed);
  return required.filter((value) => !observedSet.has(value));
}

function isRuntimeObservableExpectedSignal(signal: string): boolean {
  return RUNTIME_OBSERVABLE_EXACT_SIGNALS.has(signal)
    || RUNTIME_OBSERVABLE_SIGNAL_PREFIXES.some((prefix) => signal.startsWith(prefix));
}

function collectFixtureSignals(fixtures: ChatStreamFixture[]): string[] {
  const signals = new Set<string>();
  for (const fixture of fixtures) {
    for (const signal of collectRuntimeSignals(fixture.chunks, {
      page: fixture.page,
      section: fixture.section,
    })) {
      signals.add(signal);
    }
  }
  return [...signals].sort();
}

function buildScenarioChecks(
  scenariosInput: EvalScenario[],
  observedRuntimeSignals: string[],
): AgentQualityGateCheck[] {
  const checks: AgentQualityGateCheck[] = [];
  let scenarios: EvalScenario[] = [];
  try {
    scenarios = parseEvalScenarioCatalog(scenariosInput);
    assertUniqueScenarioIds(scenarios);
    checks.push({
      id: "scenario-catalog-valid",
      passed: true,
      summary: `${scenarios.length} scenarios parse with globally unique ids.`,
    });
  } catch (error) {
    checks.push({
      id: "scenario-catalog-valid",
      passed: false,
      summary: "Scenario catalog is invalid.",
      details: [error instanceof Error ? error.message : String(error)],
    });
    return checks;
  }

  const suites = listSuites(scenarios);
  const missingSuites = missingValues(REQUIRED_AGENT_EVAL_SUITES, suites);
  checks.push({
    id: "scenario-suite-coverage",
    passed: missingSuites.length === 0,
    summary: missingSuites.length === 0
      ? `Required suites covered: ${REQUIRED_AGENT_EVAL_SUITES.join(", ")}.`
      : "Scenario catalog is missing required suites.",
    details: missingSuites.length ? missingSuites : undefined,
  });

  const expectedSignals = Array.from(new Set(scenarios.flatMap((scenario) => scenario.expectedSignals))).sort();
  const unknownSignals = expectedSignals.filter(
    (signal) => !isRuntimeObservableExpectedSignal(signal) && !ALLOWED_SEMANTIC_EXPECTED_SIGNALS.has(signal),
  );
  checks.push({
    id: "scenario-signal-vocabulary",
    passed: unknownSignals.length === 0,
    summary: unknownSignals.length === 0
      ? "Scenario expected signals use the runtime or allowed semantic vocabulary."
      : "Scenario catalog has unknown expected-signal names.",
    details: unknownSignals.length ? unknownSignals : undefined,
  });

  const runtimeExpectedSignals = expectedSignals.filter(isRuntimeObservableExpectedSignal);
  const missingRuntimeSignals = missingValues(runtimeExpectedSignals, observedRuntimeSignals);
  checks.push({
    id: "scenario-runtime-signal-fixtures",
    passed: missingRuntimeSignals.length === 0,
    summary: missingRuntimeSignals.length === 0
      ? "Every runtime-observable scenario signal is represented in deterministic fixtures."
      : "Some runtime-observable scenario signals are not covered by deterministic fixtures.",
    details: missingRuntimeSignals.length ? missingRuntimeSignals : undefined,
  });

  return checks;
}

function buildFixtureChecks(observedRuntimeSignals: string[]): AgentQualityGateCheck[] {
  const missingFixtureSignals = missingValues(REQUIRED_RUNTIME_FIXTURE_SIGNALS, observedRuntimeSignals);
  return [
    {
      id: "runtime-fixture-coverage",
      passed: missingFixtureSignals.length === 0,
      summary: missingFixtureSignals.length === 0
        ? "Deterministic fixtures cover the critical runtime signal families."
        : "Deterministic fixtures are missing critical runtime signal families.",
      details: missingFixtureSignals.length ? missingFixtureSignals : undefined,
    },
  ];
}

function buildBurnInChecks(thresholds: BurnInThresholds): AgentQualityGateCheck[] {
  const checks: AgentQualityGateCheck[] = [];
  const requiredMetricTypes = [
    "retry_model_continuity",
    "ask_user_context_mismatch",
    "stuck_running_tools_after_run_end",
    "run_end_observed",
  ];
  const missingMetricTypes = missingValues(requiredMetricTypes, CHAT_UNIFICATION_BURN_IN_METRIC_TYPES);
  const metricContractDetails = [
    ...missingMetricTypes.map((type) => `missing metric: ${type}`),
    ...(CHAT_UNIFICATION_METRIC_VERSION === 3 ? [] : [`unexpected metric version: ${CHAT_UNIFICATION_METRIC_VERSION}`]),
  ];
  checks.push({
    id: "burn-in-metric-contract",
    passed: missingMetricTypes.length === 0 && CHAT_UNIFICATION_METRIC_VERSION === 3,
    summary: missingMetricTypes.length === 0 && CHAT_UNIFICATION_METRIC_VERSION === 3
      ? "Burn-in validator uses the frozen v3 metric spine."
      : "Burn-in metric contract drifted from the frozen runtime sign-off spine.",
    details: metricContractDetails.length ? metricContractDetails : undefined,
  });

  const missingSurfaces = missingValues(["ai", "project"], CHAT_UNIFICATION_BURN_IN_SURFACES);
  checks.push({
    id: "burn-in-surface-contract",
    passed: missingSurfaces.length === 0,
    summary: missingSurfaces.length === 0
      ? "Burn-in still gates both ai and project surfaces."
      : "Burn-in no longer gates every required chat surface.",
    details: missingSurfaces.length ? missingSurfaces : undefined,
  });

  const weakenedThresholds = Object.entries(REQUIRED_BURN_IN_MINIMUMS)
    .filter(([key, minimum]) => thresholds[key as keyof typeof REQUIRED_BURN_IN_MINIMUMS] < minimum)
    .map(([key, minimum]) => `${key}: ${thresholds[key as keyof typeof REQUIRED_BURN_IN_MINIMUMS]} < ${minimum}`);
  if (thresholds.askUserMismatchRateMax !== 0) {
    weakenedThresholds.push(`askUserMismatchRateMax: ${thresholds.askUserMismatchRateMax} !== 0`);
  }
  if (thresholds.stuckRunningViolationRateMax !== 0) {
    weakenedThresholds.push(`stuckRunningViolationRateMax: ${thresholds.stuckRunningViolationRateMax} !== 0`);
  }
  checks.push({
    id: "burn-in-threshold-floor",
    passed: weakenedThresholds.length === 0,
    summary: weakenedThresholds.length === 0
      ? "Strict burn-in thresholds have not been weakened."
      : "Strict burn-in thresholds were weakened.",
    details: weakenedThresholds.length ? weakenedThresholds : undefined,
  });

  return checks;
}

export function evaluateAgentQualityGate(params?: {
  scenarios?: EvalScenario[];
  fixtures?: ChatStreamFixture[];
  burnInThresholds?: BurnInThresholds;
}): AgentQualityGateReport {
  const scenarios = params?.scenarios ?? CORE_EVAL_SCENARIOS;
  const fixtures = params?.fixtures ?? CHAT_STREAM_FIXTURES_V1;
  const thresholds = params?.burnInThresholds ?? DEFAULT_BURN_IN_THRESHOLDS;
  const observedRuntimeSignals = collectFixtureSignals(fixtures);

  const checks = [
    ...buildScenarioChecks(scenarios, observedRuntimeSignals),
    ...buildFixtureChecks(observedRuntimeSignals),
    ...buildBurnInChecks(thresholds),
  ];
  const failures = checks
    .filter((item) => !item.passed)
    .flatMap((item) => item.details?.length
      ? item.details.map((detail) => `${item.id}: ${detail}`)
      : [`${item.id}: ${item.summary}`]);

  return {
    passed: failures.length === 0,
    failures,
    checks,
    observedRuntimeSignals,
  };
}

export function formatAgentQualityGateReport(report: AgentQualityGateReport): string {
  const lines = [`Agent quality gate: ${report.passed ? "PASS" : "FAIL"}`];
  for (const item of report.checks) {
    lines.push(`- ${item.passed ? "PASS" : "FAIL"} ${item.id}: ${item.summary}`);
    if (!item.passed && item.details?.length) {
      for (const detail of item.details) {
        lines.push(`  - ${detail}`);
      }
    }
  }
  lines.push(`Observed runtime signal count: ${report.observedRuntimeSignals.length}`);
  return lines.join("\n");
}
