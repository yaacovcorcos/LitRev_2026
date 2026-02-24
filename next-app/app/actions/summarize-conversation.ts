"use server";

import { prisma } from "@/lib/server/prisma";
import { getAIService } from "@/lib/server/ai";
import type { AIMessage } from "@/types/ai";
import { withAction, type ActionResult } from "@/lib/server/action-utils";

const SUMMARIZE_PROMPT = `You are summarizing a conversation between a researcher and an AI assistant working on a systematic literature review.

Produce a structured summary:
1. **Summary**: 2-3 sentences covering what was discussed. Note what phase of the review it relates to (protocol, search, screening, drafting, QA, or general).
2. **Key Points**: 3-6 single-sentence bullet points. Prioritize: studies discussed, screening decisions, methodological choices, and protocol refinements.
3. **Decisions Made**: Explicit decisions or choices the user committed to.
4. **Follow-up Needed**: Outstanding items. If the conversation ended mid-task (e.g., criteria discussed but not applied to unscreened studies), infer the follow-up.

Return ONLY valid JSON:
{
  "summary": "...",
  "keyPoints": ["..."],
  "decisions": ["..."],
  "followUpNeeded": ["..."]
}

Keep the total output under 400 words.`;

type SummarizeResult = {
    newConversationId: string;
    summary: string;
    keyPoints: string[];
    decisions: string[];
    followUpNeeded: string[];
};

export async function summarizeConversationAction(
    conversationId: string
): Promise<ActionResult<SummarizeResult>> {
    return withAction(async () => {
        // 1. Fetch conversation with messages
        const conversation = await prisma.aIConversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: { orderBy: { createdAt: "asc" } },
            },
        });

        if (!conversation) {
            throw new Error("Conversation not found");
        }

        // 2. Build message transcript for summarization
        const transcript = conversation.messages
            .map((m) => `[${m.role}]: ${m.content}`)
            .join("\n\n");

        const messages: AIMessage[] = [
            {
                id: "sys",
                role: "system",
                content: SUMMARIZE_PROMPT,
                createdAt: new Date().toISOString(),
            },
            {
                id: "user",
                role: "user",
                content: `Here is the conversation to summarize:\n\n${transcript}`,
                createdAt: new Date().toISOString(),
            },
        ];

        // 3. Call AI for summarization
        const aiService = getAIService();
        const response = await aiService.chat(messages, {
            model: "grok-4-1-fast",
            temperature: 0.2,
            maxTokens: 1500,
            projectId: conversation.projectId ?? undefined,
        });

        let parsed: {
            summary: string;
            keyPoints: string[];
            decisions: string[];
            followUpNeeded: string[];
        };

        try {
            // Strip markdown code fences if present
            const cleaned = response.content
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();
            parsed = JSON.parse(cleaned);
        } catch {
            parsed = {
                summary: response.content.slice(0, 500),
                keyPoints: [],
                decisions: [],
                followUpNeeded: [],
            };
        }

        // 4. Create/update ConversationSummary record
        await prisma.conversationSummary.upsert({
            where: { conversationId },
            create: {
                conversationId,
                summary: parsed.summary,
                keyPoints: parsed.keyPoints,
                decisions: parsed.decisions,
                followUpNeeded: parsed.followUpNeeded,
                messageCount: conversation.messages.length,
                lastSummarizedAt: new Date(),
            },
            update: {
                summary: parsed.summary,
                keyPoints: parsed.keyPoints,
                decisions: parsed.decisions,
                followUpNeeded: parsed.followUpNeeded,
                messageCount: conversation.messages.length,
                lastSummarizedAt: new Date(),
            },
        });

        // 5. Archive old conversation
        await prisma.aIConversation.update({
            where: { id: conversationId },
            data: { archived: true },
        });

        // 6. Create new conversation with summary injected
        const contextNote = [
            `Previous conversation summary (${conversation.messages.length} messages):`,
            parsed.summary,
            "",
            "Key points:",
            ...parsed.keyPoints.map((p) => `- ${p}`),
            ...(parsed.decisions.length
                ? ["", "Decisions made:", ...parsed.decisions.map((d) => `- ${d}`)]
                : []),
            ...(parsed.followUpNeeded.length
                ? ["", "Follow-up needed:", ...parsed.followUpNeeded.map((f) => `- ${f}`)]
                : []),
        ].join("\n");

        const newConversation = await prisma.aIConversation.create({
            data: {
                projectId: conversation.projectId,
                studyId: conversation.studyId,
                context: conversation.context,
                page: conversation.page,
                title: conversation.title
                    ? `${conversation.title} (continued)`
                    : null,
            },
        });

        // Inject summary as a system message in the new conversation
        await prisma.aIMessage.create({
            data: {
                conversationId: newConversation.id,
                role: "system",
                content: contextNote,
            },
        });

        return {
            newConversationId: newConversation.id,
            summary: parsed.summary,
            keyPoints: parsed.keyPoints,
            decisions: parsed.decisions,
            followUpNeeded: parsed.followUpNeeded,
        };
    });
}
