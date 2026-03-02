import { describe, expect, it } from "vitest";
import {
  parseIsoDateArg,
  resolveBurnInWindow,
} from "@/lib/ai/chat-unification-burn-in-cli";

describe("chat unification burn-in CLI helpers", () => {
  it("throws when required --since is missing", () => {
    expect(() => parseIsoDateArg("since", undefined, true)).toThrow(
      "Missing required --since=<iso-date> argument",
    );
  });

  it("throws on invalid ISO timestamps", () => {
    expect(() => parseIsoDateArg("since", "not-a-date", true)).toThrow(
      "Invalid ISO timestamp for --since: not-a-date",
    );
  });

  it("throws when since is greater than until", () => {
    const since = new Date("2026-03-10T00:00:00.000Z");
    const until = new Date("2026-03-05T00:00:00.000Z");
    expect(() => resolveBurnInWindow({ since, until })).toThrow("--since must be <= --until");
  });

  it("enforces a minimum 7-day window unless explicitly overridden", () => {
    const since = new Date("2026-03-01T00:00:00.000Z");
    const until = new Date("2026-03-03T00:00:00.000Z");

    expect(() => resolveBurnInWindow({ since, until })).toThrow(
      "Burn-in window must cover at least 7 days",
    );
    expect(() =>
      resolveBurnInWindow({
        since,
        until,
        allowShortWindow: true,
      }),
    ).not.toThrow();
  });

  it("uses now as implicit until when omitted", () => {
    const since = new Date("2026-03-01T00:00:00.000Z");
    const now = new Date("2026-03-10T00:00:00.000Z");
    const window = resolveBurnInWindow({ since, now });
    expect(window.until.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });
});
