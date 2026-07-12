import OpenAI from "openai";
import type {
    FunctionTool,
    Response as ProviderResponse,
    ResponseCreateParamsNonStreaming,
    ResponseCreateParamsStreaming,
    ResponseFunctionToolCall,
    ResponseInput,
    ResponseInputItem,
    ResponseOutputItem,
    ResponseStreamEvent,
    ResponseUsage,
} from "openai/resources/responses/responses";
import type {
    AIErrorEnvelope,
    AIMessage,
    AIResponse,
    AIStreamChunk,
    ChatImageInput,
    ChatOptions,
    DeliveryMode,
    ReasoningEffort,
    ToolCall,
} from "@/types/ai";
import { AIErrorWithEnvelope, buildStreamErrorChunk } from "@/lib/ai/error-envelope";
import { isAbortLikeError } from "@/lib/abort";
import { logServerWarn } from "@/lib/server/logging";
import { BaseAIProvider } from "./base";
import { extractProviderErrorMetadata } from "./error-metadata";
import { normalizeProviderMessages } from "./message-normalization";
import { parseToolArgs } from "../json-repair";
import {
    normalizeChatOptionsForModel,
    type NormalizedProviderChatOptions,
} from "../request-policy";
import { createProviderTerminationError } from "./stream-termination";

const PRIVATE_RESPONSE_STATE_PREFIX = "responses-api-v1:";

type ProviderReasoningEffort = NonNullable<
    NonNullable<ResponseCreateParamsNonStreaming["reasoning"]>["effort"]
>;

type PrivateResponseState = {
    output: ResponseInputItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readActualDeliveryMode(value: unknown): DeliveryMode | undefined {
    if (value === "priority") return "priority";
    if (value === "default") return "standard";
    return undefined;
}

function readActualReasoningEffort(value: unknown): ReasoningEffort | undefined {
    if (value === "none") return "fast";
    if (value === "low" || value === "medium" || value === "high" || value === "max") {
        return value;
    }
    if (value === "xhigh") return "max";
    return undefined;
}

function readUsage(usage: ResponseUsage | null | undefined): AIResponse["usage"] {
    return {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        cachedInputTokens: usage?.input_tokens_details?.cached_tokens,
        cacheWriteInputTokens: usage?.input_tokens_details?.cache_write_tokens,
        reasoningTokens: usage?.output_tokens_details?.reasoning_tokens,
    };
}

function isReplayableOutputItem(item: ResponseOutputItem): item is Extract<
    ResponseOutputItem,
    { type: "reasoning" | "message" | "function_call" }
> {
    return item.type === "reasoning" || item.type === "message" || item.type === "function_call";
}

function serializePrivateResponseState(output: ResponseOutputItem[]): string | undefined {
    const replayableOutput = output.filter(isReplayableOutputItem);
    if (!replayableOutput.some((item) => item.type === "function_call")) return undefined;
    return `${PRIVATE_RESPONSE_STATE_PREFIX}${JSON.stringify({ output: replayableOutput })}`;
}

function parsePrivateResponseState(value: string | undefined): PrivateResponseState | undefined {
    if (!value?.startsWith(PRIVATE_RESPONSE_STATE_PREFIX)) return undefined;
    try {
        const parsed = JSON.parse(value.slice(PRIVATE_RESPONSE_STATE_PREFIX.length)) as unknown;
        if (!isRecord(parsed) || !Array.isArray(parsed.output)) return undefined;
        const output = parsed.output.filter((item): item is ResponseInputItem => (
            isRecord(item)
            && (item.type === "reasoning" || item.type === "message" || item.type === "function_call")
        ));
        return output.length > 0 ? { output } : undefined;
    } catch {
        return undefined;
    }
}

function findRefusal(response: ProviderResponse): string | undefined {
    for (const item of response.output) {
        if (item.type !== "message") continue;
        const refusal = item.content.find((content) => content.type === "refusal");
        if (refusal?.type === "refusal") return refusal.refusal;
    }
    return undefined;
}

function terminationReason(response: ProviderResponse): string | undefined {
    return response.incomplete_details?.reason
        ?? response.error?.code
        ?? response.status
        ?? undefined;
}

const RETRYABLE_PROVIDER_CODES = new Set([
    "server_error",
    "rate_limit_exceeded",
    "vector_store_timeout",
    "provider_overloaded",
]);

const POLICY_PROVIDER_CODES = new Set([
    "bio_policy_violation",
    "image_content_policy_violation",
]);

const INPUT_PROVIDER_CODES = new Set([
    "invalid_image",
    "invalid_image_format",
    "invalid_image_url",
    "invalid_prompt",
]);

function readErrorMessage(error: unknown): string | undefined {
    if (error instanceof Error) return error.message;
    if (!isRecord(error)) return undefined;
    return typeof error.message === "string" ? error.message : undefined;
}

function safeRetryHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!headers) return undefined;
    const allowlisted = Object.entries(headers).filter(([name]) => (
        name.toLowerCase() === "retry-after"
        || name.toLowerCase() === "retry-after-ms"
        || name.toLowerCase().startsWith("x-ratelimit-reset-")
    ));
    return allowlisted.length > 0 ? Object.fromEntries(allowlisted) : undefined;
}

