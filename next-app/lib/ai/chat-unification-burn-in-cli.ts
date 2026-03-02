const MIN_BURN_IN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function parseIsoDateArg(
  name: string,
  raw: string | undefined,
  required = false,
): Date | undefined {
  if (!raw) {
    if (!required) return undefined;
    throw new Error(`Missing required --${name}=<iso-date> argument`);
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid ISO timestamp for --${name}: ${raw}`);
  }
  return new Date(timestamp);
}

export function resolveBurnInWindow(params: {
  since: Date;
  until?: Date;
  now?: Date;
  allowShortWindow?: boolean;
}): { since: Date; until: Date } {
  const now = params.now ?? new Date();
  const until = params.until ?? now;
  if (params.since > until) {
    throw new Error(
      `--since must be <= --until. received since=${params.since.toISOString()} until=${until.toISOString()}`,
    );
  }
  const durationMs = until.getTime() - params.since.getTime();
  if (durationMs < MIN_BURN_IN_WINDOW_MS && !params.allowShortWindow) {
    throw new Error(
      "Burn-in window must cover at least 7 days. Use --allowShortWindow=1 only for local dry runs.",
    );
  }
  return { since: params.since, until };
}

