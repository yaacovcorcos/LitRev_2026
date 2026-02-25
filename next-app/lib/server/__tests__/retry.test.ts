import { describe, expect, it } from "vitest";
import {
    extractRetryAfterMs,
    parseRetryAfterHeaderMs,
    retryAsync,
} from "@/lib/server/utils/retry";

describe("retryAsync", () => {
    it("retries transient failures until success", async () => {
        let attempts = 0;
        const value = await retryAsync(
            async () => {
                attempts += 1;
                if (attempts < 3) throw new Error("temporary");
                return "ok";
            },
            {
                attempts: 3,
                minDelayMs: 1,
                maxDelayMs: 2,
                jitter: 0,
            }
        );

        expect(value).toBe("ok");
        expect(attempts).toBe(3);
    });

    it("stops when shouldRetry returns false", async () => {
        let attempts = 0;
        await expect(
            retryAsync(
                async () => {
                    attempts += 1;
                    throw new Error("fatal");
                },
                {
                    attempts: 4,
                    minDelayMs: 1,
                    maxDelayMs: 2,
                    jitter: 0,
                    shouldRetry: () => false,
                }
            )
        ).rejects.toThrow("fatal");
        expect(attempts).toBe(1);
    });

    it("uses retry-after-ms when provided", async () => {
        const delays: number[] = [];
        let attempts = 0;
        await expect(
            retryAsync(
                async () => {
                    attempts += 1;
                    throw {
                        message: "rate limited",
                        errorHeaders: { "retry-after-ms": "5" },
                    };
                },
                {
                    attempts: 2,
                    minDelayMs: 1,
                    maxDelayMs: 50,
                    jitter: 0,
                    onRetry: ({ delayMs }) => delays.push(delayMs),
                    retryAfterMs: extractRetryAfterMs,
                }
            )
        ).rejects.toMatchObject({ message: "rate limited" });

        expect(attempts).toBe(2);
        expect(delays).toEqual([5]);
    });
});

describe("parseRetryAfterHeaderMs", () => {
    it("parses retry-after seconds", () => {
        expect(parseRetryAfterHeaderMs({ "retry-after": "1.5" })).toBe(1500);
    });

    it("parses retry-after as HTTP date", () => {
        const date = new Date(Date.now() + 1800).toUTCString();
        const parsed = parseRetryAfterHeaderMs({ "retry-after": date });
        expect(parsed).toBeGreaterThan(0);
        expect(parsed).toBeLessThanOrEqual(2000);
    });
});
