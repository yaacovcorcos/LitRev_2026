import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), "..", relativePath), "utf8");
}

describe("GitHub workflow hardening", () => {
  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/browser-foundation.yml",
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

  it("keeps browser foundation on the canonical desktop-and-mobile command with diagnostics", () => {
    const workflow = readRepoFile(".github/workflows/browser-foundation.yml");

    expect(workflow).toMatch(/^name: Browser Foundation$/m);
    expect(workflow).toContain("npm run test:e2e:foundation");
    expect(workflow).not.toContain("npm run test:e2e:mobile:foundation");
    expect(workflow).toContain("name: browser-foundation-playwright-report");
    expect(workflow).toContain("path: next-app/playwright-report");
    for (const requiredPath of [
      '"next-app/lib/artifacts/**"',
      '"next-app/lib/project-data-events.ts"',
      '"next-app/lib/project-conversation*.ts"',
      '"next-app/prisma/**"',
    ]) {
      expect(workflow).toContain(requiredPath);
    }
  });

  it("keeps agent runtime and offline recovery in the canonical browser foundation", () => {
    const packageJson = JSON.parse(readRepoFile("next-app/package.json")) as {
      scripts: Record<string, string>;
    };
    const foundation = packageJson.scripts["test:e2e:foundation"];

    expect(foundation).toContain("agent-runtime-ui.spec.ts");
    expect(foundation).toContain("ai-offline-stream-smoke.spec.ts");
    expect(foundation).not.toContain("--project=");
  });

  it("enables dependency update coverage for npm and GitHub Actions", () => {
    const dependabot = readRepoFile(".github/dependabot.yml");

    expect(dependabot).toMatch(/package-ecosystem: "npm"[\s\S]*directory: "\/next-app"/);
    expect(dependabot).toMatch(/package-ecosystem: "github-actions"[\s\S]*directory: "\/"/);
  });
});
