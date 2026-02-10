/**
 * AI Chat Streaming API Route
 * Handles streaming chat responses
 * Uses Node runtime for Prisma compatibility
 */

import { NextRequest } from "next/server";
import { getAIService } from "@/lib/server/ai";
import type { AIMessage, ChatOptions, ConversationContext } from "@/types/ai";
import type { AgentMode } from "@/types/agent";

// Force Node runtime for Prisma compatibility
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, userMessage, context, options, planId } = body as {
            messages?: AIMessage[];
            userMessage?: string;
            context?: ConversationContext;
            options?: ChatOptions & { projectId?: string; studyId?: string; userId?: string; agentMode?: AgentMode; page?: string; section?: string };
            planId?: string;
        };

        const service = getAIService();

        // Create a readable stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // If using conversation memory — use artifact-aware streaming
                    if (userMessage && context) {
                        for await (const chunk of service.streamChatWithArtifacts(
                            userMessage, context, { ...options, planId, signal: request.signal }
                        )) {
                            const data = JSON.stringify(chunk) + "\n";
                            controller.enqueue(encoder.encode(data));
                        }
                    }
                    // Direct message streaming
                    else if (messages && messages.length > 0) {
                        for await (const chunk of service.streamChat(messages, { ...options, signal: request.signal })) {
                            const data = JSON.stringify(chunk) + "\n";
                            controller.enqueue(encoder.encode(data));
                        }
                    } else {
                        controller.enqueue(
                            encoder.encode(JSON.stringify({ type: "error", error: "No messages provided" }) + "\n")
                        );
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error";
                    controller.enqueue(
                        encoder.encode(JSON.stringify({ type: "error", error: errorMessage }) + "\n")
                    );
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("AI stream error:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
