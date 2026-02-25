"use server";

import {
    createNote,
    getNote,
    listNotes,
    updateNote,
    deleteNote,
    searchNotes,
    textToTipTapDoc,
    type CreateNoteInput,
    type UpdateNoteInput,
    type ListNotesOptions,
} from "@/lib/server/notes";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";

async function assertProjectAccess(projectId: string, userId: string, workspaceId: string): Promise<void> {
    const project = await prisma.project.findFirst({
        where: { id: projectId, ownerId: userId, workspaceId },
        select: { id: true },
    });
    if (!project) {
        throw new Error("Project not found or access denied");
    }
}

async function getAuthorizedNoteProjectId(
    noteId: string,
    userId: string,
    workspaceId: string,
): Promise<string> {
    const note = await prisma.note.findFirst({
        where: {
            id: noteId,
            project: { ownerId: userId, workspaceId },
        },
        select: { projectId: true },
    });
    if (!note) {
        throw new Error("Note not found or access denied");
    }
    return note.projectId;
}

/**
 * Create a note from plain text (backwards-compatible with save-from-conversation).
 */
export async function createNoteAction(
    projectId: string,
    content: string,
    source: "manual" | "conversation" = "conversation",
    sourceConversationId?: string,
    sourceMessageId?: string,
): Promise<ActionResult<{ noteId: string }>> {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(projectId, userId, workspaceId);
            const note = await createNote({
                projectId,
                userId,
                content: textToTipTapDoc(content),
                source,
                sourceConversationId,
                sourceMessageId,
            });
            return { noteId: note.id };
        }),
    );
}

/**
 * Create a note with full input (TipTap JSON content, tags, etc.).
 */
export async function createNoteFullAction(input: CreateNoteInput) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(input.projectId, userId, workspaceId);
            return createNote({ ...input, userId });
        }),
    );
}

export async function getNoteAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await getAuthorizedNoteProjectId(id, userId, workspaceId);
            return getNote(id);
        }),
    );
}

export async function listNotesAction(projectId: string, options?: ListNotesOptions) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(projectId, userId, workspaceId);
            return listNotes(projectId, options);
        }),
    );
}

export async function updateNoteAction(id: string, input: UpdateNoteInput) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await getAuthorizedNoteProjectId(id, userId, workspaceId);
            return updateNote(id, input);
        }),
    );
}

export async function deleteNoteAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await getAuthorizedNoteProjectId(id, userId, workspaceId);
            return deleteNote(id);
        }),
    );
}

export async function searchNotesAction(projectId: string, query: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(projectId, userId, workspaceId);
            return searchNotes(projectId, query);
        }),
    );
}
