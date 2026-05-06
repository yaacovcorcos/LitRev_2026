import path from "path";
import { fileURLToPath } from "url";
import {
  evaluateAgentQualityGate,
  formatAgentQualityGateReport,
} from "../lib/server/evals/agent-quality-gate";

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
): number {
  const report = evaluateAgentQualityGate();
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
