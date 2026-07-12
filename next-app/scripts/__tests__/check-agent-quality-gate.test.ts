import { describe, expect, it } from "vitest";

import {
  AGENT_QUALITY_RUNTIME_TEST_KILL_SIGNAL,
  AGENT_QUALITY_RUNTIME_TEST_MAX_BUFFER_BYTES,
  AGENT_QUALITY_RUNTIME_TEST_TIMEOUT_MS,
  executeDeterministicRuntimeScenarios,
  runAgentQualityGate,
  shouldOutputJson,
} from "../check-agent-quality-gate";
import { AGENT_QUALITY_SCENARIO_EXECUTION_GROUPS } from "../../lib/server/evals/agent-quality-gate";

function passingVitestJson({
  omitScenarioId,
}: {
  omitScenarioId?: string;
} = {}): string {
  return JSON.stringify({
    success: true,
    testResults: AGENT_QUALITY_SCENARIO_EXECUTION_GROUPS.map((group) => ({
      name: `/repo/next-app/${group.testPath}`,
      assertionResults: group.scenarioIds
        .filter((scenarioId) => scenarioId !== omitScenarioId)
        .map((scenarioId) => ({
          fullName: `runtime [${scenarioId}] executes its contract`,
          title: `[${scenarioId}] executes its contract`,
          status: "passed",
          failureMessages: [],
        })),
    })),
  });
}

function passingVitestJsonWithCombinedScenarioMarkers(
  firstScenarioId: string,
  secondScenarioId: string,
): string {
  const report = JSON.parse(passingVitestJson()) as {
    testResults: Array<{
      name: string;
      assertionResults: Array<{
        fullName: string;
        title: string;
        status: string;
        failureMessages: string[];
      }>;
    }>;
  };
  const result = report.testResults.find((candidate) => (
    candidate.assertionResults.some((assertion) => assertion.title.includes(`[${firstScenarioId}]`))
  ));
  if (!result) throw new Error(`Missing test result for ${firstScenarioId}`);
  result.assertionResults = result.assertionResults.filter((assertion) => (
    !assertion.title.includes(`[${firstScenarioId}]`)
    && !assertion.title.includes(`[${secondScenarioId}]`)
  ));
  const title = `[${firstScenarioId}] [${secondScenarioId}] combined proof`;
  result.assertionResults.push({
    fullName: `runtime ${title}`,
    title,
    status: "passed",
    failureMessages: [],
  });
  return JSON.stringify(report);
}

describe("check-agent-quality-gate CLI flags", () => {
  it("accepts standard boolean JSON flags", () => {
    expect(shouldOutputJson(["--json"])).toBe(true);
    expect(shouldOutputJson(["--json=true"])).toBe(true);
  });

  it("keeps compatibility with the previous json=1 flag", () => {
    expect(shouldOutputJson(["--json=1"])).toBe(true);
  });

  it("does not treat disabled or unrelated flags as JSON output", () => {
    expect(shouldOutputJson(["--json=false"])).toBe(false);
    expect(shouldOutputJson(["--json=0"])).toBe(false);
    expect(shouldOutputJson(["--other"])).toBe(false);
  });
});