function safeProviderFailureEnvelope(params: {
    provider: string;
    providerCode?: string | null;
    status?: number;
    headers?: Record<string, string>;
    diagnostic?: string;
}): AIErrorEnvelope {
    const normalizedCode = params.providerCode?.trim().toLowerCase();
    const rateLimited = normalizedCode === "rate_limit_exceeded" || params.status === 429;
    const temporarilyUnavailable = RETRYABLE_PROVIDER_CODES.has(normalizedCode ?? "")
        || params.status === 408
        || (params.status !== undefined && params.status >= 500);
    const policyBlocked = POLICY_PROVIDER_CODES.has(normalizedCode ?? "");
    const inputRejected = INPUT_PROVIDER_CODES.has(normalizedCode ?? "")
        || (params.status !== undefined && params.status >= 400 && params.status < 500);

    const errorMeta: AIErrorEnvelope = rateLimited
        ? {
            kind: "provider_request",
            code: "PROVIDER_RATE_LIMITED",
            retryable: true,
            source: "provider_request",
            message: `${params.provider} is temporarily rate limited. Please retry.`,
        }
        : temporarilyUnavailable
            ? {
                kind: "provider_request",
                code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
                retryable: true,
                source: "provider_request",
                message: `${params.provider} is temporarily unavailable. Please retry.`,
            }
            : policyBlocked
                ? {
                    kind: "provider_request",
                    code: "PROVIDER_RESPONSE_BLOCKED",
                    retryable: false,
                    source: "provider_request",
                    message: `${params.provider} blocked the request or response because of provider policy.`,
                }
                : inputRejected
                    ? {
                        kind: "provider_request",
                        code: "PROVIDER_REQUEST_REJECTED",
                        retryable: false,
                        source: "provider_request",
                        message: `${params.provider} rejected the request. Review the input and try again.`,
                    }
                    : {
                        kind: "provider_request",
                        code: "PROVIDER_RESPONSE_FAILED",
                        retryable: false,
                        source: "provider_request",
                        message: `${params.provider} failed to generate a response.`,
                    };

    const headers = safeRetryHeaders(params.headers);
    logServerWarn("ai/responses-api", "provider request failed", {
        provider: params.provider,
        code: errorMeta.code,
        providerCode: RETRYABLE_PROVIDER_CODES.has(normalizedCode ?? "")
            || POLICY_PROVIDER_CODES.has(normalizedCode ?? "")
            || INPUT_PROVIDER_CODES.has(normalizedCode ?? "")
            ? normalizedCode
            : "unknown",
        status: params.status,
        diagnostic: params.diagnostic ? "[redacted]" : undefined,
        diagnosticLength: params.diagnostic?.length,
    });
    return {
        ...errorMeta,
        status: params.status,
        headers,
    };
}

function responseFailureEnvelope(response: ProviderResponse, provider: string): AIErrorEnvelope {
    if (!response.error) {
        return createProviderTerminationError({
            provider,
            reason: terminationReason(response),
        });
    }
    return safeProviderFailureEnvelope({
        provider,
        providerCode: response.error.code,
        diagnostic: response.error.message,
    });
}

function parseFunctionCall(
    item: ResponseFunctionToolCall,
    provider: string,
): ToolCall {
    if (
        !item.call_id?.trim()
        || !item.name?.trim()
        || (item.status !== undefined && item.status !== "completed")
    ) {
        throw new AIErrorWithEnvelope(createProviderTerminationError({ provider }));
    }
    const parsedArgs = parseToolArgs(item.arguments, item.name, `${provider}:responses`);
    if (!parsedArgs.success) throw new AIErrorWithEnvelope(parsedArgs.errorMeta);
    return {
        id: item.call_id,
        name: item.name,
        arguments: parsedArgs.args,
    };
}

