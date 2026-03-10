function readBooleanEnv(name: string): boolean {
  const raw = process.env[name];
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function isOperationalTelemetryE2EMode(): boolean {
  return readBooleanEnv("NEXT_PUBLIC_E2E_TEST_MODE");
}

export function isTelemetryIngestE2EMode(): boolean {
  return readBooleanEnv("E2E_TEST_MODE");
}
