/**
 * OpenAI Provider
 * Implementation using OpenAI's Chat Completions API with streaming support
 * Includes actual token usage tracking via stream_options
 */

import OpenAI from "openai";
import type { AIMessage, AIModel, AIResponse, ChatOptions, AIStreamChunk } from "@/types/ai";
import { BaseAIProvider } from "./base";
import { AI_CONFIG, AVAILABLE_MODELS } from "@/lib/ai/config";

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
        const model = options?.model || AI_CONFIG.defaultModel;

        // Convert our messages to OpenAI format
        const openaiMessages = this.convertMessages(messages, options?.systemPrompt);

        const response = await client.chat.completions.create({
            model,
            messages: openaiMessages,
            temperature: options?.temperature ?? AI_CONFIG.defaultTemperature,
            max_completion_tokens: options?.maxTokens ?? AI_CONFIG.defaultMaxTokens,
        });

        const choice = response.choices[0];

        return {
            id: response.id,
            content: choice.message.content || "",
            model: response.model,
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

        const stream = await client.chat.completions.create({
            model,
            messages: openaiMessages,
            temperature: options?.temperature ?? AI_CONFIG.defaultTemperature,
            max_completion_tokens: options?.maxTokens ?? AI_CONFIG.defaultMaxTokens,
            stream: true,
            stream_options: { include_usage: true },
        });

        let totalContent = "";
        let usage: AIStreamChunk["usage"] | undefined;

        try {
            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content;
                if (delta) {
                    totalContent += delta;
                    yield {
                        type: "content",
                        content: delta,
                    };
                }

                // Capture usage data from the final chunk
                if (chunk.usage) {
                    usage = {
                        inputTokens: chunk.usage.prompt_tokens,
                        outputTokens: chunk.usage.completion_tokens,
                        totalTokens: chunk.usage.total_tokens,
                    };
                }
            }

            // Final chunk with actual usage from API
            yield {
                type: "done",
                content: totalContent,
                usage,
            };
        } catch (error) {
            yield {
                type: "error",
                error: error instanceof Error ? error.message : "Unknown streaming error",
            };
        }
    }

    private convertMessages(
        messages: AIMessage[],
        systemPrompt?: string
    ): OpenAI.Chat.ChatCompletionMessageParam[] {
        const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

        // Add system prompt if provided
        if (systemPrompt) {
            result.push({ role: "system", content: systemPrompt });
        }

        // Convert messages
        for (const msg of messages) {
            if (msg.role === "system") {
                result.push({ role: "system", content: msg.content });
            } else if (msg.role === "user") {
                result.push({ role: "user", content: msg.content });
            } else if (msg.role === "assistant") {
                result.push({ role: "assistant", content: msg.content });
            }
            // Skip tool messages for now
        }

        return result;
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
