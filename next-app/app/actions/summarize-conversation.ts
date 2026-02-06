"use server";

import { prisma } from "@/lib/server/prisma";
import { getAIService } from "@/lib/server/ai";
import type { AIMessage } from "@/types/ai";

const SUMMARIZE_PROMPT = `You are summarizing a conversation between a user and an AI research assistant.
Produce a structured summary with these sections:
1. **Summary**: A 2-3 sentence overview of what was discussed.
2. **Key Points**: 3-6 bullet points of the most important topics or findings.
3. **Decisions Made**: Any explicit decisions or choices the user committed to.
4. **Follow-up Needed**: Outstanding questions or next steps mentioned.

Return ONLY valid JSON in this shape:
{
  "summary": "...",
  "keyPoints": ["..."],
  "decisions": ["..."],
  "followUpNeeded": ["..."]
}`;

type SummarizeResult = {
    newConversationId: string;
    summary: string;
    keyPoints: string[];
    decisions: string[];
    followUpNeeded: string[];
};

export async function summarizeConversationAction(
    conversationId: string
): Promise<SummarizeResult> {
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
            context: contextNote,
            page: conversation.page,
            title: conversation.title
                ? `${conversation.title} (continued)`
                : null,
        },
    });

    return {
        newConversationId: newConversation.id,
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        decisions: parsed.decisions,
        followUpNeeded: parsed.followUpNeeded,
    };
}
