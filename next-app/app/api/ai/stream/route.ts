/**
 * AI Chat Streaming API Route
 * Handles streaming chat responses
 * Uses Node runtime for Prisma compatibility
 */

import { NextRequest } from "next/server";
import { getAIService } from "@/lib/server/ai";
import type { AIMessage, ChatOptions, ConversationContext } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import { normalizeStreamChunk, toWireChunk, type RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";
import { ChatRuntime } from "@/lib/server/chat-runtime/runtime";
import { RuntimeThreadContext } from "@/lib/server/chat-runtime/thread";

// Force Node runtime for Prisma compatibility
export const runtime = "nodejs";

const STREAM_EVENT_TYPES: RuntimeStreamEvent["type"][] = [
    "content",
    "reasoning_start",
    "reasoning_delta",
    "reasoning_end",
    "tool_call",
    "tool_result",
    "done",
    "error",
    "artifact",
    "progress",
    "checkpoint",
    "run_start",
    "run_end",
    "conversation_title",
    "choices",
    "plan_step_update",
];

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, userMessage, context, options, planId, selectedSteps } = body as {
            messages?: AIMessage[];
            userMessage?: string;
            context?: ConversationContext;
            options?: ChatOptions & { projectId?: string; studyId?: string; userId?: string; agentMode?: AgentMode; page?: string; section?: string; planId?: string };
            planId?: string;
            selectedSteps?: number[];
        };

        const service = getAIService();

        // Create a readable stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const runtimeRouter = new ChatRuntime();
                const thread = new RuntimeThreadContext((event) => {
                    const data = JSON.stringify(toWireChunk(event)) + "\n";
                    controller.enqueue(encoder.encode(data));
                });
                runtimeRouter.use(async ({ event, thread: runtimeThread }, next) => {
                    if (event.conversationId) runtimeThread.bindConversation(event.conversationId);
                    if (event.type === "run_start" && event.runId) runtimeThread.bindRun(event.runId);
                    if (event.type === "run_end") runtimeThread.bindRun(undefined);
                    await next();
                });
                for (const eventType of STREAM_EVENT_TYPES) {
                    runtimeRouter.on(eventType, async ({ event, thread: runtimeThread }) => {
                        await runtimeThread.emit(event);
                    });
                }

                try {
                    // If using conversation memory — use artifact-aware streaming
                    if ((userMessage || planId) && context) {
                        const mergedPlanId = planId ?? options?.planId;
                        for await (const chunk of service.streamChatWithArtifacts(
                            userMessage || "", context, { ...options, planId: mergedPlanId, selectedSteps, signal: request.signal }
                        )) {
                            const normalized = normalizeStreamChunk(chunk);
                            if (!normalized) continue;
                            await runtimeRouter.dispatch(normalized, thread);
                        }
                    }
                    // Direct message streaming
                    else if (messages && messages.length > 0) {
                        for await (const chunk of service.streamChat(messages, { ...options, signal: request.signal })) {
                            const normalized = normalizeStreamChunk(chunk);
                            if (!normalized) continue;
                            await runtimeRouter.dispatch(normalized, thread);
                        }
                    } else {
                        await runtimeRouter.dispatch({ type: "error", error: "No messages provided" }, thread);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error";
                    await runtimeRouter.dispatch({ type: "error", error: errorMessage }, thread);
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
