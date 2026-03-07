import path from "node:path";
import { buildAiBundleReport } from "../lib/ai-bundle-report";

const nextAppRoot = path.resolve(process.cwd());
const report = buildAiBundleReport(nextAppRoot);

console.log(JSON.stringify(report, null, 2));
