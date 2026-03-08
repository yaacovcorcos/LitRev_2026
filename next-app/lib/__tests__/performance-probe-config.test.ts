import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createPerformanceArtifactRoots,
  parseAllowList,
  resolvePathWithinRoots,
  validatePerformanceProbeBaseUrl,
} from "@/lib/performance-probe-config";

describe("performance-probe-config", () => {
  it("normalizes loopback probe URLs to their origin", () => {
    expect(validatePerformanceProbeBaseUrl("http://127.0.0.1:3201/probe")).toBe("http://127.0.0.1:3201");
    expect(validatePerformanceProbeBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("rejects non-loopback probe URLs unless explicitly allowlisted", () => {
    expect(() => validatePerformanceProbeBaseUrl("https://example.com")).toThrow(
      /host must be loopback or explicitly allowlisted/,
    );
    expect(
      validatePerformanceProbeBaseUrl("https://preview.example.com", {
        allowedOrigins: ["https://preview.example.com"],
      }),
    ).toBe("https://preview.example.com");
  });

  it("rejects probe URLs with credentials, query strings, or fragments", () => {
    expect(() => validatePerformanceProbeBaseUrl("http://user:pass@127.0.0.1:3201")).toThrow(
      /credentials are not allowed/,
    );
    expect(() => validatePerformanceProbeBaseUrl("http://127.0.0.1:3201/?token=1")).toThrow(
      /query strings and fragments are not allowed/,
    );
  });

  it("restricts artifact paths to the configured roots", () => {
    const roots = createPerformanceArtifactRoots("/tmp/litrev");

    expect(
      resolvePathWithinRoots({
        cwd: "/tmp/litrev/next-app",
        inputPath: "../output/performance/baseline/budget-thresholds.json",
        label: "budget",
        allowedRoots: [roots.baselineRoot],
      }),
    ).toBe(path.join(roots.baselineRoot, "budget-thresholds.json"));

    expect(
      resolvePathWithinRoots({
        cwd: "/tmp/litrev/next-app",
        inputPath: "../output/performance/nightly/run-1/results-nightly.json",
        label: "output",
        allowedRoots: [roots.nightlyRoot],
      }),
    ).toBe(path.join(roots.nightlyRoot, "run-1", "results-nightly.json"));

    expect(() =>
      resolvePathWithinRoots({
        cwd: "/tmp/litrev/next-app",
        inputPath: "../../../etc/passwd",
        label: "budget",
        allowedRoots: [roots.baselineRoot],
      }),
    ).toThrow(/\[invalid-budget-path\]/);
  });

  it("parses comma-separated allowlists", () => {
    expect(parseAllowList(" localhost, 127.0.0.1 ,, example.com ")).toEqual([
      "localhost",
      "127.0.0.1",
      "example.com",
    ]);
  });
});
