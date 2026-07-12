/**
 * OpenAI-compatible model gateway adapter.
 *
 * Product IDs remain stable inside LitRev. The adapter resolves the concrete
 * upstream slug at request time so Vercel AI Gateway, another compatible
 * gateway, or a direct compatible endpoint can be selected with server env.
 */

import OpenAI from "openai";
import type {
    AIMessage,
    AIModel,
    AIResponse,
    AIStreamChunk,
    ChatImageInput,
    ChatOptions,
    DeliveryMode,
    ToolCall,
} from "@/types/ai";
import { AVAILABLE_MODELS } from "@/lib/ai/config";
import { AIErrorWithEnvelope, buildStreamErrorChunk } from "@/lib/ai/error-envelope";
import { isAbortLikeError } from "@/lib/abort";
import { BaseAIProvider } from "./base";
import { extractProviderErrorMetadata } from "./error-metadata";
import { normalizeProviderMessages } from "./message-normalization";
import { extractReasoningTextsFromDelta } from "./reasoning-delta";
import { getToolCallDeltas } from "./tool-call-delta";
import { parseToolArgs } from "../json-repair";
import { toAIErrorEnvelope } from "../error-classification";
import {
    normalizeChatOptionsForModel,
    type NormalizedProviderChatOptions,
} from "../request-policy";
import {
    isModelConfigured,
    resolveGatewayRuntimeConfig,
    type GatewayRuntimeConfig,
} from "../model-availability";
import {
    createProviderTerminationError,
    isCompatibleSuccessFinishReason,
} from "./stream-termination";

const VERCEL_REASONING_STATE_PREFIX = "vercel-reasoning-v1:";

type UnknownRecord = Record<string, unknown>;
type GatewayReasoningConfig = {
    enabled: boolean;
    effort?: "high" | "xhigh";
    max_tokens?: number;
    exclude?: boolean;
};
type ExtendedChatCompletionParams = Omit<
    OpenAI.Chat.Completions.ChatCompletionCreateParams,
    "reasoning_effort"
> & {
    reasoning?: GatewayReasoningConfig;
    providerOptions?: {
        gateway: {
            order: string[];
            only: string[];
        };
    };
    thinking?: { type: "enabled" | "disabled" };
    enable_thinking?: boolean;
    thinking_budget?: number;
    reasoning_effort?: "high" | "max";
};

type GatewayUsage = {
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    prompt_cache_hit_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
};

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readActualDeliveryMode(value: unknown): DeliveryMode | undefined {
    if (value === "priority") return "priority";
    if (value === "default") return "standard";
    return undefined;
}

function normalizeGatewayProvider(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (normalized === "deep-seek") return "deepseek";
    if (["alibaba", "alibaba-cloud", "alibaba-model-studio", "dashscope"].includes(normalized)) {
        return "alibaba";
    }
    return normalized;
}

function extractGatewayActualProvider(value: unknown): string | undefined {
    if (!isRecord(value)) return undefined;
    const metadata = (isRecord(value.providerMetadata) ? value.providerMetadata : undefined)
        ?? (isRecord(value.provider_metadata) ? value.provider_metadata : undefined);
    const gateway = metadata && isRecord(metadata.gateway) ? metadata.gateway : undefined;
    const routing = gateway && isRecord(gateway.routing) ? gateway.routing : undefined;
    const candidates = [
        value.provider,
        routing?.provider,
        routing?.finalProvider,
        routing?.providerId,
        gateway?.provider,
    ];
    const candidate = candidates.find((entry): entry is string => (
        typeof entry === "string" && entry.trim().length > 0
    ));
    return candidate ? normalizeGatewayProvider(candidate) : undefined;
}

function extractReasoningDetails(value: unknown): unknown[] {
    if (!isRecord(value) || !Array.isArray(value.reasoning_details)) return [];
    return value.reasoning_details;
}

