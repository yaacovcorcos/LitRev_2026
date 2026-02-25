export type RetryInfo = {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    err: unknown;
    label?: string;
};

export type RetryOptions = {
    attempts?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    jitter?: number;
    label?: string;
    signal?: AbortSignal;
    shouldRetry?: (err: unknown, attempt: number) => boolean;
    retryAfterMs?: (err: unknown) => number | undefined;
    onRetry?: (info: RetryInfo) => void;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_MIN_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 15_000;
const DEFAULT_JITTER = 0.15;

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, Math.max(0, ms));

        const onAbort = () => {
            clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
        };

        if (signal.aborted) {
            onAbort();
            return;
        }

        signal.addEventListener("abort", onAbort, { once: true });
    });
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function applyJitter(delayMs: number, jitter: number): number {
    if (jitter <= 0) return delayMs;
    const offset = (Math.random() * 2 - 1) * jitter;
    return Math.round(Math.max(0, delayMs * (1 + offset)));
}

export function parseRetryAfterHeaderMs(headers?: Record<string, string>): number | undefined {
    if (!headers) return undefined;

    const retryAfterMs = headers["retry-after-ms"];
    if (retryAfterMs) {
        const parsed = Number.parseFloat(retryAfterMs);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
            return Math.ceil(parsed);
        }
    }

    const retryAfter = headers["retry-after"];
    if (!retryAfter) return undefined;

    const parsedSeconds = Number.parseFloat(retryAfter);
    if (!Number.isNaN(parsedSeconds) && Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
        return Math.ceil(parsedSeconds * 1000);
    }

    const parsedDateMs = Date.parse(retryAfter) - Date.now();
    if (!Number.isNaN(parsedDateMs) && Number.isFinite(parsedDateMs) && parsedDateMs > 0) {
        return Math.ceil(parsedDateMs);
    }

    return undefined;
}

function normalizeHeaderRecord(input: unknown): Record<string, string> | undefined {
    if (!input || typeof input !== "object") return undefined;

    if (typeof Headers !== "undefined" && input instanceof Headers) {
        const normalized: Record<string, string> = {};
        for (const [k, v] of input.entries()) {
            normalized[k.toLowerCase()] = v;
        }
        return Object.keys(normalized).length > 0 ? normalized : undefined;
    }

    const record: Record<string, string> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        if (typeof v === "string") {
            record[k.toLowerCase()] = v;
        } else if (typeof v === "number" && Number.isFinite(v)) {
            record[k.toLowerCase()] = String(v);
        }
    }
    return Object.keys(record).length > 0 ? record : undefined;
}

export function extractRetryAfterMs(error: unknown): number | undefined {
    if (!error || typeof error !== "object") return undefined;
    const maybeError = error as {
        headers?: unknown;
        errorHeaders?: unknown;
        responseHeaders?: unknown;
    };
    const headers =
        normalizeHeaderRecord(maybeError.errorHeaders)
        ?? normalizeHeaderRecord(maybeError.headers)
        ?? normalizeHeaderRecord(maybeError.responseHeaders);
    return parseRetryAfterHeaderMs(headers);
}

export async function retryAsync<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    const attempts = Math.max(1, Math.round(options?.attempts ?? DEFAULT_ATTEMPTS));
    const minDelayMs = Math.max(0, Math.round(options?.minDelayMs ?? DEFAULT_MIN_DELAY_MS));
    const maxDelayMs = Math.max(minDelayMs, Math.round(options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS));
    const jitter = clamp(options?.jitter ?? DEFAULT_JITTER, 0, 1);
    const shouldRetry = options?.shouldRetry ?? (() => true);
    const retryAfterMs = options?.retryAfterMs ?? extractRetryAfterMs;

    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            if (attempt >= attempts || !shouldRetry(err, attempt)) {
                break;
            }

            const retryAfterDelay = retryAfterMs(err);
            const exponentialDelay = minDelayMs * 2 ** (attempt - 1);
            const baseDelay = typeof retryAfterDelay === "number" && Number.isFinite(retryAfterDelay)
                ? Math.max(retryAfterDelay, minDelayMs)
                : exponentialDelay;

            const delayMs = clamp(applyJitter(baseDelay, jitter), minDelayMs, maxDelayMs);
            options?.onRetry?.({ attempt, maxAttempts: attempts, delayMs, err, label: options?.label });
            await sleep(delayMs, options?.signal);
        }
    }

    throw lastError ?? new Error("Retry failed");
}
