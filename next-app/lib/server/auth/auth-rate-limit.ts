import "server-only";

const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_ATTEMPTS = 10;
const AUTH_LOCKOUT_MS = 5 * 60_000;
const MAX_TRACKED_IPS = 10_000;

type AttemptState = {
  attempts: number[];
  lockoutUntilMs: number;
  lastSeenMs: number;
};

const attemptsByIp = new Map<string, AttemptState>();

function isLoopbackIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  if (!first) return null;
  return first.toLowerCase();
}

function nowMs(): number {
  return Date.now();
}

function pruneOldAttempts(state: AttemptState, now: number) {
  state.attempts = state.attempts.filter((ts) => now - ts <= AUTH_WINDOW_MS);
}

function maybeCompactMap(now: number) {
  if (attemptsByIp.size <= MAX_TRACKED_IPS) return;
  for (const [ip, state] of attemptsByIp) {
    const stale = now - state.lastSeenMs > AUTH_LOCKOUT_MS;
    if (stale) attemptsByIp.delete(ip);
    if (attemptsByIp.size <= MAX_TRACKED_IPS) break;
  }
}

export function extractClientIp(headers: Headers): string | null {
  return normalizeIp(
    headers.get("x-forwarded-for")
    || headers.get("x-real-ip")
    || headers.get("cf-connecting-ip"),
  );
}

export function clearAuthFailures(ip: string | null): void {
  if (!ip) return;
  attemptsByIp.delete(ip);
}

export function registerAuthFailure(ip: string | null): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  if (!ip || isLoopbackIp(ip)) {
    return { allowed: true };
  }

  const now = nowMs();
  maybeCompactMap(now);

  const state = attemptsByIp.get(ip) ?? {
    attempts: [],
    lockoutUntilMs: 0,
    lastSeenMs: now,
  };

  if (state.lockoutUntilMs > now) {
    attemptsByIp.set(ip, state);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockoutUntilMs - now) / 1000)),
    };
  }

  pruneOldAttempts(state, now);
  state.attempts.push(now);
  state.lastSeenMs = now;

  if (state.attempts.length >= AUTH_MAX_ATTEMPTS) {
    state.lockoutUntilMs = now + AUTH_LOCKOUT_MS;
    attemptsByIp.set(ip, state);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(AUTH_LOCKOUT_MS / 1000),
    };
  }

  attemptsByIp.set(ip, state);
  return { allowed: true };
}

export function resetAuthRateLimitStateForTests(): void {
  attemptsByIp.clear();
}
