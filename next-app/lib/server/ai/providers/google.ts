/**
 * Google Gemini Provider
 * OpenAI-compatible API — reuses the openai npm package with a custom baseURL
 */

import OpenAI from "openai";
import type { AIMessage, AIModel, AIResponse, ChatOptions, AIStreamChunk, ToolCall } from "@/types/ai";
import { BaseAIProvider } from "./base";
import { AI_CONFIG, AVAILABLE_MODELS } from "@/lib/ai/config";
import { parseToolArgs } from "../json-repair";
import { extractProviderErrorMetadata } from "./error-metadata";
import { normalizeProviderMessages } from "./message-normalization";

export class GoogleProvider extends BaseAIProvider {
    readonly id = "google";
    readonly name = "Google";
    readonly models: AIModel[] = AVAILABLE_MODELS.google as unknown as AIModel[];

    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (!this.client) {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error("GEMINI_API_KEY environment variable is not set");
            }
            this.client = new OpenAI({
                apiKey,
                baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
            });
        }
        return this.client;
    }

    isConfigured(): boolean {
        return !!process.env.GEMINI_API_KEY;
    }

    async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
        const client = this.getClient();
        const model = options?.model || AI_CONFIG.defaultModel;

        const openaiMessages = this.convertMessages(messages, options?.systemPrompt);

        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            model,
            messages: openaiMessages,
            temperature: options?.temperature ?? AI_CONFIG.defaultTemperature,
            max_completion_tokens: options?.maxTokens ?? AI_CONFIG.defaultMaxTokens,
        };

        if (options?.tools?.length) {
            params.tools = options.tools.map((t) => ({
                type: "function" as const,
                function: { name: t.name, description: t.description, parameters: t.parameters as OpenAI.FunctionParameters },
            }));
        }

        const response = await client.chat.completions.create(params, { signal: options?.signal });

        const choice = response.choices[0];

        return {
            id: response.id,
            content: choice.message.content || "",
            model: response.model,
            toolCalls: choice.message.tool_calls
                ?.filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
                .map((tc) => ({
                    id: tc.id,
                    name: tc.function.name,
                    arguments: parseToolArgs(tc.function.arguments, tc.function.name, "google"),
                })),
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
        const model = options?.model || AI_CONFIG.defaultModel;

        const openaiMessages = this.convertMessages(messages, options?.systemPrompt);

        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            model,
            messages: openaiMessages,
            temperature: options?.temperature ?? AI_CONFIG.defaultTemperature,
            max_completion_tokens: options?.maxTokens ?? AI_CONFIG.defaultMaxTokens,
            stream: true,
            stream_options: { include_usage: true },
        };

        if (options?.tools?.length) {
            params.tools = options.tools.map((t) => ({
                type: "function" as const,
                function: { name: t.name, description: t.description, parameters: t.parameters as OpenAI.FunctionParameters },
            }));
        }

        const stream = await client.chat.completions.create(params, { signal: options?.signal });

        let totalContent = "";
        let usage: AIStreamChunk["usage"] | undefined;
        const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();

        try {
            for await (const chunk of stream) {
                const choice = chunk.choices[0];

                if (choice) {
                    const delta = choice.delta?.content;
                    if (delta) {
                        totalContent += delta;
                        yield {
                            type: "content",
                            content: delta,
                        };
                    }

                    const toolCallDeltas = (choice.delta as any)?.tool_calls;
                    if (toolCallDeltas) {
                        for (const tc of toolCallDeltas) {
                            const idx = tc.index;
                            if (!pendingToolCalls.has(idx)) {
                                pendingToolCalls.set(idx, { id: tc.id || "", name: "", arguments: "" });
                            }
                            const pending = pendingToolCalls.get(idx)!;
                            if (tc.id) pending.id = tc.id;
                            if (tc.function?.name) pending.name += tc.function.name;
                            if (tc.function?.arguments) pending.arguments += tc.function.arguments;
                        }
                    }

                    if (choice.finish_reason === "tool_calls") {
                        for (const [, tc] of pendingToolCalls) {
                            const toolCall: ToolCall = {
                                id: tc.id,
                                name: tc.name,
                                arguments: parseToolArgs(tc.arguments, tc.name, "google:stream"),
                            };
                            yield { type: "tool_call", toolCall };
                        }
                        pendingToolCalls.clear();
                    } else if (choice.finish_reason === "stop") {
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

            yield {
                type: "done",
                content: totalContent,
                usage,
            };
        } catch (error) {
            const metadata = extractProviderErrorMetadata(error);
            yield {
                type: "error",
                error: error instanceof Error ? error.message : "Unknown streaming error",
                ...metadata,
            };
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
}

// Singleton instance
let googleProvider: GoogleProvider | null = null;

export function getGoogleProvider(): GoogleProvider {
    if (!googleProvider) {
        googleProvider = new GoogleProvider();
    }
    return googleProvider;
}
