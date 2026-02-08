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

/**
 * Create a note from plain text (backwards-compatible with save-from-conversation).
 */
export async function createNoteAction(
    projectId: string,
    content: string,
    source: "manual" | "conversation" = "conversation",
    sourceConversationId?: string,
    sourceMessageId?: string,
) {
    const note = await createNote({
        projectId,
        content: textToTipTapDoc(content),
        source,
        sourceConversationId,
        sourceMessageId,
    });
    return { success: true as const, noteId: note.id };
}

/**
 * Create a note with full input (TipTap JSON content, tags, etc.).
 */
export async function createNoteFullAction(input: CreateNoteInput) {
    return createNote(input);
}

export async function getNoteAction(id: string) {
    return getNote(id);
}

export async function listNotesAction(projectId: string, options?: ListNotesOptions) {
    return listNotes(projectId, options);
}

export async function updateNoteAction(id: string, input: UpdateNoteInput) {
    return updateNote(id, input);
}

export async function deleteNoteAction(id: string) {
    return deleteNote(id);
}

export async function searchNotesAction(projectId: string, query: string) {
    return searchNotes(projectId, query);
}