describe("check-agent-quality-gate runtime execution", () => {
  it("executes the deterministic runtime test files through the local Vitest entrypoint", () => {
    const calls: Array<{
      command: string;
      args: string[];
      options: {
        timeout: number;
        killSignal: NodeJS.Signals;
        maxBuffer: number;
      };
    }> = [];
    const check = executeDeterministicRuntimeScenarios({
      cwd: "/repo/next-app",
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: passingVitestJson() };
      },
      fileExists: () => true,
    });

    expect(check).toEqual(expect.objectContaining({
      id: "runtime-scenario-execution",
      passed: true,
    }));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe(process.execPath);
    expect(calls[0]?.args).toContain("/repo/next-app/node_modules/vitest/vitest.mjs");
    expect(calls[0]?.args).toContain("lib/server/__tests__/eval-runtime-search-scenarios.test.ts");
    expect(calls[0]?.args).toContain("lib/server/__tests__/ai-service-run-finalization.test.ts");
    expect(calls[0]?.args).toContain("--reporter=json");
    expect(calls[0]?.options).toEqual(expect.objectContaining({
      timeout: AGENT_QUALITY_RUNTIME_TEST_TIMEOUT_MS,
      killSignal: AGENT_QUALITY_RUNTIME_TEST_KILL_SIGNAL,
      maxBuffer: AGENT_QUALITY_RUNTIME_TEST_MAX_BUFFER_BYTES,
    }));
  });

  it("fails the protected gate when runtime scenario execution fails even if static contracts pass", () => {
    const output: string[] = [];
    const exitCode = runAgentQualityGate(
      [],
      (message) => output.push(message),
      () => ({
        id: "runtime-scenario-execution",
        passed: false,
        summary: "Deterministic runtime scenario execution failed.",
        details: ["one runtime scenario failed"],
      }),
    );

    expect(exitCode).toBe(1);
    expect(output.join("\n")).toContain("Agent quality gate: FAIL");
    expect(output.join("\n")).toContain("one runtime scenario failed");
  });

  it("keeps the assertion diagnostic when noisy runtime logs follow a failed scenario", () => {
    const check = executeDeterministicRuntimeScenarios({
      cwd: "/repo/next-app",
      spawn: () => ({
        status: 1,
        stderr: "FAIL runtime scenario\nAssertionError: expected completed to be failed\n",
        stdout: Array.from({ length: 50 }, (_, index) => `noise ${index}`).join("\n"),
      }),
      fileExists: () => true,
    });

    expect(check.passed).toBe(false);
    expect(check.details).toContain("AssertionError: expected completed to be failed");
  });

  it("fails before spawning when a matrix test file is missing", () => {
    let spawned = false;
    const check = executeDeterministicRuntimeScenarios({
      cwd: "/repo/next-app",
      spawn: () => {
        spawned = true;
        return { status: 0 };
      },
      fileExists: (filename) => !filename.endsWith("ask-user-tool.test.ts"),
    });

    expect(check.passed).toBe(false);
    expect(check.details).toContain(
      "missing deterministic test file: lib/server/__tests__/ask-user-tool.test.ts",
    );
    expect(spawned).toBe(false);
  });

  it("fails when green test files do not execute the exact named catalog scenario", () => {
    const check = executeDeterministicRuntimeScenarios({
      cwd: "/repo/next-app",
      spawn: () => ({
        status: 0,
        stdout: passingVitestJson({ omitScenarioId: "runtime-no-answer-failure-truth" }),
      }),
      fileExists: () => true,
    });

    expect(check.passed).toBe(false);
    expect(check.details).toContain(
      "missing named scenario execution: runtime-no-answer-failure-truth (lib/server/__tests__/ai-service-run-finalization.test.ts)",
    );
  });

  it("does not let one passing test with multiple recognized markers prove multiple scenarios", () => {
    const check = executeDeterministicRuntimeScenarios({
      cwd: "/repo/next-app",
      spawn: () => ({
        status: 0,
        stdout: passingVitestJsonWithCombinedScenarioMarkers(
          "runtime-cancelled-terminal-truth",
          "runtime-no-answer-failure-truth",
        ),
      }),
      fileExists: () => true,
    });

    expect(check.passed).toBe(false);
    expect(check.details).toContain(
      "one passing test cannot prove multiple scenarios: runtime [runtime-cancelled-terminal-truth] [runtime-no-answer-failure-truth] combined proof (runtime-cancelled-terminal-truth, runtime-no-answer-failure-truth)",
    );
    expect(check.details).toContain(
      "missing named scenario execution: runtime-cancelled-terminal-truth (lib/server/__tests__/ai-service-run-finalization.test.ts)",
    );
    expect(check.details).toContain(
      "missing named scenario execution: runtime-no-answer-failure-truth (lib/server/__tests__/ai-service-run-finalization.test.ts)",
    );
  });

  it("reports an explicit bounded-timeout failure", () => {
    const timeoutError = Object.assign(new Error("spawnSync timed out"), { code: "ETIMEDOUT" });
    const check = executeDeterministicRuntimeScenarios({
      cwd: "/repo/next-app",
      spawn: () => ({
        status: null,
        signal: AGENT_QUALITY_RUNTIME_TEST_KILL_SIGNAL,
        error: timeoutError,
      }),
      fileExists: () => true,
    });

    expect(check).toEqual({
      id: "runtime-scenario-execution",
      passed: false,
      summary: "Deterministic runtime scenario execution timed out.",
      details: [
        `Vitest exceeded ${AGENT_QUALITY_RUNTIME_TEST_TIMEOUT_MS}ms and was killed with ${AGENT_QUALITY_RUNTIME_TEST_KILL_SIGNAL}.`,
      ],
    });
  });

  it("reports a bounded-output failure when Vitest exceeds maxBuffer", () => {
    const outputError = Object.assign(new Error("spawnSync maxBuffer exceeded"), { code: "ENOBUFS" });
    const check = executeDeterministicRuntimeScenarios({
      cwd: "/repo/next-app",
      spawn: () => ({
        status: null,
        error: outputError,
      }),
      fileExists: () => true,
    });

    expect(check).toEqual({
      id: "runtime-scenario-execution",
      passed: false,
      summary: "Deterministic runtime scenario output exceeded the capture limit.",
      details: [
        `Vitest exceeded the ${AGENT_QUALITY_RUNTIME_TEST_MAX_BUFFER_BYTES}-byte output limit and was terminated.`,
      ],
    });
  });
});
