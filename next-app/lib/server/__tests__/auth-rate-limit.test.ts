import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthFailures,
  extractClientIp,
  registerAuthFailure,
  resetAuthRateLimitStateForTests,
} from "@/lib/server/auth/auth-rate-limit";

describe("auth-rate-limit", () => {
  beforeEach(() => {
    resetAuthRateLimitStateForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("extracts the first forwarded IP address", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.5, 70.41.3.18",
    });
    expect(extractClientIp(headers)).toBe("203.0.113.5");
  });

  it("allows loopback addresses without tracking", () => {
    expect(registerAuthFailure("127.0.0.1")).toEqual({ allowed: true });
    expect(registerAuthFailure("::1")).toEqual({ allowed: true });
    expect(registerAuthFailure("::ffff:127.0.0.1")).toEqual({ allowed: true });
  });

  it("locks out after repeated failures and unlocks after lockout window", () => {
    for (let i = 0; i < 9; i += 1) {
      expect(registerAuthFailure("203.0.113.7").allowed).toBe(true);
    }

    const limited = registerAuthFailure("203.0.113.7");
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBeGreaterThanOrEqual(299);

    vi.advanceTimersByTime(60_000);
    const stillLimited = registerAuthFailure("203.0.113.7");
    expect(stillLimited.allowed).toBe(false);
    expect(stillLimited.retryAfterSeconds).toBeGreaterThanOrEqual(239);

    vi.advanceTimersByTime(5 * 60_000);
    expect(registerAuthFailure("203.0.113.7").allowed).toBe(true);
  });

  it("clears failure tracking for an IP", () => {
    for (let i = 0; i < 9; i += 1) {
      registerAuthFailure("203.0.113.55");
    }
    clearAuthFailures("203.0.113.55");
    expect(registerAuthFailure("203.0.113.55").allowed).toBe(true);
  });
});