function extractCachedInputTokens(usage: unknown): number | undefined {
    if (!isRecord(usage)) return undefined;
    const details = isRecord(usage.prompt_tokens_details)
        ? usage.prompt_tokens_details
        : undefined;
    if (typeof details?.cached_tokens === "number") return details.cached_tokens;
    return typeof usage.prompt_cache_hit_tokens === "number"
        ? usage.prompt_cache_hit_tokens
        : undefined;
}

function extractCacheWriteInputTokens(usage: unknown): number | undefined {
    if (!isRecord(usage)) return undefined;
    const details = isRecord(usage.prompt_tokens_details)
        ? usage.prompt_tokens_details
        : undefined;
    return typeof details?.cache_write_tokens === "number"
        ? details.cache_write_tokens
        : undefined;
}

function serializePrivateReasoningState(params: {
    text: string;
    details: unknown[];
    usesVercelGateway: boolean;
}): string | undefined {
    if (!params.text && params.details.length === 0) return undefined;
    if (!params.usesVercelGateway || params.details.length === 0) {
        return params.text || undefined;
    }
    return `${VERCEL_REASONING_STATE_PREFIX}${JSON.stringify({
        text: params.text,
        details: params.details,
    })}`;
}

function parsePrivateReasoningState(value: string): { text: string; details?: unknown[] } {
    if (!value.startsWith(VERCEL_REASONING_STATE_PREFIX)) {
        return { text: value };
    }
    try {
        const parsed = JSON.parse(value.slice(VERCEL_REASONING_STATE_PREFIX.length)) as unknown;
        if (!isRecord(parsed)) return { text: "" };
        return {
            text: typeof parsed.text === "string" ? parsed.text : "",
            details: Array.isArray(parsed.details) ? parsed.details : undefined,
        };
    } catch {
        return { text: "" };
    }
}

function qwenThinkingBudget(options: NormalizedProviderChatOptions): number | undefined {
    return options.reasoningBudgetTokens;
}

function approvedGatewayProviders(options: NormalizedProviderChatOptions): string[] {
    const defaultProvider = options.providerDialect === "deepseek"
        ? "deepseek"
        : options.providerDialect === "qwen"
            ? "alibaba"
            : null;
    if (!defaultProvider) return [];

    const envName = options.providerDialect === "deepseek"
        ? "AI_GATEWAY_DEEPSEEK_PROVIDERS"
        : "AI_GATEWAY_QWEN37_PLUS_PROVIDERS";
    const configured = process.env[envName]?.split(",")
        .map((provider) => provider.trim())
        .filter(Boolean) ?? [];
    const providers = configured.length > 0 ? configured : [defaultProvider];
    for (const provider of providers) {
        if (!/^[a-z0-9-]+$/.test(provider)) {
            throw new Error(`${envName} contains an invalid provider slug: ${provider}.`);
        }
    }
    return [...new Set(providers)];
}

export class GatewayProvider extends BaseAIProvider {
    readonly id = "gateway";
    readonly name = "Model Gateway";
    readonly models: AIModel[] = AVAILABLE_MODELS.gateway as unknown as AIModel[];

    private client: OpenAI | null = null;
    private clientRuntimeKey: string | null = null;

    private getClient(modelId: string): OpenAI {
        const runtime = resolveGatewayRuntimeConfig(modelId);
        if (!runtime.enabled) {
            throw new Error(
                "AI Model Gateway is staged but disabled. Set AI_MODEL_GATEWAY_ENABLED=1 only after provider evaluation and rollout approval.",
            );
        }
        if (!runtime.apiKey) {
            throw new Error(
                "AI Gateway credentials are not set. Custom endpoints require AI_MODEL_GATEWAY_API_KEY or AI_GATEWAY_API_KEY; Vercel Gateway can also use VERCEL_OIDC_TOKEN.",
            );
        }
        if (!runtime.modelRouteConfigured) {
            throw new Error(
                `Custom gateway model routing is not configured for ${modelId}. Set its AI_GATEWAY_*_MODEL override explicitly.`,
            );
        }
        const runtimeKey = `${runtime.baseURL}\u0000${runtime.apiKey}`;
        // Tests may inject a client directly. Production-created clients always
        // carry a runtime key, allowing short-lived OIDC credentials to rotate
        // safely in warm processes.
        if (this.client && (this.clientRuntimeKey === runtimeKey || this.clientRuntimeKey === null)) {
            return this.client;
        }
        this.client = new OpenAI({ apiKey: runtime.apiKey, baseURL: runtime.baseURL });
        this.clientRuntimeKey = runtimeKey;
        return this.client;
    }

