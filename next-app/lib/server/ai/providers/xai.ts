/**
 * Direct xAI adapter using the recommended Responses API.
 */

import OpenAI from "openai";
import type { AIModel, ReasoningEffort } from "@/types/ai";
import { AVAILABLE_MODELS } from "@/lib/ai/config";
import type { NormalizedProviderChatOptions } from "../request-policy";
import { ResponsesAPIProvider } from "./responses-api";

export class XAIProvider extends ResponsesAPIProvider {
    readonly id = "xai";
    readonly name = "xAI";
    readonly models: AIModel[] = AVAILABLE_MODELS.xai as unknown as AIModel[];

    private client: OpenAI | null = null;

    protected getClient(): OpenAI {
        if (!this.client) {
            const apiKey = process.env.XAI_API_KEY;
            if (!apiKey) {
                throw new Error("XAI_API_KEY environment variable is not set");
            }
            this.client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
        }
        return this.client;
    }

    protected mapReasoningEffort(effort: ReasoningEffort): "low" | "medium" | "high" {
        if (effort === "fast" || effort === "low") return "low";
        if (effort === "max") return "high";
        return effort;
    }

    protected buildProviderRequestParams(
        options: NormalizedProviderChatOptions,
    ): { prompt_cache_key?: string } {
        const conversationId = options.conversationId?.trim();
        return conversationId ? { prompt_cache_key: conversationId } : {};
    }

    isConfigured(): boolean {
        return !!process.env.XAI_API_KEY;
    }
}

let xaiProvider: XAIProvider | null = null;

export function getXAIProvider(): XAIProvider {
    if (!xaiProvider) xaiProvider = new XAIProvider();
    return xaiProvider;
}
