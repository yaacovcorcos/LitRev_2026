const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function parseBooleanEnv(raw: string | undefined): boolean {
  if (raw == null) return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}

export function isOperationalTelemetryE2EMode(): boolean {
  return parseBooleanEnv(process.env.NEXT_PUBLIC_E2E_TEST_MODE);
}

export function isTelemetryIngestE2EMode(): boolean {
  return parseBooleanEnv(process.env.E2E_TEST_MODE);
}
