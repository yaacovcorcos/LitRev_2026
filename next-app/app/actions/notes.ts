"use server";

import { z } from "zod";
import {
    createNote,
    getNote,
    listNotes,
    listNotesPaginated,
    updateNote,
    deleteNote,
    searchNotes,
    textToTipTapDoc,
    type CreateNoteInput,
    type PaginationOptions,
    type UpdateNoteInput,
    type ListNotesOptions,
} from "@/lib/server/notes";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import { cuidSchema, projectIdSchema, searchQuerySchema } from "@/lib/schemas/ids";
import {
    createNoteInputSchema,
    updateNoteInputSchema,
    listNotesOptionsSchema,
} from "@/lib/schemas/notes";
import { paginationOptionsSchema } from "@/lib/schemas/ledger";

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
            deletedAt: null,
            project: { ownerId: userId, workspaceId },
        },
        select: { projectId: true },
    });
    if (!note) {
        throw new Error("Note not found or access denied");
    }
    return note.projectId;
}

const createNoteActionInput = z.object({
    projectId: projectIdSchema,
    content: z.string().min(1).max(200_000),
    source: z.enum(["manual", "conversation"]).optional(),
    sourceConversationId: cuidSchema.optional(),
    sourceMessageId: cuidSchema.optional(),
});

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
    return withValidatedAction(
        createNoteActionInput,
        { projectId, content, source, sourceConversationId, sourceMessageId },
        (v) =>
            withAuth(async ({ userId, workspaceId }) => {
                await assertProjectAccess(v.projectId, userId, workspaceId);
                const note = await createNote({
                    projectId: v.projectId,
                    userId,
                    content: textToTipTapDoc(v.content),
                    source: v.source,
                    sourceConversationId: v.sourceConversationId,
                    sourceMessageId: v.sourceMessageId,
                });
                return { noteId: note.id };
            }),
    );
}

/**
 * Create a note with full input (TipTap JSON content, tags, etc.).
 */
export async function createNoteFullAction(input: CreateNoteInput) {
    return withValidatedAction(createNoteInputSchema, input, (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(v.projectId, userId, workspaceId);
            return createNote({ ...(v as CreateNoteInput), userId });
        }),
    );
}

export async function getNoteAction(id: string) {
    return withValidatedAction(cuidSchema, id, (validId) =>
        withAuth(async ({ userId, workspaceId }) => {
            await getAuthorizedNoteProjectId(validId, userId, workspaceId);
            return getNote(validId);
        }),
    );
}

const listNotesActionInput = z.object({
    projectId: projectIdSchema,
    options: listNotesOptionsSchema.optional(),
});

export async function listNotesAction(projectId: string, options?: ListNotesOptions) {
    return withValidatedAction(listNotesActionInput, { projectId, options }, (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(v.projectId, userId, workspaceId);
            return listNotes(v.projectId, v.options as ListNotesOptions | undefined);
        }),
    );
}

const listNotesPaginatedInput = z.object({
    projectId: projectIdSchema,
    options: listNotesOptionsSchema.merge(paginationOptionsSchema).optional(),
});

export async function listNotesPaginatedAction(
    projectId: string,
    options?: ListNotesOptions & PaginationOptions,
) {
    return withValidatedAction(listNotesPaginatedInput, { projectId, options }, (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(v.projectId, userId, workspaceId);
            return listNotesPaginated(v.projectId, v.options as (ListNotesOptions & PaginationOptions) | undefined);
        }),
    );
}

const updateNoteActionInput = z.object({
    id: cuidSchema,
    input: updateNoteInputSchema,
});

export async function updateNoteAction(id: string, input: UpdateNoteInput) {
    return withValidatedAction(updateNoteActionInput, { id, input }, (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await getAuthorizedNoteProjectId(v.id, userId, workspaceId);
            return updateNote(v.id, v.input as UpdateNoteInput);
        }),
    );
}

export async function deleteNoteAction(id: string) {
    return withValidatedAction(cuidSchema, id, (validId) =>
        withAuth(async ({ userId, workspaceId }) => {
            await getAuthorizedNoteProjectId(validId, userId, workspaceId);
            return deleteNote(validId);
        }),
    );
}

const searchNotesActionInput = z.object({
    projectId: projectIdSchema,
    query: searchQuerySchema,
});

export async function searchNotesAction(projectId: string, query: string) {
    return withValidatedAction(searchNotesActionInput, { projectId, query }, (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(v.projectId, userId, workspaceId);
            return searchNotes(v.projectId, v.query);
        }),
    );
}
