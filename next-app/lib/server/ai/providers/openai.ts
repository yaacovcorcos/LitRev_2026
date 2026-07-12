/**
 * OpenAI Provider
 * Implementation using OpenAI's Chat Completions API with streaming support
 * Includes actual token usage tracking via stream_options
 */

import OpenAI from "openai";
import type {
    AIMessage,
    AIModel,
    AIResponse,
    ChatImageInput,
    ChatOptions,
    DeliveryMode,
    AIStreamChunk,
    ReasoningEffort,
    ToolCall,
} from "@/types/ai";
import { BaseAIProvider } from "./base";
import { AVAILABLE_MODELS } from "@/lib/ai/config";
import { parseToolArgs } from "../json-repair";
import { AIErrorWithEnvelope, buildStreamErrorChunk } from "@/lib/ai/error-envelope";
import { extractProviderErrorMetadata } from "./error-metadata";
import { normalizeProviderMessages } from "./message-normalization";
import { extractReasoningTextsFromDelta } from "./reasoning-delta";
import {
    normalizeChatOptionsForModel,
    type NormalizedProviderChatOptions,
} from "../request-policy";
import { toAIErrorEnvelope } from "../error-classification";
import { getToolCallDeltas } from "./tool-call-delta";
import { isAbortLikeError } from "@/lib/abort";
import {
    createProviderTerminationError,
    isCompatibleSuccessFinishReason,
} from "./stream-termination";

type ExtendedChatCompletionParams = Omit<
    OpenAI.Chat.Completions.ChatCompletionCreateParams,
    "reasoning_effort"
> & {
    reasoning_effort?: "none" | "low" | "medium" | "high" | "max";
    service_tier?: "default" | "priority";
};

function mapReasoningEffort(effort: ReasoningEffort): ExtendedChatCompletionParams["reasoning_effort"] {
    return effort === "fast" ? "none" : effort;
}

function readActualDeliveryMode(value: unknown): DeliveryMode | undefined {
    if (value === "priority") return "priority";
    if (value === "default") return "standard";
    return undefined;
}

function readUsage(
    usage: OpenAI.Completions.CompletionUsage | null | undefined,
): AIResponse["usage"] {
    const promptDetails = usage?.prompt_tokens_details as (
        { cached_tokens?: number; cache_write_tokens?: number } | undefined
    );
    return {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        cachedInputTokens: promptDetails?.cached_tokens,
        cacheWriteInputTokens: promptDetails?.cache_write_tokens,
        reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens,
    };
}

