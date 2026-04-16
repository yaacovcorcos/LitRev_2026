import fs from "node:fs/promises";
import path from "node:path";
import { evaluateDraftBenchmarkMeasurements, summarizeDraftBenchmarkGate, type DraftBenchmarkMeasurement } from "@/lib/draft-benchmark/harness";

type MeasurementFile = {
  recordedAt: string;
  measurements: DraftBenchmarkMeasurement[];
};

function defaultInputPath() {
  return path.join(process.cwd(), "test", "fixtures", "draft", "measurements", "sample-baseline.json");
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultInputPath();
  const raw = JSON.parse(await fs.readFile(inputPath, "utf8")) as Partial<MeasurementFile>;

  if (!Array.isArray(raw.measurements)) {
    throw new Error(`Measurement file ${inputPath} is missing a measurements array.`);
  }

  const results = evaluateDraftBenchmarkMeasurements(raw.measurements);
  const gate = summarizeDraftBenchmarkGate(results);
  process.stdout.write(
    `${JSON.stringify(
      {
        recordedAt: raw.recordedAt ?? null,
        inputPath,
        gate,
      },
      null,
      2,
    )}\n`,
  );

  if (!gate.passed) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error("Error running acceptance check:", error);
  process.exitCode = 1;
});
