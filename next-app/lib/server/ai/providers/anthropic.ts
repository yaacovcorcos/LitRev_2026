/**
 * Anthropic Provider
 * Implementation using Anthropic's Messages API with streaming support
 *
 * Key API differences from OpenAI:
 * - System prompt is a top-level `system` param, not in the messages array
 * - Only `user` and `assistant` roles in messages
 * - Tool results are sent as role: "user" with content: [{ type: "tool_result" }]
 * - Tool calls are content blocks with type: "tool_use" (not function wrappers)
 * - Tool schemas use `input_schema` instead of `parameters`
 * - Streaming uses content_block_start/content_block_delta/message_delta events
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AIMessage, AIModel, AIResponse, ChatOptions, AIStreamChunk, ToolCall } from "@/types/ai";
import { BaseAIProvider } from "./base";
import { AI_CONFIG, AVAILABLE_MODELS } from "@/lib/ai/config";
import { parseToolArgs } from "../json-repair";

export class AnthropicProvider extends BaseAIProvider {
    readonly id = "anthropic";
    readonly name = "Anthropic";
    readonly models: AIModel[] = AVAILABLE_MODELS.anthropic as unknown as AIModel[];

    private client: Anthropic | null = null;

    private getClient(): Anthropic {
        if (!this.client) {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                throw new Error("ANTHROPIC_API_KEY environment variable is not set");
            }
            this.client = new Anthropic({ apiKey });
        }
        return this.client;
    }

    isConfigured(): boolean {
        return !!process.env.ANTHROPIC_API_KEY;
    }

    async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
        const client = this.getClient();
        const model = options?.model || AI_CONFIG.defaultModel;

        const { system, messages: anthropicMessages } = this.convertMessages(messages, options?.systemPrompt);

        const params: Anthropic.MessageCreateParams = {
            model,
            max_tokens: options?.maxTokens ?? AI_CONFIG.defaultMaxTokens,
            messages: anthropicMessages,
        };

        if (system) {
            params.system = system;
        }

        if (options?.temperature !== undefined) {
            params.temperature = options.temperature;
        }

        if (options?.tools?.length) {
            params.tools = options.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters as Anthropic.Tool["input_schema"],
            }));
        }

        // Pass AbortSignal through so callers can cancel in-flight requests.
        const response = await client.messages.create(params, { signal: options?.signal } as any);

        let content = "";
        const toolCalls: ToolCall[] = [];

        for (const block of response.content) {
            if (block.type === "text") {
                content += block.text;
            } else if (block.type === "tool_use") {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    arguments: block.input as Record<string, unknown>,
                });
            }
        }

        return {
            id: response.id,
            content,
            model: response.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            },
        };
    }

    async *streamChat(
        messages: AIMessage[],
        options?: ChatOptions
    ): AsyncIterable<AIStreamChunk> {
        const client = this.getClient();
        const model = options?.model || AI_CONFIG.defaultModel;

        const { system, messages: anthropicMessages } = this.convertMessages(messages, options?.systemPrompt);

        const params: Anthropic.MessageCreateParams = {
            model,
            max_tokens: options?.maxTokens ?? AI_CONFIG.defaultMaxTokens,
            messages: anthropicMessages,
            stream: true,
        };

        if (system) {
            params.system = system;
        }

        if (options?.temperature !== undefined) {
            params.temperature = options.temperature;
        }

        if (options?.tools?.length) {
            params.tools = options.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters as Anthropic.Tool["input_schema"],
            }));
        }

        let totalContent = "";
        let inputTokens = 0;
        let outputTokens = 0;

        // Track tool use blocks being assembled
        let currentToolId = "";
        let currentToolName = "";
        let currentToolArgs = "";
        let hasToolCalls = false;

        try {
            // Pass AbortSignal through so callers can cancel in-flight streaming requests.
            const stream = await client.messages.create(params, { signal: options?.signal } as any);

            for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
                switch (event.type) {
                    case "message_start": {
                        if (event.message.usage) {
                            inputTokens = event.message.usage.input_tokens;
                        }
                        break;
                    }

                    case "content_block_start": {
                        if (event.content_block.type === "tool_use") {
                            currentToolId = event.content_block.id;
                            currentToolName = event.content_block.name;
                            currentToolArgs = "";
                            hasToolCalls = true;
                        }
                        break;
                    }

                    case "content_block_delta": {
                        if (event.delta.type === "text_delta") {
                            totalContent += event.delta.text;
                            yield {
                                type: "content",
                                content: event.delta.text,
                            };
                        } else if (event.delta.type === "input_json_delta") {
                            currentToolArgs += event.delta.partial_json;
                        }
                        break;
                    }

                    case "content_block_stop": {
                        // If we were assembling a tool call, yield it now
                        if (currentToolId) {
                            const toolCall: ToolCall = {
                                id: currentToolId,
                                name: currentToolName,
                                arguments: parseToolArgs(currentToolArgs, currentToolName, "anthropic:stream"),
                            };
                            yield { type: "tool_call", toolCall };
                            currentToolId = "";
                            currentToolName = "";
                            currentToolArgs = "";
                        }
                        break;
                    }

                    case "message_delta": {
                        if (event.usage) {
                            outputTokens = event.usage.output_tokens;
                        }
                        // Only yield done if the model stopped naturally (not for tool_use)
                        // The tool loop in AIService handles continuation
                        break;
                    }
                }
            }

            const usage = {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
            };

            // Always yield done — the tool loop checks for tool_call chunks
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
    ): { system: string | undefined; messages: Anthropic.MessageParam[] } {
        const systemParts: string[] = [];
        const result: Anthropic.MessageParam[] = [];

        if (systemPrompt) {
            systemParts.push(systemPrompt);
        }

        for (const msg of messages) {
            if (msg.role === "system") {
                systemParts.push(msg.content);
            } else if (msg.role === "user") {
                result.push({ role: "user", content: msg.content });
            } else if (msg.role === "assistant" && msg.toolCalls?.length) {
                // Assistant message with tool use blocks
                const content: Anthropic.ContentBlockParam[] = [];
                if (msg.content) {
                    content.push({ type: "text", text: msg.content });
                }
                for (const tc of msg.toolCalls) {
                    content.push({
                        type: "tool_use",
                        id: tc.id,
                        name: tc.name,
                        input: tc.arguments,
                    });
                }
                result.push({ role: "assistant", content });
            } else if (msg.role === "assistant") {
                result.push({ role: "assistant", content: msg.content });
            } else if (msg.role === "tool") {
                // Tool results go as user messages with tool_result content blocks
                result.push({
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: msg.toolResultId!,
                            content: msg.content,
                        },
                    ],
                });
            }
        }

        return {
            system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
            messages: result,
        };
    }
}

// Singleton instance
let anthropicProvider: AnthropicProvider | null = null;

export function getAnthropicProvider(): AnthropicProvider {
    if (!anthropicProvider) {
        anthropicProvider = new AnthropicProvider();
    }
    return anthropicProvider;
}