export class OpenAIProvider extends BaseAIProvider {
    readonly id = "openai";
    readonly name = "OpenAI";
    readonly models: AIModel[] = AVAILABLE_MODELS.openai as unknown as AIModel[];

    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (!this.client) {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                throw new Error("OPENAI_API_KEY environment variable is not set");
            }
            this.client = new OpenAI({ apiKey });
        }
        return this.client;
    }

    isConfigured(): boolean {
        return !!process.env.OPENAI_API_KEY;
    }

    async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
        const client = this.getClient();
        const normalizedOptions = normalizeChatOptionsForModel(options);
        const params = this.buildRequestParams(messages, normalizedOptions, false);

        // Pass AbortSignal through so callers can cancel in-flight requests.
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
            const parsedArgs = parseToolArgs(tc.function.arguments, tc.function.name, "openai");
            if (!parsedArgs.success) {
                throw new AIErrorWithEnvelope(parsedArgs.errorMeta);
            }
            toolCalls.push({
                id: tc.id,
                name: tc.function.name,
                arguments: parsedArgs.args,
            });
        }

        if (choice.finish_reason === "tool_calls" && toolCalls.length === 0) {
            throw new AIErrorWithEnvelope(createProviderTerminationError({ provider: this.name }));
        }

        return {
            id: response.id,
            content: choice.message.content || "",
            model: response.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            actualProvider: this.id,
            actualDeliveryMode: readActualDeliveryMode(
                (response as unknown as { service_tier?: unknown }).service_tier,
            ),
            usage: readUsage(response.usage),
        };
    }

    async *streamChat(
        messages: AIMessage[],
        options?: ChatOptions
    ): AsyncIterable<AIStreamChunk> {
        const client = this.getClient();
        const normalizedOptions = normalizeChatOptionsForModel(options);
        const params = this.buildRequestParams(messages, normalizedOptions, true);

        // Pass AbortSignal through so callers can cancel in-flight streaming requests.
        const stream = await client.chat.completions.create(params, { signal: normalizedOptions.signal });

        let totalContent = "";
        let usage: AIStreamChunk["usage"] | undefined;
        let observedModel: string | undefined;
        let observedDeliveryMode: DeliveryMode | undefined;
        const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
        const includeReasoning = normalizedOptions.includeReasoning;
        let activeReasoningId: string | null = null;
        let reasoningCounter = 0;
        let sawTerminalFinish = false;

        try {
            for await (const chunk of stream) {
                const chunkServiceTier = (chunk as unknown as { service_tier?: unknown }).service_tier;
                observedDeliveryMode = readActualDeliveryMode(chunkServiceTier) ?? observedDeliveryMode;
                const chunkModel = (chunk as { model?: unknown }).model;
                if (!observedModel && typeof chunkModel === "string" && chunkModel.trim().length > 0) {
                    observedModel = chunkModel;
                }
                const choice = chunk.choices[0];

                if (choice) {
                    const deltaObj = choice.delta as unknown;

                    // Accumulate provider-native reasoning deltas when enabled.
                    if (includeReasoning) {
                        const reasoningDeltas = extractReasoningTextsFromDelta(deltaObj);
                        if (reasoningDeltas.length > 0) {
                            if (!activeReasoningId) {
                                activeReasoningId = `reasoning-openai-${Date.now()}-${reasoningCounter++}`;
                                yield { type: "reasoning_start", reasoningId: activeReasoningId };
                            }
                            for (const reasoningText of reasoningDeltas) {
                                yield {
                                    type: "reasoning_delta",
                                    reasoningId: activeReasoningId,
                                    reasoningText,
                                };
                            }
                        }
                    }

                    // Accumulate plain text content
                    const delta = choice.delta?.content;
                    if (typeof delta === "string" && delta.length > 0) {
                        totalContent += delta;
                        yield {
                            type: "content",
                            content: delta,
                        };
                    }

                    // Accumulate tool calls incrementally
                    for (const tc of getToolCallDeltas(choice.delta)) {
                        const idx = tc.index;
                        if (!pendingToolCalls.has(idx)) {
                            pendingToolCalls.set(idx, { id: tc.id || "", name: "", arguments: "" });
                        }
                        const pending = pendingToolCalls.get(idx)!;
                        if (tc.id) pending.id = tc.id;
                        if (tc.function?.name) pending.name += tc.function.name;
                        if (tc.function?.arguments) pending.arguments += tc.function.arguments;
                    }
                    // Check finish reason
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
                        const parsedToolCalls: ToolCall[] = [];
                        for (const [, tc] of pendingToolCalls) {
                            if (!tc.id.trim() || !tc.name.trim()) {
                                yield buildStreamErrorChunk(createProviderTerminationError({ provider: this.name }));
                                pendingToolCalls.clear();
                                return;
                            }
                            const parsedArgs = parseToolArgs(tc.arguments, tc.name, "openai:stream");
                            if (!parsedArgs.success) {
                                yield buildStreamErrorChunk(parsedArgs.errorMeta);
                                pendingToolCalls.clear();
                                return;
                            }
                            parsedToolCalls.push({
                                id: tc.id,
                                name: tc.name,
                                arguments: parsedArgs.args,
                            });
                        }
                        for (const toolCall of parsedToolCalls) {
                            yield { type: "tool_call", toolCall };
                        }
                        sawTerminalFinish = true;
                        pendingToolCalls.clear();
                        // Do NOT yield done — the tool loop needs to continue
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
                        // Capture usage before yielding done
                        if (chunk.usage) {
                            usage = readUsage(chunk.usage);
                        }
                    }
                }

                // Capture usage data from the final chunk (may come in a separate chunk)
                if (chunk.usage) {
                    usage = readUsage(chunk.usage);
                }
            }

            if (activeReasoningId) {
                yield { type: "reasoning_end", reasoningId: activeReasoningId };
                activeReasoningId = null;
            }

            if (!sawTerminalFinish) {
                yield buildStreamErrorChunk(createProviderTerminationError({ provider: this.name }));
                return;
            }

            // Final chunk with actual usage from API
            yield {
                type: "done",
                content: totalContent,
                usage,
                actualModel: observedModel,
                actualModelSource: observedModel ? "provider" : undefined,
                actualProvider: this.id,
                actualDeliveryMode: observedDeliveryMode,
            };
        } catch (error) {
            if (normalizedOptions.signal?.aborted || isAbortLikeError(error)) {
                throw error;
            }
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
        systemPrompt?: string,
        imageInputs: ChatImageInput[] = [],
    ): OpenAI.Chat.ChatCompletionMessageParam[] {
        const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        const normalizedMessages = normalizeProviderMessages(messages).messages;
        let latestUserIndex = -1;
        normalizedMessages.forEach((message, index) => {
            if (message.role === "user") latestUserIndex = index;
        });

        // Add system prompt if provided
        if (systemPrompt) {
            result.push({ role: "system", content: systemPrompt });
        }

        // Convert messages
        for (const [messageIndex, msg] of normalizedMessages.entries()) {
            if (msg.role === "system") {
                result.push({ role: "system", content: msg.content });
            } else if (msg.role === "user") {
                if (messageIndex === latestUserIndex && imageInputs.length > 0) {
                    result.push({
                        role: "user",
                        content: [
                            { type: "text", text: msg.content },
                            ...imageInputs.map((image) => ({
                                type: "image_url" as const,
                                image_url: { url: image.dataUrl, detail: "auto" as const },
                            })),
                        ],
                    });
                } else {
                    result.push({ role: "user", content: msg.content });
                }
            } else if (msg.role === "assistant" && msg.toolCalls?.length) {
                // Assistant message with tool calls
                result.push({
                    role: "assistant",
                    content: msg.content || null,
                    tool_calls: msg.toolCalls.map((tc) => ({
                        id: tc.id,
                        type: "function" as const,
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.arguments),
                        },
                    })),
                });
            } else if (msg.role === "assistant") {
                result.push({ role: "assistant", content: msg.content });
            } else if (msg.role === "tool") {
                result.push({
                    role: "tool",
                    tool_call_id: msg.toolResultId!,
                    content: msg.content,
                });
            }
        }

        return result;
    }

    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        stream: true,
    ): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        stream: false,
    ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
    private buildRequestParams(
        messages: AIMessage[],
        options: NormalizedProviderChatOptions,
        stream: boolean,
    ): OpenAI.Chat.ChatCompletionCreateParams {
        const params: ExtendedChatCompletionParams = {
            model: options.providerModelId,
            messages: this.convertMessages(messages, options.systemPrompt, options.imageInputs),
            max_completion_tokens: options.maxTokens,
            reasoning_effort: mapReasoningEffort(options.reasoningEffort),
            service_tier: options.deliveryMode === "priority" ? "priority" : "default",
            ...(stream ? { stream: true as const, stream_options: { include_usage: true } } : {}),
        };

        if (options.temperature !== undefined) {
            params.temperature = options.temperature;
        }

        if (options.tools?.length) {
            params.tools = options.tools.map((t) => ({
                type: "function" as const,
                function: { name: t.name, description: t.description, parameters: t.parameters as OpenAI.FunctionParameters },
            }));
        }

        return params as unknown as OpenAI.Chat.ChatCompletionCreateParams;
    }
}

// Singleton instance
let openaiProvider: OpenAIProvider | null = null;

export function getOpenAIProvider(): OpenAIProvider {
    if (!openaiProvider) {
        openaiProvider = new OpenAIProvider();
    }
    return openaiProvider;
}
