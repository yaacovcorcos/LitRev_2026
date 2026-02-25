import type { AIStreamChunk } from "@/types/ai";
import { normalizeHeaderRecord } from "@/lib/server/utils/header-record";

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
        normalizeHeaderRecord(maybeError.responseHeaders) ?? normalizeHeaderRecord(maybeError.headers);

    return {
        ...(errorStatus !== undefined ? { errorStatus } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(errorHeaders ? { errorHeaders } : {}),
    };
}