    isConfigured(): boolean {
        return this.models.some((model) => isModelConfigured(model.id));
    }

    async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
        const normalizedOptions = normalizeChatOptionsForModel(options);
        const runtime = resolveGatewayRuntimeConfig(normalizedOptions.model);
        const client = this.getClient(normalizedOptions.model);
        const params = this.buildRequestParams(messages, normalizedOptions, runtime, false);
        const response = await client.chat.completions.create(params, { signal: normalizedOptions.signal });
        const choice = response.choices[0];
        if (!choice || !isCompatibleSuccessFinishReason(choice.finish_reason)) {
            throw new AIErrorWithEnvelope(createProviderTerminationError({
                provider: this.name,
                reason: choice?.finish_reason,
            }));
        }

        const toolCalls: ToolCall[] = [];
        for (const tc of choice.message.tool_calls
            ?.filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
            ?? []) {
            if (!tc.id?.trim() || !tc.function.name?.trim()) {
                throw new AIErrorWithEnvelope(createProviderTerminationError({ provider: this.name }));
            }
            const parsedArgs = parseToolArgs(tc.function.arguments, tc.function.name, "gateway");
            if (!parsedArgs.success) throw new AIErrorWithEnvelope(parsedArgs.errorMeta);
            toolCalls.push({ id: tc.id, name: tc.function.name, arguments: parsedArgs.args });
        }
        if (
            (choice.finish_reason === "tool_calls" && toolCalls.length === 0)
            || (choice.finish_reason === "stop" && toolCalls.length > 0)
        ) {
            throw new AIErrorWithEnvelope(createProviderTerminationError({ provider: this.name }));
        }

        const reasoningText = extractReasoningTextsFromDelta(choice.message as unknown).join("");
        const providerReasoningContent = toolCalls.length > 0
            ? serializePrivateReasoningState({
                text: reasoningText,
                details: extractReasoningDetails(choice.message as unknown),
                usesVercelGateway: runtime.usesVercelGateway,
            })
            : undefined;

