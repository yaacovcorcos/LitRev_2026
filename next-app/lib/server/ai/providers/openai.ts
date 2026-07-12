/**
 * Direct OpenAI adapter.
 *
 * GPT-5.6 reasoning and tool workflows use the Responses API. Chat
 * Completions rejects function tools combined with reasoning_effort for these
 * models and does not preserve typed reasoning items across tool turns.
 */

import OpenAI from "openai";
import type { AIModel, ReasoningEffort } from "@/types/ai";
import { AVAILABLE_MODELS } from "@/lib/ai/config";
import { ResponsesAPIProvider } from "./responses-api";

export class OpenAIProvider extends ResponsesAPIProvider {
    readonly id = "openai";
    readonly name = "OpenAI";
    readonly models: AIModel[] = AVAILABLE_MODELS.openai as unknown as AIModel[];

    private client: OpenAI | null = null;

    protected getClient(): OpenAI {
        if (!this.client) {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                throw new Error("OPENAI_API_KEY environment variable is not set");
            }
            this.client = new OpenAI({ apiKey });
        }
        return this.client;
    }

    protected mapReasoningEffort(
        effort: ReasoningEffort,
    ): "none" | "low" | "medium" | "high" | "max" {
        return effort === "fast" ? "none" : effort;
    }

    isConfigured(): boolean {
        return !!process.env.OPENAI_API_KEY;
    }
}

let openaiProvider: OpenAIProvider | null = null;

export function getOpenAIProvider(): OpenAIProvider {
    if (!openaiProvider) openaiProvider = new OpenAIProvider();
    return openaiProvider;
}
