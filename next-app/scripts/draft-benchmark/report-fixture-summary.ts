import { summarizeDraftBenchmarkCorpus } from "@/lib/draft-benchmark/harness";

const report = summarizeDraftBenchmarkCorpus();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
