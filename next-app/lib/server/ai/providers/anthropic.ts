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
import type { AIMessage, AIModel, AIResponse, ChatOptions, AIStreamChunk, ToolCall, ReasoningMode } from "@/types/ai";
import { BaseAIProvider } from "./base";
import { AI_CONFIG, AVAILABLE_MODELS } from "@/lib/ai/config";
import { parseToolArgs } from "../json-repair";
import { extractProviderErrorMetadata } from "./error-metadata";
import { normalizeProviderMessages } from "./message-normalization";
const MAX_REASONING_BUDGET_TOKENS = 32768;

export function computeAnthropicThinkingBudget(
    maxTokens: number,
    requestedBudgetTokens?: number,
    reasoningMode?: ReasoningMode,
): number | null {
    const safeMaxTokens = Number.isFinite(maxTokens) ? Math.max(0, Math.floor(maxTokens)) : AI_CONFIG.defaultMaxTokens;
    if (safeMaxTokens <= 1) return null;

    const modeDefault = reasoningMode === "summary" ? 512 : 1024;
    const requested = Number.isFinite(requestedBudgetTokens as number)
        ? Math.floor(requestedBudgetTokens as number)
        : modeDefault;

    const boundedRequested = Math.min(MAX_REASONING_BUDGET_TOKENS, Math.max(1, requested));
    return Math.min(boundedRequested, safeMaxTokens - 1);
}

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
        const maxTokens = options?.maxTokens ?? AI_CONFIG.defaultMaxTokens;

        const { system, messages: anthropicMessages } = this.convertMessages(messages, options?.systemPrompt);

        const params: Anthropic.MessageCreateParams = {
            model,
            max_tokens: maxTokens,
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

        // Anthropic extended thinking is opt-in.
        // Keep budget bounded to prevent runaway token spend.
        if (options?.includeReasoning) {
            const thinkingBudget = computeAnthropicThinkingBudget(
                maxTokens,
                options.reasoningBudgetTokens,
                options.reasoningMode,
            );
            if (thinkingBudget && thinkingBudget > 0) {
                params.thinking = {
                    type: "enabled",
                    budget_tokens: thinkingBudget,
                } as Anthropic.ThinkingConfigParam;
            }
        }

        let totalContent = "";
        let inputTokens = 0;
        let outputTokens = 0;

        const activeBlocks = new Map<number, {
            kind: "tool";
            id: string;
            name: string;
            args: string;
        } | {
            kind: "reasoning";
            reasoningId: string;
        }>();

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
                        const idx = typeof event.index === "number" ? event.index : -1;
                        if (event.content_block.type === "tool_use") {
                            activeBlocks.set(idx, {
                                kind: "tool",
                                id: event.content_block.id,
                                name: event.content_block.name,
                                args: "",
                            });
                        } else if (event.content_block.type === "thinking") {
                            const reasoningId = `reasoning-${idx >= 0 ? idx : Date.now()}`;
                            activeBlocks.set(idx, { kind: "reasoning", reasoningId });
                            yield { type: "reasoning_start", reasoningId };
                        } else if ((event.content_block as { type?: string }).type === "redacted_thinking") {
                            const reasoningId = `reasoning-${idx >= 0 ? idx : Date.now()}`;
                            activeBlocks.set(idx, { kind: "reasoning", reasoningId });
                            yield { type: "reasoning_start", reasoningId };
                            yield {
                                type: "reasoning_delta",
                                reasoningId,
                                reasoningText: "[Reasoning hidden by provider]",
                            };
                        }
                        break;
                    }

                    case "content_block_delta": {
                        const idx = typeof event.index === "number" ? event.index : -1;
                        const activeBlock = activeBlocks.get(idx);
                        if (event.delta.type === "text_delta") {
                            totalContent += event.delta.text;
                            yield {
                                type: "content",
                                content: event.delta.text,
                            };
                        } else if (event.delta.type === "input_json_delta") {
                            if (activeBlock?.kind === "tool") {
                                activeBlock.args += event.delta.partial_json;
                            }
                        } else if ((event.delta as { type?: string }).type === "thinking_delta") {
                            const thinkingText = (event.delta as { thinking?: string }).thinking ?? "";
                            if (activeBlock?.kind === "reasoning" && thinkingText) {
                                yield {
                                    type: "reasoning_delta",
                                    reasoningId: activeBlock.reasoningId,
                                    reasoningText: thinkingText,
                                };
                            }
                        }
                        break;
                    }

                    case "content_block_stop": {
                        const idx = typeof event.index === "number" ? event.index : -1;
                        const activeBlock = activeBlocks.get(idx);
                        if (!activeBlock) break;

                        if (activeBlock.kind === "tool") {
                            const toolCall: ToolCall = {
                                id: activeBlock.id,
                                name: activeBlock.name,
                                arguments: parseToolArgs(activeBlock.args, activeBlock.name, "anthropic:stream"),
                            };
                            yield { type: "tool_call", toolCall };
                        } else if (activeBlock.kind === "reasoning") {
                            yield {
                                type: "reasoning_end",
                                reasoningId: activeBlock.reasoningId,
                            };
                        }
                        activeBlocks.delete(idx);
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
    ): { system: string | undefined; messages: Anthropic.MessageParam[] } {
        const systemParts: string[] = [];
        const result: Anthropic.MessageParam[] = [];
        const normalizedMessages = normalizeProviderMessages(messages).messages;

        if (systemPrompt) {
            systemParts.push(systemPrompt);
        }

        for (const msg of normalizedMessages) {
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