function validateCompletedResponse(response: ProviderResponse, provider: string): void {
    if (response.status !== "completed") {
        throw new AIErrorWithEnvelope(responseFailureEnvelope(response, provider));
    }
    if (findRefusal(response)) {
        throw new AIErrorWithEnvelope(createProviderTerminationError({
            provider,
            reason: "refusal",
        }));
    }
}

/**
 * Shared stateless Responses API adapter for providers using the OpenAI SDK.
 *
 * Tool turns preserve the provider's complete typed output privately. This is
 * required for reasoning models: the encrypted reasoning item and function-call
 * item must be replayed with the subsequent function_call_output.
 */
export abstract class ResponsesAPIProvider extends BaseAIProvider {
    protected abstract getClient(): OpenAI;

    protected abstract mapReasoningEffort(effort: ReasoningEffort): ProviderReasoningEffort;

    protected buildRequestOptions(options: NormalizedProviderChatOptions): OpenAI.RequestOptions {
        return { signal: options.signal };
    }

    protected buildProviderRequestParams(
        options: NormalizedProviderChatOptions,
    ): Pick<ResponseCreateParamsNonStreaming, "prompt_cache_key"> {
        void options;
        return {};
    }

    async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
        const normalizedOptions = normalizeChatOptionsForModel(options);
        let response: ProviderResponse;
        try {
            response = await this.getClient().responses.create(
                this.buildRequestParams(messages, normalizedOptions, false),
                this.buildRequestOptions(normalizedOptions),
            );
            validateCompletedResponse(response, this.name);
        } catch (error) {
            if (normalizedOptions.signal?.aborted || isAbortLikeError(error)) throw error;
            if (error instanceof AIErrorWithEnvelope) throw error;
            const metadata = extractProviderErrorMetadata(error);
            throw new AIErrorWithEnvelope(safeProviderFailureEnvelope({
                provider: this.name,
                providerCode: metadata.errorCode,
                status: metadata.errorStatus,
                headers: metadata.errorHeaders,
                diagnostic: readErrorMessage(error),
            }));
        }

        const toolCalls = response.output
            .filter((item): item is ResponseFunctionToolCall => item.type === "function_call")
            .map((item) => parseFunctionCall(item, this.name));

