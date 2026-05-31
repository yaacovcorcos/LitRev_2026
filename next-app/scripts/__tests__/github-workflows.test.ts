import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), "..", relativePath), "utf8");
}

describe("GitHub workflow hardening", () => {
  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/mobile-smoke.yml",
    ".github/workflows/perf-nightly.yml",
  ])("%s has explicit read-only default permissions", (workflowPath) => {
    const content = readRepoFile(workflowPath);

    expect(content).toMatch(/^permissions:\n  contents: read$/m);
  });

  it("keeps the nightly report workflow subscribed to the producing workflow name", () => {
    const producer = readRepoFile(".github/workflows/perf-nightly.yml");
    const report = readRepoFile(".github/workflows/perf-nightly-report.yml");

    expect(producer).toMatch(/^name: Performance Certification$/m);
    expect(report).toMatch(/^name: Performance Certification Report$/m);
    expect(report).toMatch(/^permissions:\n  actions: read\n  contents: read$/m);
    expect(report).toContain('workflows: ["Performance Certification"]');
    expect(report).not.toContain('workflows: ["Performance Nightly"]');
  });

  it("enables dependency update coverage for npm and GitHub Actions", () => {
    const dependabot = readRepoFile(".github/dependabot.yml");

    expect(dependabot).toMatch(/package-ecosystem: "npm"[\s\S]*directory: "\/next-app"/);
    expect(dependabot).toMatch(/package-ecosystem: "github-actions"[\s\S]*directory: "\/"/);
  });
});
