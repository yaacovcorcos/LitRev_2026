import { afterEach, describe, expect, it } from "vitest";
import {
  isOperationalTelemetryE2EMode,
  isTelemetryIngestE2EMode,
} from "@/lib/telemetry/e2e-mode";

const originalPublicMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE;
const originalServerMode = process.env.E2E_TEST_MODE;

describe("telemetry e2e mode helpers", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_E2E_TEST_MODE = originalPublicMode;
    process.env.E2E_TEST_MODE = originalServerMode;
  });

  it("detects public telemetry e2e mode from NEXT_PUBLIC_E2E_TEST_MODE", () => {
    process.env.NEXT_PUBLIC_E2E_TEST_MODE = "1";
    expect(isOperationalTelemetryE2EMode()).toBe(true);
  });

  it("detects ingest e2e mode from E2E_TEST_MODE", () => {
    process.env.E2E_TEST_MODE = "true";
    expect(isTelemetryIngestE2EMode()).toBe(true);
  });

  it("defaults both helpers to false when envs are unset", () => {
    delete process.env.NEXT_PUBLIC_E2E_TEST_MODE;
    delete process.env.E2E_TEST_MODE;
    expect(isOperationalTelemetryE2EMode()).toBe(false);
    expect(isTelemetryIngestE2EMode()).toBe(false);
  });
});
