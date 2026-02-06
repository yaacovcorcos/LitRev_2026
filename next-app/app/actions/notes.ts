"use server";

import { prisma } from "@/lib/server/prisma";

/**
 * Create a note from a copilot conversation message
 */
export async function createNoteAction(
    projectId: string,
    content: string,
    source: "manual" | "conversation" = "conversation",
    sourceConversationId?: string,
    sourceMessageId?: string
) {
    try {
        const note = await prisma.note.create({
            data: {
                projectId,
                content: { text: content },
                source,
                sourceConversationId: sourceConversationId ?? null,
                sourceMessageId: sourceMessageId ?? null,
            },
        });
        return { success: true as const, noteId: note.id };
    } catch (error) {
        return {
            success: false as const,
            error: error instanceof Error ? error.message : "Failed to create note",
        };
    }
}
