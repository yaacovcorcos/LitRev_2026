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
    return withAction(async () => {
        const note = await createNote({
            projectId,
            content: textToTipTapDoc(content),
            source,
            sourceConversationId,
            sourceMessageId,
        });
        return { noteId: note.id };
    });
}

/**
 * Create a note with full input (TipTap JSON content, tags, etc.).
 */
export async function createNoteFullAction(input: CreateNoteInput) {
    return withAction(() => createNote(input));
}

export async function getNoteAction(id: string) {
    return withAction(() => getNote(id));
}

export async function listNotesAction(projectId: string, options?: ListNotesOptions) {
    return withAction(() => listNotes(projectId, options));
}

export async function updateNoteAction(id: string, input: UpdateNoteInput) {
    return withAction(() => updateNote(id, input));
}

export async function deleteNoteAction(id: string) {
    return withAction(() => deleteNote(id));
}

export async function searchNotesAction(projectId: string, query: string) {
    return withAction(() => searchNotes(projectId, query));
}