        return {
            id: response.id,
            content: response.output_text ?? "",
            model: String(response.model),
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            actualProvider: this.id,
            actualReasoningEffort: readActualReasoningEffort(response.reasoning?.effort),
            actualDeliveryMode: readActualDeliveryMode(response.service_tier),
            providerReasoningContent: serializePrivateResponseState(response.output),
            usage: readUsage(response.usage),
        };
    }

    async *streamChat(
        messages: AIMessage[],
        options?: ChatOptions,
    ): AsyncIterable<AIStreamChunk> {
        const normalizedOptions = normalizeChatOptionsForModel(options);
        let totalContent = "";
        let completedResponse: ProviderResponse | undefined;
        const emittedToolCallIds = new Set<string>();

        try {
            const stream = await this.getClient().responses.create(
                this.buildRequestParams(messages, normalizedOptions, true),
                this.buildRequestOptions(normalizedOptions),
            );

            for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
                if (event.type === "response.output_text.delta") {
                    totalContent += event.delta;
                    yield { type: "content", content: event.delta };
                    continue;
                }

                if (event.type === "response.refusal.done") {
                    yield buildStreamErrorChunk(createProviderTerminationError({
                        provider: this.name,
                        reason: "refusal",
                    }));
                    return;
                }

                if (event.type === "response.output_item.done" && event.item.type === "function_call") {
                    const toolCall = parseFunctionCall(event.item, this.name);
                    emittedToolCallIds.add(toolCall.id);
                    yield { type: "tool_call", toolCall };
                    continue;
                }

                if (event.type === "response.incomplete") {
                    yield buildStreamErrorChunk(createProviderTerminationError({
                        provider: this.name,
                        reason: terminationReason(event.response),
                    }));
                    return;
                }

                if (event.type === "response.failed") {
                    yield buildStreamErrorChunk(responseFailureEnvelope(event.response, this.name));
                    return;
                }

                if (event.type === "error") {
                    yield buildStreamErrorChunk(safeProviderFailureEnvelope({
                        provider: this.name,
                        providerCode: event.code,
                        diagnostic: event.message,
                    }));
                    return;
                }

                if (event.type === "response.completed") {
                    validateCompletedResponse(event.response, this.name);
                    completedResponse = event.response;
                }
            }

            if (!completedResponse) {
                yield buildStreamErrorChunk(createProviderTerminationError({ provider: this.name }));
                return;
            }

            for (const item of completedResponse.output) {
                if (item.type !== "function_call" || emittedToolCallIds.has(item.call_id)) continue;
                const toolCall = parseFunctionCall(item, this.name);
                emittedToolCallIds.add(toolCall.id);
                yield { type: "tool_call", toolCall };
            }

            yield {
                type: "done",
                content: totalContent || completedResponse.output_text || "",
                usage: readUsage(completedResponse.usage),
                actualModel: String(completedResponse.model),
                actualModelSource: "provider",
                actualProvider: this.id,
                actualReasoningEffort: readActualReasoningEffort(completedResponse.reasoning?.effort),
                actualDeliveryMode: readActualDeliveryMode(completedResponse.service_tier),
                providerReasoningContent: serializePrivateResponseState(completedResponse.output),
            };
        } catch (error) {
            if (normalizedOptions.signal?.aborted || isAbortLikeError(error)) throw error;
            if (error instanceof AIErrorWithEnvelope) {
                yield buildStreamErrorChunk(error.errorMeta);
                return;
            }
            const metadata = extractProviderErrorMetadata(error);
            yield buildStreamErrorChunk(safeProviderFailureEnvelope({
                provider: this.name,
                providerCode: metadata.errorCode,
                status: metadata.errorStatus,
                headers: metadata.errorHeaders,
                diagnostic: readErrorMessage(error),
            }));
        }
    }

    private convertMessages(
        messages: AIMessage[],
        imageInputs: ChatImageInput[] = [],
    ): ResponseInput {
        const result: ResponseInput = [];
        const normalizedMessages = normalizeProviderMessages(messages).messages;
        let latestUserIndex = -1;
        normalizedMessages.forEach((message, index) => {
            if (message.role === "user") latestUserIndex = index;
        });

        for (const [messageIndex, message] of normalizedMessages.entries()) {
            if (message.role === "tool") {
                result.push({
                    type: "function_call_output",
                    call_id: message.toolResultId!,
                    output: message.content,
                });
                continue;
            }

            if (message.role === "assistant" && message.toolCalls?.length) {
                const privateState = parsePrivateResponseState(message.providerReasoningContent);
                if (privateState) {
                    result.push(...privateState.output);
                    continue;
                }
                if (message.content) {
                    result.push({ role: "assistant", content: message.content });
                }
                for (const toolCall of message.toolCalls) {
                    result.push({
                        type: "function_call",
                        call_id: toolCall.id,
                        name: toolCall.name,
                        arguments: JSON.stringify(toolCall.arguments),
                    });
                }
                continue;
            }

            if (message.role === "user" && messageIndex === latestUserIndex && imageInputs.length > 0) {
                result.push({
                    role: "user",
                    content: [
                        { type: "input_text", text: message.content },
                        ...imageInputs.map((image) => ({
                            type: "input_image" as const,
                            image_url: image.dataUrl,
                            detail: "auto" as const,
                        })),
                    ],
                });
                continue;
            }

            result.push({
                role: message.role,
                content: message.content,
            });
        }

        return result;
    }

    private buildTools(options: NormalizedProviderChatOptions): FunctionTool[] | undefined {
        if (!options.tools?.length) return undefined;
        return options.tools.map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: false,
        }));
    }

    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        stream: false,
    ): ResponseCreateParamsNonStreaming;
    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        stream: true,
    ): ResponseCreateParamsStreaming;
    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        stream: boolean,
    ): ResponseCreateParamsNonStreaming | ResponseCreateParamsStreaming {
        const base = {
            model: options.providerModelId,
            input: this.convertMessages(messages, options.imageInputs),
            instructions: options.systemPrompt,
            max_output_tokens: options.maxTokens,
            reasoning: {
                effort: this.mapReasoningEffort(options.reasoningEffort),
            },
            service_tier: options.deliveryMode === "priority" ? "priority" as const : "default" as const,
            store: false,
            include: ["reasoning.encrypted_content" as const],
            tools: this.buildTools(options),
            ...this.buildProviderRequestParams(options),
        };
        return stream ? { ...base, stream: true } : { ...base, stream: false };
    }
}
