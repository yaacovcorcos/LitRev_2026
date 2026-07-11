const DEFAULT_OPERATIONAL_TELEMETRY_COOLDOWN_MS = 30_000;

let suspendedUntilMs = 0;

export function canAttemptOperationalTelemetry(nowMs = Date.now()): boolean {
  return nowMs >= suspendedUntilMs;
}

export function getOperationalTelemetryRetryDelayMs(nowMs = Date.now()): number {
  return Math.max(0, suspendedUntilMs - nowMs);
}

export function noteOperationalTelemetryFailure(
  nowMs = Date.now(),
  cooldownMs = DEFAULT_OPERATIONAL_TELEMETRY_COOLDOWN_MS,
): void {
  suspendedUntilMs = Math.max(suspendedUntilMs, nowMs + Math.max(0, cooldownMs));
}

export function resetOperationalTelemetryBackoffForTests(): void {
  suspendedUntilMs = 0;
}