        return {
            id: response.id,
            content: choice.message.content || "",
            model: response.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            actualProvider: extractGatewayActualProvider(choice.message)
                ?? extractGatewayActualProvider(response),
            actualDeliveryMode: readActualDeliveryMode(
                (response as unknown as { service_tier?: unknown }).service_tier,
            ),
            providerReasoningContent,
            usage: {
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
                cachedInputTokens: extractCachedInputTokens(response.usage),
                cacheWriteInputTokens: extractCacheWriteInputTokens(response.usage),
                reasoningTokens: (response.usage as GatewayUsage | undefined)
                    ?.completion_tokens_details?.reasoning_tokens,
            },
        };
    }

    async *streamChat(messages: AIMessage[], options?: ChatOptions): AsyncIterable<AIStreamChunk> {
        const normalizedOptions = normalizeChatOptionsForModel(options);
        const runtime = resolveGatewayRuntimeConfig(normalizedOptions.model);
        const client = this.getClient(normalizedOptions.model);
        const params = this.buildRequestParams(messages, normalizedOptions, runtime, true);
        const stream = await client.chat.completions.create(params, { signal: normalizedOptions.signal });

        let totalContent = "";
        let reasoningText = "";
        const reasoningDetails: unknown[] = [];
        let usage: AIStreamChunk["usage"] | undefined;
        let observedModel: string | undefined;
        let observedProvider: string | undefined;
        let observedDeliveryMode: DeliveryMode | undefined;
        const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
        let activeReasoningId: string | null = null;
        let reasoningCounter = 0;
        let sawTerminalFinish = false;

        try {
            for await (const chunk of stream) {
                const chunkRecord = chunk as unknown;
                observedProvider = extractGatewayActualProvider(chunkRecord) ?? observedProvider;
                observedDeliveryMode = readActualDeliveryMode(
                    (chunk as unknown as { service_tier?: unknown }).service_tier,
                ) ?? observedDeliveryMode;

                const chunkModel = (chunk as { model?: unknown }).model;
                if (!observedModel && typeof chunkModel === "string" && chunkModel.trim().length > 0) {
                    observedModel = chunkModel;
                }

                const choice = chunk.choices[0];
                if (choice) {
                    const deltaObj = choice.delta as unknown;
                    observedProvider = extractGatewayActualProvider(deltaObj) ?? observedProvider;
                    const reasoningDeltas = extractReasoningTextsFromDelta(deltaObj);
                    if (reasoningDeltas.length > 0) {
                        if (normalizedOptions.includeReasoning && !activeReasoningId) {
                            activeReasoningId = `reasoning-gateway-${Date.now()}-${reasoningCounter++}`;
                            yield { type: "reasoning_start", reasoningId: activeReasoningId };
                        }
                        for (const delta of reasoningDeltas) {
                            reasoningText += delta;
                            if (normalizedOptions.includeReasoning && activeReasoningId) {
                                yield {
                                    type: "reasoning_delta",
                                    reasoningId: activeReasoningId,
                                    reasoningText: delta,
                                };
                            }
                        }
                    }
                    reasoningDetails.push(...extractReasoningDetails(deltaObj));

                    const delta = choice.delta?.content;
                    if (typeof delta === "string" && delta.length > 0) {
                        totalContent += delta;
                        yield { type: "content", content: delta };
                    }

                    for (const tc of getToolCallDeltas(choice.delta)) {
                        const index = tc.index;
                        if (!pendingToolCalls.has(index)) {
                            pendingToolCalls.set(index, { id: tc.id || "", name: "", arguments: "" });
                        }
                        const pending = pendingToolCalls.get(index)!;
                        if (tc.id) pending.id = tc.id;
                        if (tc.function?.name) pending.name += tc.function.name;
                        if (tc.function?.arguments) pending.arguments += tc.function.arguments;
                    }

                    if (choice.finish_reason && !isCompatibleSuccessFinishReason(choice.finish_reason)) {
                        if (activeReasoningId) {
                            yield { type: "reasoning_end", reasoningId: activeReasoningId };
                            activeReasoningId = null;
                        }
                        yield buildStreamErrorChunk(createProviderTerminationError({
                            provider: this.name,
                            reason: choice.finish_reason,
                        }));
                        return;
                    }

                    if (choice.finish_reason === "tool_calls") {
                        if (activeReasoningId) {
                            yield { type: "reasoning_end", reasoningId: activeReasoningId };
                            activeReasoningId = null;
                        }
                        if (pendingToolCalls.size === 0) {
                            yield buildStreamErrorChunk(createProviderTerminationError({ provider: this.name }));
                            return;
                        }
                        const privateReasoning = serializePrivateReasoningState({
                            text: reasoningText,
                            details: reasoningDetails,
                            usesVercelGateway: runtime.usesVercelGateway,
                        });
                        for (const [, tc] of pendingToolCalls) {
                            if (!tc.id.trim() || !tc.name.trim()) {
                                yield buildStreamErrorChunk(createProviderTerminationError({ provider: this.name }));
                                pendingToolCalls.clear();
                                return;
                            }
                            const parsedArgs = parseToolArgs(tc.arguments, tc.name, "gateway:stream");
                            if (!parsedArgs.success) {
                                yield buildStreamErrorChunk(parsedArgs.errorMeta);
                                pendingToolCalls.clear();
                                return;
                            }
                            yield {
                                type: "tool_call",
                                toolCall: { id: tc.id, name: tc.name, arguments: parsedArgs.args },
                                providerReasoningContent: privateReasoning,
                            };
                        }
                        sawTerminalFinish = true;
                        pendingToolCalls.clear();
                    } else if (choice.finish_reason === "stop") {
                        if (pendingToolCalls.size > 0) {
                            yield buildStreamErrorChunk(createProviderTerminationError({ provider: this.name }));
                            return;
                        }
                        sawTerminalFinish = true;
                        if (activeReasoningId) {
                            yield { type: "reasoning_end", reasoningId: activeReasoningId };
                            activeReasoningId = null;
                        }
                    }
                }

                if (chunk.usage) {
                    usage = {
                        inputTokens: chunk.usage.prompt_tokens,
                        outputTokens: chunk.usage.completion_tokens,
                        totalTokens: chunk.usage.total_tokens,
                        cachedInputTokens: extractCachedInputTokens(chunk.usage),
                        cacheWriteInputTokens: extractCacheWriteInputTokens(chunk.usage),
                        reasoningTokens: (chunk.usage as GatewayUsage)
                            .completion_tokens_details?.reasoning_tokens,
                    };
                }
            }

            if (activeReasoningId) {
                yield { type: "reasoning_end", reasoningId: activeReasoningId };
            }

            if (!sawTerminalFinish) {
                yield buildStreamErrorChunk(createProviderTerminationError({ provider: this.name }));
                return;
            }

            yield {
                type: "done",
                content: totalContent,
                usage,
                actualModel: observedModel,
                actualModelSource: observedModel ? "provider" : undefined,
                actualProvider: observedProvider
                    ?? undefined,
                actualDeliveryMode: observedDeliveryMode,
                providerReasoningContent: serializePrivateReasoningState({
                    text: reasoningText,
                    details: reasoningDetails,
                    usesVercelGateway: runtime.usesVercelGateway,
                }),
            };
        } catch (error) {
            if (normalizedOptions.signal?.aborted || isAbortLikeError(error)) throw error;
            const metadata = extractProviderErrorMetadata(error);
            const errorMeta = toAIErrorEnvelope(error, {
                kind: "provider_request",
                source: "provider_request",
                code: metadata.errorCode ?? undefined,
            });
            yield buildStreamErrorChunk({
                ...errorMeta,
                status: errorMeta.status ?? metadata.errorStatus,
                headers: errorMeta.headers ?? metadata.errorHeaders,
            });
        }
    }

    private convertMessages(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        runtime: GatewayRuntimeConfig,
        imageInputs: ChatImageInput[] = [],
    ): OpenAI.Chat.ChatCompletionMessageParam[] {
        const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        const normalizedMessages = normalizeProviderMessages(messages).messages;
        let latestUserIndex = -1;
        normalizedMessages.forEach((message, index) => {
            if (message.role === "user") latestUserIndex = index;
        });

        if (options.systemPrompt) result.push({ role: "system", content: options.systemPrompt });

        for (const [messageIndex, message] of normalizedMessages.entries()) {
            if (message.role === "system") {
                result.push({ role: "system", content: message.content });
            } else if (message.role === "user") {
                if (messageIndex === latestUserIndex && imageInputs.length > 0) {
                    result.push({
                        role: "user",
                        content: [
                            { type: "text", text: message.content },
                            ...imageInputs.map((image) => ({
                                type: "image_url" as const,
                                image_url: { url: image.dataUrl, detail: "auto" as const },
                            })),
                        ],
                    });
                } else {
                    result.push({ role: "user", content: message.content });
                }
            } else if (message.role === "assistant" && message.toolCalls?.length) {
                const assistantMessage: UnknownRecord = {
                    role: "assistant",
                    content: message.content || null,
                    tool_calls: message.toolCalls.map((toolCall) => ({
                        id: toolCall.id,
                        type: "function" as const,
                        function: {
                            name: toolCall.name,
                            arguments: JSON.stringify(toolCall.arguments),
                        },
                    })),
                };
                if (message.providerReasoningContent) {
                    const state = parsePrivateReasoningState(message.providerReasoningContent);
                    if (runtime.usesVercelGateway) {
                        if (state.text) assistantMessage.reasoning = state.text;
                        if (state.details?.length) assistantMessage.reasoning_details = state.details;
                    } else if (options.providerDialect === "deepseek" && state.text) {
                        assistantMessage.reasoning_content = state.text;
                    }
                }
                result.push(assistantMessage as unknown as OpenAI.Chat.ChatCompletionMessageParam);
            } else if (message.role === "assistant") {
                result.push({ role: "assistant", content: message.content });
            } else if (message.role === "tool") {
                result.push({
                    role: "tool",
                    tool_call_id: message.toolResultId!,
                    content: message.content,
                });
            }
        }
        return result;
    }

    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        runtime: GatewayRuntimeConfig,
        stream: true,
    ): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        runtime: GatewayRuntimeConfig,
        stream: false,
    ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        runtime: GatewayRuntimeConfig,
        stream: boolean,
    ): OpenAI.Chat.ChatCompletionCreateParams {
        const params: ExtendedChatCompletionParams = {
            model: runtime.providerModelId,
            messages: this.convertMessages(messages, options, runtime, options.imageInputs),
            // Vercel's model endpoint metadata and the official DeepSeek/Qwen
            // compatible schemas advertise `max_tokens` for these models.
            max_tokens: options.maxTokens,
            ...(stream ? { stream: true as const, stream_options: { include_usage: true } } : {}),
        };

        const approvedProviders = runtime.usesVercelGateway
            ? approvedGatewayProviders(options)
            : [];
        if (approvedProviders.length > 0) {
            // `only` is the privacy/cost boundary. Additional failover hosts
            // must be explicitly approved in env before they can receive data.
            params.providerOptions = {
                gateway: {
                    order: approvedProviders,
                    only: approvedProviders,
                },
            };
        }

        const thinkingEnabled = options.reasoningEffort !== "fast";
        if (runtime.usesVercelGateway) {
            if (!thinkingEnabled) {
                params.reasoning = { enabled: false, exclude: true };
            } else if (options.providerDialect === "qwen") {
                const reasoningBudget = qwenThinkingBudget(options);
                params.reasoning = {
                    enabled: true,
                    ...(reasoningBudget === undefined ? {} : { max_tokens: reasoningBudget }),
                    exclude: !options.includeReasoning,
                };
            } else {
                params.reasoning = {
                    enabled: true,
                    effort: options.reasoningEffort === "max" ? "xhigh" : "high",
                    // DeepSeek tool continuations require the private reasoning state.
                    exclude: !options.includeReasoning && !options.tools?.length,
                };
            }
        } else if (options.providerDialect === "deepseek") {
            params.thinking = { type: thinkingEnabled ? "enabled" : "disabled" };
            if (thinkingEnabled) {
                params.reasoning_effort = options.reasoningEffort === "max" ? "max" : "high";
            }
        } else if (options.providerDialect === "qwen") {
            params.enable_thinking = thinkingEnabled;
            const reasoningBudget = qwenThinkingBudget(options);
            if (thinkingEnabled && reasoningBudget !== undefined) {
                params.thinking_budget = reasoningBudget;
            }
        }

        // DeepSeek ignores sampling controls while thinking; omitting them avoids
        // misleading request telemetry and incompatible gateway validation.
        if (options.temperature !== undefined && !(options.providerDialect === "deepseek" && thinkingEnabled)) {
            params.temperature = options.temperature;
        }

        if (options.tools?.length) {
            params.tools = options.tools.map((tool) => ({
                type: "function" as const,
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters as OpenAI.FunctionParameters,
                },
            }));
        }

        return params as unknown as OpenAI.Chat.ChatCompletionCreateParams;
    }
}

let gatewayProvider: GatewayProvider | null = null;

export function getGatewayProvider(): GatewayProvider {
    if (!gatewayProvider) gatewayProvider = new GatewayProvider();
    return gatewayProvider;
}
