/**
 * Base AI Provider
 * Abstract class that all AI providers must implement
 */

import type { AIMessage, AIModel, AIResponse, ChatOptions, AIStreamChunk } from "@/types/ai";

export abstract class BaseAIProvider {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly models: AIModel[];

    /**
     * Send a chat request and get a complete response
     */
    abstract chat(
        messages: AIMessage[],
        options?: ChatOptions
    ): Promise<AIResponse>;

    /**
     * Send a chat request and stream the response
     */
    abstract streamChat(
        messages: AIMessage[],
        options?: ChatOptions
    ): AsyncIterable<AIStreamChunk>;

    /**
     * Check if the provider is properly configured
     */
    abstract isConfigured(): boolean;

    /**
     * Get the default model for this provider
     */
    getDefaultModel(): AIModel {
        return this.models[0];
    }

    /**
     * Get a model by ID
     */
    getModel(modelId: string): AIModel | undefined {
        return this.models.find((m) => m.id === modelId);
    }
}
