/**
 * xAI Provider
 * OpenAI-compatible API — reuses the openai npm package with a custom baseURL
 */

import OpenAI from "openai";
import type { AIMessage, AIModel, AIResponse, ChatOptions, AIStreamChunk, ToolCall } from "@/types/ai";
import { BaseAIProvider } from "./base";
import { AVAILABLE_MODELS } from "@/lib/ai/config";
import { parseToolArgs } from "../json-repair";
import { AIErrorWithEnvelope, buildStreamErrorChunk } from "@/lib/ai/error-envelope";
import { extractProviderErrorMetadata } from "./error-metadata";
import { normalizeProviderMessages } from "./message-normalization";
import { extractReasoningTextsFromDelta } from "./reasoning-delta";
import { normalizeChatOptionsForModel } from "../request-policy";
import { toAIErrorEnvelope } from "../error-classification";
import { getToolCallDeltas } from "./tool-call-delta";
import { isAbortLikeError } from "@/lib/abort";
import {
    createProviderTerminationError,
    isCompatibleSuccessFinishReason,
} from "./stream-termination";

export class XAIProvider extends BaseAIProvider {
    readonly id = "xai";
    readonly name = "xAI";
    readonly models: AIModel[] = AVAILABLE_MODELS.xai as unknown as AIModel[];

    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (!this.client) {
            const apiKey = process.env.XAI_API_KEY;
            if (!apiKey) {
                throw new Error("XAI_API_KEY environment variable is not set");
            }
            this.client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
        }
        return this.client;
    }

    isConfigured(): boolean {
        return !!process.env.XAI_API_KEY;
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
            const parsedArgs = parseToolArgs(tc.function.arguments, tc.function.name, "xai");
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
            usage: {
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
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
        let sawTerminalFinish = false;

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
                                activeReasoningId = `reasoning-xai-${Date.now()}-${reasoningCounter++}`;
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

                    const delta = choice.delta?.content;
                    if (typeof delta === "string" && delta.length > 0) {
                        totalContent += delta;
                        yield {
                            type: "content",
                            content: delta,
                        };
                    }

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
                            const parsedArgs = parseToolArgs(tc.arguments, tc.name, "xai:stream");
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
                        if (chunk.usage) {
                            usage = {
                                inputTokens: chunk.usage.prompt_tokens,
                                outputTokens: chunk.usage.completion_tokens,
                                totalTokens: chunk.usage.total_tokens,
                            };
                        }
                    }
                }

                if (chunk.usage) {
                    usage = {
                        inputTokens: chunk.usage.prompt_tokens,
                        outputTokens: chunk.usage.completion_tokens,
                        totalTokens: chunk.usage.total_tokens,
                    };
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

            yield {
                type: "done",
                content: totalContent,
                usage,
                actualModel: observedModel,
                actualModelSource: observedModel ? "provider" : undefined,
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
        systemPrompt?: string
    ): OpenAI.Chat.ChatCompletionMessageParam[] {
        const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        const normalizedMessages = normalizeProviderMessages(messages).messages;

        if (systemPrompt) {
            result.push({ role: "system", content: systemPrompt });
        }

        for (const msg of normalizedMessages) {
            if (msg.role === "system") {
                result.push({ role: "system", content: msg.content });
            } else if (msg.role === "user") {
                result.push({ role: "user", content: msg.content });
            } else if (msg.role === "assistant" && msg.toolCalls?.length) {
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
let xaiProvider: XAIProvider | null = null;

export function getXAIProvider(): XAIProvider {
    if (!xaiProvider) {
        xaiProvider = new XAIProvider();
    }
    return xaiProvider;
}
