/**
 * OpenAI Provider
 * Implementation using OpenAI's Chat Completions API with streaming support
 * Includes actual token usage tracking via stream_options
 */

import OpenAI from "openai";
import type { AIMessage, AIModel, AIResponse, ChatOptions, AIStreamChunk, ToolCall } from "@/types/ai";
import { BaseAIProvider } from "./base";
import { AVAILABLE_MODELS } from "@/lib/ai/config";
import { parseToolArgs } from "../json-repair";
import { AIErrorWithEnvelope, buildStreamErrorChunk } from "@/lib/ai/error-envelope";
import { isAbortLikeError } from "@/lib/ai/abort";
import { extractProviderErrorMetadata } from "./error-metadata";
import { normalizeProviderMessages } from "./message-normalization";
import { extractReasoningTextsFromDelta } from "./reasoning-delta";
import { normalizeChatOptionsForModel } from "../request-policy";
import { toAIErrorEnvelope } from "../error-classification";
import { getToolCallDeltas } from "./tool-call-delta";

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

        return {
            id: response.id,
            content: choice.message.content || "",
            model: response.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
                cachedInputTokens: (response.usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
                    ?.prompt_tokens_details?.cached_tokens,
            },
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
        const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
        const includeReasoning = normalizedOptions.includeReasoning;
        let activeReasoningId: string | null = null;
        let reasoningCounter = 0;

        try {
            for await (const chunk of stream) {
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
                    if (choice.finish_reason === "tool_calls") {
                        if (activeReasoningId) {
                            yield { type: "reasoning_end", reasoningId: activeReasoningId };
                            activeReasoningId = null;
                        }
                        const parsedToolCalls: ToolCall[] = [];
                        for (const [, tc] of pendingToolCalls) {
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
                        pendingToolCalls.clear();
                        // Do NOT yield done — the tool loop needs to continue
                    } else if (choice.finish_reason === "stop") {
                        if (activeReasoningId) {
                            yield { type: "reasoning_end", reasoningId: activeReasoningId };
                            activeReasoningId = null;
                        }
                        // Capture usage before yielding done
                        if (chunk.usage) {
                            usage = {
                                inputTokens: chunk.usage.prompt_tokens,
                                outputTokens: chunk.usage.completion_tokens,
                                totalTokens: chunk.usage.total_tokens,
                                cachedInputTokens: (chunk.usage as { prompt_tokens_details?: { cached_tokens?: number } })
                                    .prompt_tokens_details?.cached_tokens,
                            };
                        }
                    }
                }

                // Capture usage data from the final chunk (may come in a separate chunk)
                if (chunk.usage) {
                    usage = {
                        inputTokens: chunk.usage.prompt_tokens,
                        outputTokens: chunk.usage.completion_tokens,
                        totalTokens: chunk.usage.total_tokens,
                        cachedInputTokens: (chunk.usage as { prompt_tokens_details?: { cached_tokens?: number } })
                            .prompt_tokens_details?.cached_tokens,
                    };
                }
            }

            if (activeReasoningId) {
                yield { type: "reasoning_end", reasoningId: activeReasoningId };
                activeReasoningId = null;
            }

            // Final chunk with actual usage from API
            yield {
                type: "done",
                content: totalContent,
                usage,
                actualModel: observedModel,
                actualModelSource: observedModel ? "provider" : undefined,
            };
        } catch (error) {
            if (isAbortLikeError(error)) {
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
        systemPrompt?: string
    ): OpenAI.Chat.ChatCompletionMessageParam[] {
        const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        const normalizedMessages = normalizeProviderMessages(messages).messages;

        // Add system prompt if provided
        if (systemPrompt) {
            result.push({ role: "system", content: systemPrompt });
        }

        // Convert messages
        for (const msg of normalizedMessages) {
            if (msg.role === "system") {
                result.push({ role: "system", content: msg.content });
            } else if (msg.role === "user") {
                result.push({ role: "user", content: msg.content });
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
        options: ChatOptions & { model: string; maxTokens: number; includeReasoning: boolean },
        stream: true,
    ): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
    private buildRequestParams(
        messages: AIMessage[],
        options: ChatOptions & { model: string; maxTokens: number; includeReasoning: boolean },
        stream: false,
    ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
    private buildRequestParams(
        messages: AIMessage[],
        options: ChatOptions & { model: string; maxTokens: number; includeReasoning: boolean },
        stream: boolean,
    ): OpenAI.Chat.ChatCompletionCreateParams {
        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            model: options.model,
            messages: this.convertMessages(messages, options.systemPrompt),
            max_completion_tokens: options.maxTokens,
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

        return params;
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
