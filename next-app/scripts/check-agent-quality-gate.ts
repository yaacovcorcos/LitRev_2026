import {
  evaluateAgentQualityGate,
  formatAgentQualityGateReport,
} from "../lib/server/evals/agent-quality-gate";

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

const report = evaluateAgentQualityGate();

if (parseArg("json") === "1") {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatAgentQualityGateReport(report));
}

if (!report.passed) {
  process.exitCode = 1;
}
