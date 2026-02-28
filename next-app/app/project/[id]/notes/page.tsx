"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import { EditorToolbar } from "../draft/DraftEditors";
import {
    listNotesAction,
    createNoteFullAction,
    getNoteAction,
    updateNoteAction,
    deleteNoteAction,
    searchNotesAction,
} from "@/app/actions/notes";
import type { NoteContent } from "@/lib/server/notes";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { addProjectDataChangedListener } from "@/lib/project-data-events";
import styles from "./notes.module.css";

// ── Types ────────────────────────────────────────────────────────────────────

type Note = {
    id: string;
    projectId: string;
    title: string | null;
    content: unknown;
    tags: string[];
    linkedStudyId: string | null;
    linkedSection: string | null;
    source: string;
    sourceConversationId: string | null;
    sourceMessageId: string | null;
    createdAt: Date;
    updatedAt: Date;
};

// ── Empty doc ────────────────────────────────────────────────────────────────

const emptyDoc: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph" }],
};

// ── Component ────────────────────────────────────────────────────────────────

export default function NotesPage() {
    const params = useParams<{ id: string }>();
    const projectId = params?.id ?? "";

    // State
    const [notes, setNotes] = useState<Note[]>([]);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle" | "error">("idle");
    const [tagInput, setTagInput] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Refs for debouncing
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track pending saves so we can flush them before switching notes
    const pendingSaveRef = useRef<{ noteId: string; content: JSONContent } | null>(null);
    const pendingTitleRef = useRef<{ noteId: string; title: string } | null>(null);

    // Selected note data
    const selectedNote = useMemo(
        () => notes.find((n) => n.id === selectedNoteId) ?? null,
        [notes, selectedNoteId],
    );

    // ── TipTap Editor ────────────────────────────────────────────────────────

    const editor = useEditor(
        {
            immediatelyRender: false,
            extensions: [
                StarterKit,
                Underline,
                Placeholder.configure({ placeholder: "Start writing..." }),
            ],
            content: (selectedNote?.content as JSONContent) ?? emptyDoc,
            editorProps: {
                attributes: { class: styles.proseMirror },
            },
            onUpdate: ({ editor: ed }) => {
                if (!selectedNoteId) return;
                queueContentSave(selectedNoteId, ed.getJSON());
            },
        },
        [selectedNoteId],
    );

    // ── Data loading ─────────────────────────────────────────────────────────

    const loadNotes = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        const result = await listNotesAction(projectId);
        if (result.success) setNotes(result.data as Note[]);
        setIsLoading(false);
    }, [projectId]);

    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    useEffect(() => {
        return addProjectDataChangedListener((detail) => {
            if (detail.projectId !== projectId) return;
            if (!detail.domains.includes("notes")) return;
            loadNotes();
        });
    }, [projectId, loadNotes]);

    // ── Search ───────────────────────────────────────────────────────────────

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearchQuery(value);
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(async () => {
                if (!projectId) return;
                if (value.trim()) {
                    const results = await searchNotesAction(projectId, value);
                    if (results.success) setNotes(results.data as Note[]);
                } else {
                    const results = await listNotesAction(projectId);
                    if (results.success) setNotes(results.data as Note[]);
                }
            }, 300);
        },
        [projectId],
    );

    // ── Auto-save content ────────────────────────────────────────────────────

    const queueContentSave = useCallback(
        (noteId: string, content: JSONContent) => {
            setSaveStatus("saving");
            pendingSaveRef.current = { noteId, content };
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(async () => {
                pendingSaveRef.current = null;
                const result = await updateNoteAction(noteId, { content: content as NoteContent });
                if (!result.success) {
                    setSaveStatus("error");
                    return;
                }
                setSaveStatus("saved");
                // Update local state
                setNotes((prev) =>
                    prev.map((n) =>
                        n.id === noteId ? { ...n, content, updatedAt: new Date() } : n,
                    ),
                );
            }, 500);
        },
        [],
    );

    // ── Title save ───────────────────────────────────────────────────────────

    const handleTitleChange = useCallback(
        (value: string) => {
            if (!selectedNoteId) return;
            setNotes((prev) =>
                prev.map((n) => (n.id === selectedNoteId ? { ...n, title: value } : n)),
            );
            pendingTitleRef.current = { noteId: selectedNoteId, title: value };
            if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
            titleTimerRef.current = setTimeout(async () => {
                pendingTitleRef.current = null;
                const result = await updateNoteAction(selectedNoteId, { title: value });
                if (result.success) setSaveStatus("saved");
                else setSaveStatus("error");
            }, 500);
        },
        [selectedNoteId],
    );

    // ── Note selection ───────────────────────────────────────────────────────

    const selectNote = useCallback(
        async (noteId: string) => {
            // Flush any pending content save before switching
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            if (pendingSaveRef.current) {
                const { noteId: pendingId, content } = pendingSaveRef.current;
                pendingSaveRef.current = null;
                updateNoteAction(pendingId, { content: content as NoteContent }).catch(console.error);
            }
            // Flush any pending title save
            if (titleTimerRef.current) {
                clearTimeout(titleTimerRef.current);
                titleTimerRef.current = null;
            }
            if (pendingTitleRef.current) {
                const { noteId: pendingId, title } = pendingTitleRef.current;
                pendingTitleRef.current = null;
                updateNoteAction(pendingId, { title }).catch(console.error);
            }
            setSelectedNoteId(noteId);
            setSaveStatus("idle");

            // Fetch fresh note data
            const noteResult = await getNoteAction(noteId);
            if (noteResult.success && noteResult.data) {
                const note = noteResult.data;
                setNotes((prev) =>
                    prev.map((n) => (n.id === noteId ? (note as Note) : n)),
                );
            }
        },
        [],
    );

    // ── Create note ──────────────────────────────────────────────────────────

    const handleCreateNote = useCallback(async () => {
        if (!projectId) return;
        const result = await createNoteFullAction({
            projectId,
            content: emptyDoc as NoteContent,
            source: "manual",
        });
        if (!result.success) return;
        const created = result.data as Note;
        setNotes((prev) => [created, ...prev]);
        setSelectedNoteId(created.id);
        setSaveStatus("idle");
    }, [projectId]);

    // ── Delete note ──────────────────────────────────────────────────────────

    const handleDeleteNote = useCallback(
        async (noteId: string) => {
            const result = await deleteNoteAction(noteId);
            if (!result.success) return;
            setNotes((prev) => prev.filter((n) => n.id !== noteId));
            if (selectedNoteId === noteId) {
                setSelectedNoteId(null);
            }
            setConfirmDelete(null);
        },
        [selectedNoteId],
    );

    // ── Tags ─────────────────────────────────────────────────────────────────

    const handleAddTag = useCallback(
        async (tag: string) => {
            if (!selectedNote || !tag.trim()) return;
            const trimmed = tag.trim().toLowerCase();
            if (selectedNote.tags.includes(trimmed)) return;
            const newTags = [...selectedNote.tags, trimmed];
            const result = await updateNoteAction(selectedNote.id, { tags: newTags });
            if (!result.success) return;
            setNotes((prev) =>
                prev.map((n) => (n.id === selectedNote.id ? { ...n, tags: newTags } : n)),
            );
            setTagInput("");
        },
        [selectedNote],
    );

    const handleRemoveTag = useCallback(
        async (tag: string) => {
            if (!selectedNote) return;
            const newTags = selectedNote.tags.filter((t) => t !== tag);
            const result = await updateNoteAction(selectedNote.id, { tags: newTags });
            if (!result.success) return;
            setNotes((prev) =>
                prev.map((n) => (n.id === selectedNote.id ? { ...n, tags: newTags } : n)),
            );
        },
        [selectedNote],
    );

    // ── Format date ──────────────────────────────────────────────────────────

    const formatDate = (date: Date) => {
        const d = new Date(date);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return "Today";
        if (days === 1) return "Yesterday";
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString();
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <ProjectPageLayout>
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.headerTitle}>Notes</h1>
                    <div className={styles.searchWrapper}>
                        <span className={`material-icons-round ${styles.searchIcon}`}>search</span>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search notes..."
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                    </div>
                </div>
                <button
                    type="button"
                    className={styles.newNoteBtn}
                    onClick={handleCreateNote}
                >
                    <span className="material-icons-round">add</span>
                    New Note
                </button>
            </div>

            {/* Body */}
            <DemoGuideCard
                projectId={projectId}
                guideId="notes-trail"
                text="Capture why decisions were made while screening and drafting. Notes become your reproducible audit trail and can be promoted into copilot context."
            />

            <div className={styles.body}>
                {/* Sidebar — note list */}
                <div className={styles.sidebar}>
                    {isLoading ? (
                        <div className={styles.sidebarEmpty}>Loading...</div>
                    ) : notes.length === 0 ? (
                        <div className={styles.sidebarEmpty}>
                            {searchQuery ? "No notes match your search" : "No notes yet"}
                        </div>
                    ) : (
                        notes.map((note) => (
                            <div
                                key={note.id}
                                className={`${styles.noteItem} ${selectedNoteId === note.id ? styles.noteItemActive : ""}`}
                                onClick={() => selectNote(note.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === "Enter") selectNote(note.id); }}
                            >
                                <div className={styles.noteTitle}>
                                    {note.title || "Untitled"}
                                </div>
                                <div className={styles.noteMeta}>
                                    <span>{formatDate(note.updatedAt)}</span>
                                    <span
                                        className={`${styles.sourceBadge} ${
                                            note.source === "conversation"
                                                ? styles.sourceBadgeConversation
                                                : styles.sourceBadgeManual
                                        }`}
                                    >
                                        <span className="material-icons-round">
                                            {note.source === "conversation" ? "chat" : "edit_note"}
                                        </span>
                                        {note.source === "conversation" ? "Conversation" : "Manual"}
                                    </span>
                                </div>
                                {note.tags.length > 0 && (
                                    <div className={styles.noteTagPills}>
                                        {note.tags.slice(0, 3).map((tag) => (
                                            <span key={tag} className={styles.noteTagPill}>
                                                {tag}
                                            </span>
                                        ))}
                                        {note.tags.length > 3 && (
                                            <span className={styles.noteTagPill}>
                                                +{note.tags.length - 3}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Editor area */}
                {selectedNote ? (
                    <div className={styles.editorArea}>
                        {/* Title + tags */}
                        <div className={styles.editorHeader}>
                            <input
                                type="text"
                                className={styles.titleInput}
                                value={selectedNote.title || ""}
                                onChange={(e) => handleTitleChange(e.target.value)}
                                placeholder="Untitled"
                            />

                            <div className={styles.tagArea}>
                                {selectedNote.tags.map((tag) => (
                                    <span key={tag} className={styles.tagChip}>
                                        {tag}
                                        <button
                                            type="button"
                                            className={styles.tagChipRemove}
                                            onClick={() => handleRemoveTag(tag)}
                                            aria-label={`Remove tag ${tag}`}
                                        >
                                            <span className="material-icons-round">close</span>
                                        </button>
                                    </span>
                                ))}
                                <input
                                    type="text"
                                    className={styles.tagInput}
                                    placeholder="Add tag..."
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleAddTag(tagInput);
                                        }
                                    }}
                                />
                            </div>

                            {selectedNote.linkedStudyId && (
                                <span className={styles.linkedStudyChip}>
                                    <span className="material-icons-round">link</span>
                                    Linked study
                                </span>
                            )}
                        </div>

                        {/* Toolbar */}
                        <div className={styles.toolbarWrapper}>
                            <EditorToolbar editor={editor} />
                        </div>

                        {/* Editor content */}
                        <EditorContent editor={editor} />

                        {/* Footer */}
                        <div className={styles.editorFooter}>
                            <div
                                className={`${styles.saveStatus} ${
                                    saveStatus === "saving" ? styles.saveStatusSaving : ""
                                }`}
                            >
                                {saveStatus === "saving" && (
                                    <>
                                        <span className="material-icons-round">sync</span>
                                        Saving...
                                    </>
                                )}
                                {saveStatus === "saved" && (
                                    <>
                                        <span className="material-icons-round">check_circle</span>
                                        Saved
                                    </>
                                )}
                            </div>

                            <button
                                type="button"
                                className={styles.deleteBtn}
                                onClick={() => setConfirmDelete(selectedNote.id)}
                            >
                                <span className="material-icons-round">delete</span>
                                Delete
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        <span className="material-icons-round">sticky_note_2</span>
                        <div className={styles.emptyStateTitle}>
                            {notes.length === 0
                                ? "Create your first note"
                                : "Select a note to edit"}
                        </div>
                        <div className={styles.emptyStateDesc}>
                            {notes.length === 0
                                ? "Notes help you capture ideas, decisions, and insights during your review."
                                : "Choose a note from the sidebar or create a new one."}
                        </div>
                    </div>
                )}
            </div>

            {/* Confirm delete dialog */}
            {confirmDelete && (
                <div className={styles.confirmOverlay} onClick={() => setConfirmDelete(null)}>
                    <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
                        <p>Delete this note? This action cannot be undone.</p>
                        <div className={styles.confirmActions}>
                            <button
                                type="button"
                                className={styles.confirmCancel}
                                onClick={() => setConfirmDelete(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={styles.confirmDelete}
                                onClick={() => handleDeleteNote(confirmDelete)}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </ProjectPageLayout>
    );
}
