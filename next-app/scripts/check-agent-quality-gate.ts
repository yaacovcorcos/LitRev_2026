import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AGENT_QUALITY_SCENARIO_EXECUTION_GROUPS,
  evaluateAgentQualityGate,
  formatAgentQualityGateReport,
  type AgentQualityGateCheck,
  type AgentQualityGateReport,
} from "../lib/server/evals/agent-quality-gate";

type SpawnResult = {
  status: number | null;
  stdout?: string | Buffer | null;
  stderr?: string | Buffer | null;
  signal?: NodeJS.Signals | null;
  error?: NodeJS.ErrnoException;
};

type SpawnRuntimeTests = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    encoding: "utf8";
    env: NodeJS.ProcessEnv;
    timeout: number;
    killSignal: NodeJS.Signals;
    maxBuffer: number;
  },
) => SpawnResult;

type VitestJsonAssertion = {
  fullName?: string;
  title?: string;
  status?: string;
  failureMessages?: string[];
};

type VitestJsonTestResult = {
  name?: string;
  assertionResults?: VitestJsonAssertion[];
};

type VitestJsonReport = {
  success?: boolean;
  testResults?: VitestJsonTestResult[];
};

const NEXT_APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const AGENT_QUALITY_RUNTIME_TEST_TIMEOUT_MS = 60_000;
export const AGENT_QUALITY_RUNTIME_TEST_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
export const AGENT_QUALITY_RUNTIME_TEST_KILL_SIGNAL: NodeJS.Signals = "SIGKILL";

function conciseFailureOutput(result: SpawnResult): string[] {
  const output = [result.stderr, result.stdout]
    .filter((value): value is string | Buffer => Boolean(value))
    .map((value) => value.toString())
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const diagnosticLines = output.filter((line) => (
    /(?:FAIL|[A-Za-z]*Error:|Test Files|Tests\s+\d|expected|received|\u2192)/i.test(line)
  ));
  return [...new Set([
    ...diagnosticLines.slice(0, 20),
    ...output.slice(-10),
  ])].slice(0, 30);
}

