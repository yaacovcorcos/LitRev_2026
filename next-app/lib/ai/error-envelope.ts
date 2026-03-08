import type { AIErrorEnvelope, AIStreamChunk } from "@/types/ai";

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    return undefined;
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return undefined;
}

function asHeaderRecord(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined;
    const entries = Object.entries(value)
        .map(([key, headerValue]) => [key, asString(headerValue)] as const)
        .filter((entry): entry is [string, string] => !!entry[1]);
    if (entries.length === 0) return undefined;
    return Object.fromEntries(entries);
}

export function isAIErrorEnvelope(value: unknown): value is AIErrorEnvelope {
    if (!isRecord(value)) return false;
    return !!asString(value.kind)
        && !!asString(value.code)
        && asBoolean(value.retryable) !== undefined
        && !!asString(value.source)
        && !!asString(value.message);
}

export class AIErrorWithEnvelope extends Error {
    readonly errorMeta: AIErrorEnvelope;
    readonly errorCode: string;
    readonly errorStatus?: number;
    readonly errorHeaders?: Record<string, string>;

    constructor(errorMeta: AIErrorEnvelope) {
        super(errorMeta.message);
        this.name = "AIErrorWithEnvelope";
        Object.setPrototypeOf(this, new.target.prototype);
        this.errorMeta = errorMeta;
        this.errorCode = errorMeta.code;
        this.errorStatus = errorMeta.status;
        this.errorHeaders = errorMeta.headers;
    }
}

export function extractAIErrorEnvelope(error: unknown): AIErrorEnvelope | undefined {
    if (error instanceof AIErrorWithEnvelope) {
        return error.errorMeta;
    }
    if (!isRecord(error)) return undefined;
    if (isAIErrorEnvelope(error)) return error;
    if (isAIErrorEnvelope(error.errorMeta)) return error.errorMeta;
    if (isAIErrorEnvelope(error.envelope)) return error.envelope;
    if (isRecord(error.cause)) {
        if (isAIErrorEnvelope(error.cause)) return error.cause;
        if (isAIErrorEnvelope(error.cause.errorMeta)) return error.cause.errorMeta;
        if (isAIErrorEnvelope(error.cause.envelope)) return error.cause.envelope;
    }
    return undefined;
}

export function buildStreamErrorChunk(
    errorMeta: AIErrorEnvelope,
    extras?: Pick<AIStreamChunk, "conversationId">,
): AIStreamChunk {
    return {
        type: "error",
        error: errorMeta.message,
        errorStatus: errorMeta.status,
        errorCode: errorMeta.code,
        errorHeaders: errorMeta.headers,
        errorMeta,
        conversationId: extras?.conversationId,
    };
}

export function envelopeFromStreamChunk(
    chunk: Pick<AIStreamChunk, "error" | "errorMeta" | "errorStatus" | "errorCode" | "errorHeaders">,
): AIErrorEnvelope {
    if (chunk.errorMeta) {
        return {
            ...chunk.errorMeta,
            status: chunk.errorMeta.status ?? chunk.errorStatus,
            headers: chunk.errorMeta.headers ?? chunk.errorHeaders,
        };
    }
    const status = chunk.errorStatus;
    const retryable = status === undefined
        ? true
        : status === 408 || status === 429 || status >= 500;
    return {
        kind: "runtime",
        code: chunk.errorCode ?? "STREAM_ERROR",
        retryable,
        source: "runtime",
        message: chunk.error ?? "AI stream error",
        status,
        headers: chunk.errorHeaders,
    };
}

type ToolCallParseFailureReason = "parse_failed" | "array_payload" | "non_object_payload";

export function createToolCallParseErrorEnvelope(params: {
    provider: string;
    toolName: string;
    reason: ToolCallParseFailureReason;
}): AIErrorEnvelope {
    const code = params.reason === "parse_failed"
        ? "TOOL_CALL_ARGS_PARSE_FAILED"
        : "TOOL_CALL_ARGS_NOT_OBJECT";
    const providerLabel = params.provider.replace(/:stream$/, "");
    return {
        kind: "tool_call_parse",
        code,
        retryable: false,
        source: "provider_tool_call",
        message: `${providerLabel} returned invalid arguments for ${params.toolName}, so the action was not run.`,
    };
}

export function createToolSchemaValidationErrorEnvelope(
    toolName: string,
): AIErrorEnvelope {
    return {
        kind: "tool_schema_validation",
        code: "TOOL_INPUT_VALIDATION_FAILED",
        retryable: false,
        source: "tool_validator",
        message: `The model called ${toolName} with invalid input, so the action was not run.`,
        headers: undefined,
        status: undefined,
    };
}

export function createAutonomyBlockedErrorEnvelope(params: {
    toolName: string;
    reason: "disabled_by_autonomy" | "approval_required";
}): AIErrorEnvelope {
    return {
        kind: "autonomy_blocked",
        code: params.reason === "disabled_by_autonomy"
            ? "TOOL_DISABLED_BY_AUTONOMY"
            : "TOOL_APPROVAL_REQUIRED",
        retryable: false,
        source: "autonomy_policy",
        message: params.reason === "disabled_by_autonomy"
            ? `Tool "${params.toolName}" is disabled by autonomy policy.`
            : `Tool "${params.toolName}" requires direct approval before it can run.`,
    };
}

export function extractEnvelopeStatus(value: unknown): number | undefined {
    return asNumber(value);
}

export function extractEnvelopeHeaders(value: unknown): Record<string, string> | undefined {
    return asHeaderRecord(value);
}
