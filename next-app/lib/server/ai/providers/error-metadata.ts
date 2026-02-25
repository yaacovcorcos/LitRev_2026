import type { AIStreamChunk } from "@/types/ai";

type StreamErrorMetadata = Pick<AIStreamChunk, "errorStatus" | "errorCode" | "errorHeaders">;

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
    return undefined;
}

function asString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeHeaders(input: unknown): Record<string, string> | undefined {
    if (!input || typeof input !== "object") return undefined;

    if (typeof Headers !== "undefined" && input instanceof Headers) {
        const out: Record<string, string> = {};
        for (const [key, value] of input.entries()) {
            out[key.toLowerCase()] = value;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }

    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (typeof value === "string") {
            out[key.toLowerCase()] = value;
        } else if (typeof value === "number" && Number.isFinite(value)) {
            out[key.toLowerCase()] = String(value);
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function extractProviderErrorMetadata(error: unknown): StreamErrorMetadata {
    if (!error || typeof error !== "object") return {};
    const maybeError = error as {
        status?: unknown;
        statusCode?: unknown;
        code?: unknown;
        headers?: unknown;
        responseHeaders?: unknown;
    };

    const errorStatus = asNumber(maybeError.statusCode) ?? asNumber(maybeError.status);
    const errorCode = asString(maybeError.code);
    const errorHeaders =
        normalizeHeaders(maybeError.responseHeaders) ?? normalizeHeaders(maybeError.headers);

    return {
        ...(errorStatus !== undefined ? { errorStatus } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(errorHeaders ? { errorHeaders } : {}),
    };
}