function parseVitestJsonReport(result: SpawnResult): VitestJsonReport | null {
  if (!result.stdout) return null;
  try {
    const parsed = JSON.parse(result.stdout.toString()) as VitestJsonReport;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function failedVitestAssertions(report: VitestJsonReport): string[] {
  return (report.testResults ?? []).flatMap((testResult) => (
    (testResult.assertionResults ?? [])
      .filter((assertion) => assertion.status === "failed")
      .map((assertion) => {
        const message = assertion.failureMessages?.[0]
          ?.split(/\r?\n/)
          .slice(0, 4)
          .join(" ");
        return `${assertion.fullName ?? assertion.title ?? "unnamed scenario"}${message ? `: ${message}` : ""}`;
      })
  )).slice(0, 20);
}

function resolveVitestTestPath(filename: string, cwd: string): string {
  return path.resolve(path.isAbsolute(filename) ? filename : path.join(cwd, filename));
}

function recognizedScenarioMarkers(
  assertion: VitestJsonAssertion,
  recognizedScenarioIds: ReadonlySet<string>,
): string[] {
  const testName = assertion.title ?? assertion.fullName ?? "";
  const markers = Array.from(testName.matchAll(/\[([^\[\]]+)]/g), (match) => match[1]?.trim() ?? "");
  return [...new Set(markers.filter((marker) => recognizedScenarioIds.has(marker)))];
}

function validateNamedScenarioExecutions(report: VitestJsonReport, cwd: string): string[] {
  const details: string[] = [];
  const recognizedScenarioIds = new Set(
    AGENT_QUALITY_SCENARIO_EXECUTION_GROUPS.flatMap((group) => group.scenarioIds),
  );

  for (const testResult of report.testResults ?? []) {
    for (const assertion of testResult.assertionResults ?? []) {
      const markers = recognizedScenarioMarkers(assertion, recognizedScenarioIds);
      if (assertion.status === "passed" && markers.length > 1) {
        details.push(
          `one passing test cannot prove multiple scenarios: ${assertion.fullName ?? assertion.title ?? "unnamed test"} (${markers.join(", ")})`,
        );
      }
    }
  }

  for (const group of AGENT_QUALITY_SCENARIO_EXECUTION_GROUPS) {
    const expectedTestPath = path.resolve(cwd, group.testPath);
    const fileResults = (report.testResults ?? []).filter((testResult) => (
      typeof testResult.name === "string" && resolveVitestTestPath(testResult.name, cwd) === expectedTestPath
    ));
    for (const scenarioId of group.scenarioIds) {
      const matches = fileResults.flatMap((testResult) => (
        (testResult.assertionResults ?? []).filter((assertion) => {
          const markers = recognizedScenarioMarkers(assertion, recognizedScenarioIds);
          return markers.length === 1 && markers[0] === scenarioId;
        })
      ));
      if (matches.length === 0) {
        details.push(`missing named scenario execution: ${scenarioId} (${group.testPath})`);
        continue;
      }
      if (matches.length > 1) {
        details.push(`duplicate named scenario execution: ${scenarioId} (${matches.length})`);
        continue;
      }
      if (matches[0]?.status !== "passed") {
        details.push(`named scenario did not pass: ${scenarioId} (${matches[0]?.status ?? "unknown"})`);
      }
    }
  }
  return details;
}

export function executeDeterministicRuntimeScenarios({
  cwd = NEXT_APP_ROOT,
  spawn = spawnSync as SpawnRuntimeTests,
  env = process.env,
  fileExists = fs.existsSync,
}: {
  cwd?: string;
  spawn?: SpawnRuntimeTests;
  env?: NodeJS.ProcessEnv;
  fileExists?: (filename: string) => boolean;
} = {}): AgentQualityGateCheck {
  const testFiles = Array.from(new Set(
    AGENT_QUALITY_SCENARIO_EXECUTION_GROUPS.map((group) => group.testPath),
  ));
  const scenarioCount = AGENT_QUALITY_SCENARIO_EXECUTION_GROUPS
    .reduce((count, group) => count + group.scenarioIds.length, 0);
  const missingTestFiles = testFiles.filter((testPath) => !fileExists(path.join(cwd, testPath)));
  if (missingTestFiles.length > 0) {
    return {
      id: "runtime-scenario-execution",
      passed: false,
      summary: "Deterministic runtime scenario execution files are missing.",
      details: missingTestFiles.map((testPath) => `missing deterministic test file: ${testPath}`),
    };
  }
  const vitestEntrypoint = path.join(cwd, "node_modules", "vitest", "vitest.mjs");
  const result = spawn(
    process.execPath,
    [vitestEntrypoint, "run", ...testFiles, "--reporter=json", "--silent"],
    {
      cwd,
      encoding: "utf8",
      env,
      timeout: AGENT_QUALITY_RUNTIME_TEST_TIMEOUT_MS,
      killSignal: AGENT_QUALITY_RUNTIME_TEST_KILL_SIGNAL,
      maxBuffer: AGENT_QUALITY_RUNTIME_TEST_MAX_BUFFER_BYTES,
    },
  );

  if (result.error?.code === "ETIMEDOUT") {
    return {
      id: "runtime-scenario-execution",
      passed: false,
      summary: "Deterministic runtime scenario execution timed out.",
      details: [
        `Vitest exceeded ${AGENT_QUALITY_RUNTIME_TEST_TIMEOUT_MS}ms and was killed with ${AGENT_QUALITY_RUNTIME_TEST_KILL_SIGNAL}.`,
      ],
    };
  }

  if (result.error?.code === "ENOBUFS") {
    return {
      id: "runtime-scenario-execution",
      passed: false,
      summary: "Deterministic runtime scenario output exceeded the capture limit.",
      details: [
        `Vitest exceeded the ${AGENT_QUALITY_RUNTIME_TEST_MAX_BUFFER_BYTES}-byte output limit and was terminated.`,
      ],
    };
  }

  const vitestReport = parseVitestJsonReport(result);

  if (result.status === 0 && vitestReport?.success === true) {
    const executionDetails = validateNamedScenarioExecutions(vitestReport, cwd);
    if (executionDetails.length > 0) {
      return {
        id: "runtime-scenario-execution",
        passed: false,
        summary: "Deterministic runtime tests passed, but the named scenario execution contract is incomplete.",
        details: executionDetails,
      };
    }
    return {
      id: "runtime-scenario-execution",
      passed: true,
      summary: `${scenarioCount} catalog scenarios are backed by ${testFiles.length} deterministic runtime test files, and the executable lane passed.`,
    };
  }

  const details = [
    ...(result.error ? [result.error.message] : []),
    ...(vitestReport ? failedVitestAssertions(vitestReport) : conciseFailureOutput(result)),
  ];
  return {
    id: "runtime-scenario-execution",
    passed: false,
    summary: "Deterministic runtime scenario execution failed.",
    details: details.length ? details : [`Vitest exited with status ${String(result.status)}.`],
  };
}

function prependRuntimeExecutionCheck(
  report: AgentQualityGateReport,
  runtimeCheck: AgentQualityGateCheck,
): AgentQualityGateReport {
  const runtimeFailures = runtimeCheck.passed
    ? []
    : runtimeCheck.details?.length
      ? runtimeCheck.details.map((detail) => `${runtimeCheck.id}: ${detail}`)
      : [`${runtimeCheck.id}: ${runtimeCheck.summary}`];

  return {
    ...report,
    passed: runtimeCheck.passed && report.passed,
    failures: [...runtimeFailures, ...report.failures],
    checks: [runtimeCheck, ...report.checks],
  };
}

export function shouldOutputJson(argv: readonly string[]): boolean {
  return argv.some((value) => {
    if (value === "--json") return true;
    const prefix = "--json=";
    if (!value.startsWith(prefix)) return false;
    const raw = value.slice(prefix.length).trim().toLowerCase();
    return raw === "1" || raw === "true";
  });
}

export function runAgentQualityGate(
  argv = process.argv.slice(2),
  write: (message: string) => void = console.log,
  executeRuntimeScenarios: () => AgentQualityGateCheck = executeDeterministicRuntimeScenarios,
): number {
  const report = prependRuntimeExecutionCheck(
    evaluateAgentQualityGate(),
    executeRuntimeScenarios(),
  );
  if (shouldOutputJson(argv)) {
    write(JSON.stringify(report, null, 2));
  } else {
    write(formatAgentQualityGateReport(report));
  }

  return report.passed ? 0 : 1;
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  process.exitCode = runAgentQualityGate();
}
