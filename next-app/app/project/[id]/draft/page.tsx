"use client";

import {
  CSSProperties,
  Suspense,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import { DRAFT_SECTIONS, OPTIONAL_SECTION_KEYS, DraftMode, DraftSectionKey } from "@/types/draft";
import {
  CopilotMessage,
  DraftState,
  emptyDoc,
  loadDraftState,
  saveDraftState,
} from "@/lib/draftStorage";
import styles from "./draft-studio.module.css";

import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Node, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";

type Reference = {
  id: string;
  authorsShort: string;
  year: number;
  title: string;
};

const MOCK_REFERENCES: Reference[] = [
  {
    id: "r1",
    authorsShort: "Smith et al.",
    year: 2024,
    title: "AI-assisted triage in radiopathology: a multi-center evaluation",
  },
  {
    id: "r2",
    authorsShort: "Nguyen",
    year: 2023,
    title: "Bias and calibration in clinical ML deployment pipelines",
  },
  {
    id: "r3",
    authorsShort: "Patel & Gomez",
    year: 2022,
    title: "Systematic review methods for imaging datasets",
  },
  {
    id: "r4",
    authorsShort: "Iyer",
    year: 2021,
    title: "Evidence synthesis workflows for rapid reviews",
  },
  {
    id: "r5",
    authorsShort: "Chen et al.",
    year: 2020,
    title: "Reproducibility practices in medical imaging research",
  },
  {
    id: "r6",
    authorsShort: "Wang",
    year: 2019,
    title: "Clinical trial reporting standards: a practical checklist",
  },
];

const EMPTY_IDS: string[] = [];

const referenceLabel = (ref: Reference) => `${ref.authorsShort} ${ref.year}`;

const isDraftSectionKey = (value: string | null): value is DraftSectionKey => {
  if (!value) return false;
  return DRAFT_SECTIONS.some((s) => s.key === value);
};

const isDraftMode = (value: string | null): value is DraftMode => value === "section" || value === "full";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-citation]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-citation": "true",
      }),
      node.attrs.label,
    ];
  },
});

type ToolbarProps = {
  editor: Editor | null;
};

function EditorToolbar({ editor }: ToolbarProps) {
  if (!editor) return null;
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Bold"
        aria-pressed={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="material-icons-round">format_bold</span>
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Italic"
        aria-pressed={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="material-icons-round">format_italic</span>
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Underline"
        aria-pressed={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="material-icons-round">format_underlined</span>
      </button>
      <div className={styles.toolbarDivider} aria-hidden="true" />
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Bulleted list"
        aria-pressed={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <span className="material-icons-round">format_list_bulleted</span>
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Numbered list"
        aria-pressed={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <span className="material-icons-round">format_list_numbered</span>
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Quote"
        aria-pressed={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <span className="material-icons-round">format_quote</span>
      </button>
      <div className={styles.toolbarDivider} aria-hidden="true" />
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <span className="material-icons-round">undo</span>
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <span className="material-icons-round">redo</span>
      </button>
    </div>
  );
}

type FullSectionEditorProps = {
  sectionKey: DraftSectionKey;
  content: JSONContent;
  onFocusSection: (key: DraftSectionKey, editor: Editor) => void;
  onUpdateSection: (key: DraftSectionKey, json: JSONContent) => void;
  registerEditor: (key: DraftSectionKey, editor: Editor | null) => void;
};

function FullSectionEditor({
  sectionKey,
  content,
  onFocusSection,
  onUpdateSection,
  registerEditor,
}: FullSectionEditorProps) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Underline,
        Citation,
        Placeholder.configure({
          placeholder: "Start writing…",
        }),
      ],
      content,
      editorProps: {
        attributes: {
          class: styles.proseMirror,
        },
      },
      onFocus: ({ editor }) => onFocusSection(sectionKey, editor),
      onUpdate: ({ editor }) => onUpdateSection(sectionKey, editor.getJSON()),
    },
    []
  );

  useEffect(() => {
    registerEditor(sectionKey, editor);
    return () => registerEditor(sectionKey, null);
  }, [editor, registerEditor, sectionKey]);

  return (
    <div className={styles.editorSurface}>
      <EditorContent editor={editor} />
    </div>
  );
}

function DraftContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getProjectById } = useProjects();
  const project = getProjectById(id);

  const queryMode = searchParams.get("mode");
  const querySection = searchParams.get("section");

  const [draft, setDraft] = useState<DraftState>(() => {
    const loaded = loadDraftState(id);
    const mode = isDraftMode(queryMode) ? queryMode : loaded.mode;
    const order = [...loaded.sectionOrder];
    const sectionFromQuery = isDraftSectionKey(querySection) ? querySection : null;
    if (sectionFromQuery && !order.includes(sectionFromQuery)) {
      order.push(sectionFromQuery);
    }
    const candidate = sectionFromQuery ?? loaded.activeSection;
    const activeSection = order.includes(candidate) ? candidate : order[0] ?? loaded.activeSection;
    return {
      ...loaded,
      mode,
      sectionOrder: order,
      activeSection,
    };
  });
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeEditorRef = useRef<Editor | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const editorBySectionRef = useRef<Record<DraftSectionKey, Editor | null>>({} as Record<DraftSectionKey, Editor | null>);
  const sectionElRef = useRef<Record<DraftSectionKey, HTMLDivElement | null>>({} as Record<
    DraftSectionKey,
    HTMLDivElement | null
  >);
  const sectionTabRefs = useRef<Record<DraftSectionKey, HTMLButtonElement | null>>({} as Record<
    DraftSectionKey,
    HTMLButtonElement | null
  >);

  const activeSectionRef = useRef<DraftSectionKey>(draft.activeSection);
  useEffect(() => {
    activeSectionRef.current = draft.activeSection;
  }, [draft.activeSection]);

  const pendingContentRef = useRef<Record<DraftSectionKey, JSONContent>>(draft.contentBySection);
  const dirtyContentKeysRef = useRef<Set<DraftSectionKey>>(new Set());
  const contentCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAddEvidenceOpen, setAddEvidenceOpen] = useState(false);
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const addEvidenceRef = useRef<HTMLDivElement | null>(null);
  const addEvidenceLastFocusRef = useRef<HTMLElement | null>(null);

  const [isAddSectionOpen, setAddSectionOpen] = useState(false);
  const addSectionRef = useRef<HTMLDivElement | null>(null);
  const dragKeyRef = useRef<DraftSectionKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<DraftSectionKey | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const [draggingKey, setDraggingKey] = useState<DraftSectionKey | null>(null);

  const [copilotInput, setCopilotInput] = useState("");
  const copilotListRef = useRef<HTMLDivElement | null>(null);
  const copilotAutoScrollRef = useRef(true);

  const orderedSections = useMemo(
    () =>
      draft.sectionOrder
        .map((key) => DRAFT_SECTIONS.find((section) => section.key === key))
        .filter((section): section is (typeof DRAFT_SECTIONS)[number] => Boolean(section)),
    [draft.sectionOrder]
  );

  const sectionKeys = useMemo(() => orderedSections.map((section) => section.key), [orderedSections]);

  const availableSectionKeys = useMemo(
    () => OPTIONAL_SECTION_KEYS.filter((key) => !draft.sectionOrder.includes(key)),
    [draft.sectionOrder]
  );

  const availableSections = useMemo(
    () =>
      availableSectionKeys
        .map((key) => DRAFT_SECTIONS.find((section) => section.key === key))
        .filter((section): section is (typeof DRAFT_SECTIONS)[number] => Boolean(section)),
    [availableSectionKeys]
  );
  const hasAvailableSections = availableSections.length > 0;

  const activeSectionMeta = useMemo(() => DRAFT_SECTIONS.find((s) => s.key === draft.activeSection), [draft.activeSection]);
  const activeSectionLabel = activeSectionMeta?.label ?? "Draft";
  const ledgerPanelId = "draft-ledger-panel";
  const copilotPanelId = "draft-copilot-panel";

  const scheduleSave = useCallback(
    (next: DraftState) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(() => {
        saveDraftState(id, next);
        setSaveStatus("saved");
      }, 400);
    },
    [id]
  );

  const updateDraft = useCallback(
    (updater: (prev: DraftState) => DraftState) => {
      setDraft((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const flushContentCommit = useCallback(() => {
    if (contentCommitTimerRef.current) {
      clearTimeout(contentCommitTimerRef.current);
      contentCommitTimerRef.current = null;
    }

    if (dirtyContentKeysRef.current.size === 0) return;
    const keys = Array.from(dirtyContentKeysRef.current);
    dirtyContentKeysRef.current.clear();

    updateDraft((prev) => {
      const nextContent = { ...prev.contentBySection };
      for (const key of keys) {
        nextContent[key] = pendingContentRef.current[key];
      }
      return {
        ...prev,
        contentBySection: nextContent,
      };
    });
  }, [updateDraft]);

  const queueContentUpdate = useCallback(
    (key: DraftSectionKey, json: JSONContent) => {
      pendingContentRef.current[key] = json;
      dirtyContentKeysRef.current.add(key);
      setSaveStatus("saving");

      if (contentCommitTimerRef.current) {
        clearTimeout(contentCommitTimerRef.current);
      }
      contentCommitTimerRef.current = setTimeout(() => {
        flushContentCommit();
      }, 250);
    },
    [flushContentCommit]
  );

  useEffect(() => {
    const currentMode = isDraftMode(queryMode) ? queryMode : null;
    const currentSection = isDraftSectionKey(querySection) ? querySection : null;
    if (currentMode === draft.mode && currentSection === draft.activeSection) return;
    router.replace(`/project/${id}/draft?mode=${draft.mode}&section=${draft.activeSection}`, { scroll: false });
  }, [draft.activeSection, draft.mode, id, queryMode, querySection, router]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (contentCommitTimerRef.current) {
        clearTimeout(contentCommitTimerRef.current);
      }
    };
  }, []);

  const registerEditor = useCallback((key: DraftSectionKey, editor: Editor | null) => {
    editorBySectionRef.current[key] = editor;
  }, []);

  const focusEditorForSection = useCallback(
    (key: DraftSectionKey) => {
      const editor = draft.mode === "full" ? editorBySectionRef.current[key] : activeEditorRef.current;
      if (!editor) return;
      editor.chain().focus("end").run();
    },
    [draft.mode]
  );

  const handleSelectSection = (key: DraftSectionKey) => {
    if (draft.mode === "full") {
      updateDraft((prev) => (prev.activeSection === key ? prev : { ...prev, activeSection: key }));
      const el = sectionElRef.current[key];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => focusEditorForSection(key), 250);
      }
      return;
    }

    const sectionEditor = activeEditorRef.current;
    if (sectionEditor) {
      const currentKey = activeSectionRef.current;
      queueContentUpdate(currentKey, sectionEditor.getJSON());
      flushContentCommit();
    }
    updateDraft((prev) => (prev.activeSection === key ? prev : { ...prev, activeSection: key }));
    setTimeout(() => focusEditorForSection(key), 0);
  };

  const handleToggleMode = (mode: DraftMode) => {
    const editor = activeEditorRef.current;
    if (editor) {
      queueContentUpdate(activeSectionRef.current, editor.getJSON());
    }
    flushContentCommit();
    updateDraft((prev) => (prev.mode === mode ? prev : { ...prev, mode }));
    if (mode === "full") {
      setTimeout(() => {
        const el = sectionElRef.current[draft.activeSection];
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        focusEditorForSection(draft.activeSection);
      }, 0);
    } else {
      setTimeout(() => focusEditorForSection(draft.activeSection), 0);
    }
  };

  const handleAddSection = (key: DraftSectionKey) => {
    updateDraft((prev) => {
      if (prev.sectionOrder.includes(key)) return prev;
      const next = [...prev.sectionOrder];
      const activeIndex = next.indexOf(prev.activeSection);
      const insertIndex = activeIndex >= 0 ? activeIndex + 1 : next.length;
      next.splice(insertIndex, 0, key);
      return {
        ...prev,
        sectionOrder: next,
        activeSection: key,
      };
    });
    setAddSectionOpen(false);
    setTimeout(() => {
      sectionTabRefs.current[key]?.focus();
    }, 0);
  };

  const handleDragStart = (event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionKey) => {
    dragKeyRef.current = key;
    setDraggingKey(key);
    setDragOverKey(null);
    setDragOverPosition(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionKey) => {
    const dragging = dragKeyRef.current;
    if (!dragging || dragging === key) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - rect.left;
    const position = offset > rect.width / 2 ? "after" : "before";
    setDragOverKey(key);
    setDragOverPosition(position);
  };

  const handleDrop = (event: ReactDragEvent<HTMLButtonElement>, targetKey: DraftSectionKey) => {
    event.preventDefault();
    const dragging = dragKeyRef.current;
    if (!dragging || dragging === targetKey) return;
    const position = dragOverPosition ?? "before";
    updateDraft((prev) => {
      if (!prev.sectionOrder.includes(dragging)) return prev;
      const next = prev.sectionOrder.filter((key) => key !== dragging);
      const targetIndex = next.indexOf(targetKey);
      if (targetIndex === -1) return prev;
      const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
      next.splice(insertIndex, 0, dragging);
      return {
        ...prev,
        sectionOrder: next,
      };
    });
    setDragOverKey(null);
    setDragOverPosition(null);
  };

  const handleDragEnd = () => {
    dragKeyRef.current = null;
    setDraggingKey(null);
    setDragOverKey(null);
    setDragOverPosition(null);
  };

  const usedEvidenceIds = draft.ledgerBySection[draft.activeSection] ?? EMPTY_IDS;
  const usedEvidence = useMemo(
    () => MOCK_REFERENCES.filter((r) => usedEvidenceIds.includes(r.id)),
    [usedEvidenceIds]
  );

  const filteredEvidence = useMemo(() => {
    const q = evidenceQuery.trim().toLowerCase();
    if (!q) return MOCK_REFERENCES;
    return MOCK_REFERENCES.filter(
      (r) => r.title.toLowerCase().includes(q) || referenceLabel(r).toLowerCase().includes(q)
    );
  }, [evidenceQuery]);

  const insertCitation = (ref: Reference) => {
    const editor = activeEditorRef.current;
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: "citation", attrs: { id: ref.id, label: referenceLabel(ref) } })
      .insertContent(" ")
      .run();
  };

  const handleAddEvidence = (refId: string) => {
    updateDraft((prev) => {
      const existing = prev.ledgerBySection[prev.activeSection] ?? [];
      if (existing.includes(refId)) return prev;
      return {
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [prev.activeSection]: [refId, ...existing],
        },
      };
    });
  };

  const handleRemoveEvidence = (refId: string) => {
    updateDraft((prev) => {
      const existing = prev.ledgerBySection[prev.activeSection] ?? [];
      if (!existing.includes(refId)) return prev;
      return {
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [prev.activeSection]: existing.filter((id) => id !== refId),
        },
      };
    });
  };

  const buildCopilotResponse = (text: string) => {
    const lower = text.toLowerCase();
    const section = activeSectionLabel;
    const projectName = project?.name ?? "this project";

    if (lower.includes("outline")) {
      return `Here’s a concise outline for the ${section} section of ${projectName}:\n\n- Key point 1\n- Key point 2\n- Key point 3\n\nWant this tailored to a specific study type (RCT, cohort, systematic review)?`;
    }
    if (lower.includes("rewrite")) {
      return `Paste the paragraph you want rewritten for ${section}. I can tighten clarity, improve flow, and keep it medically appropriate.`;
    }
    if (lower.includes("methods")) {
      return `For ${section}, we can structure this as: design, data sources, eligibility, outcomes, statistical analysis, and ethics. Tell me your study design and population.`;
    }
    return `Got it — I’ll help with ${section}. Tell me what you want to achieve in this section (claim, comparison, or summary), and I’ll draft a clean version.`;
  };

  const handleCopilotSend = async () => {
    const text = copilotInput.trim();
    if (!text) return;
    copilotAutoScrollRef.current = true;
    const now = new Date().toISOString();
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, sender: "user", text, createdAt: now };

    updateDraft((prev) => {
      const list = prev.copilotBySection[prev.activeSection] ?? [];
      return {
        ...prev,
        copilotBySection: {
          ...prev.copilotBySection,
          [prev.activeSection]: [...list, userMsg],
        },
      };
    });
    setCopilotInput("");

    const aiText = buildCopilotResponse(text);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const aiMsg: CopilotMessage = { id: `a-${Date.now()}`, sender: "ai", text: aiText, createdAt: new Date().toISOString() };
    updateDraft((prev) => {
      const list = prev.copilotBySection[prev.activeSection] ?? [];
      return {
        ...prev,
        copilotBySection: {
          ...prev.copilotBySection,
          [prev.activeSection]: [...list, aiMsg],
        },
      };
    });
  };

  useEffect(() => {
    copilotAutoScrollRef.current = true;
  }, [draft.activeSection]);

  useEffect(() => {
    if (!copilotListRef.current) return;
    if (!copilotAutoScrollRef.current) return;
    copilotListRef.current.scrollTop = copilotListRef.current.scrollHeight;
  }, [draft.activeSection, draft.copilotBySection]);

  const handleCopilotScroll = () => {
    if (!copilotListRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = copilotListRef.current;
    copilotAutoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 80;
  };

  const insertCopilotText = (text: string) => {
    const editor = activeEditorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent(text).run();
  };

  const handleFocusSection = useCallback(
    (key: DraftSectionKey, editor: Editor) => {
      activeEditorRef.current = editor;
      setActiveEditor(editor);
      if (draft.mode === "full") {
        updateDraft((prev) => (prev.activeSection === key ? prev : { ...prev, activeSection: key }));
      }
    },
    [draft.mode, updateDraft]
  );

  const handleUpdateSection = useCallback(
    (key: DraftSectionKey, json: JSONContent) => {
      queueContentUpdate(key, json);
    },
    [queueContentUpdate]
  );

  const handleSectionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = sectionKeys.length - 1;
    let nextIndex = index;

    if (event.key === "ArrowRight") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }

    event.preventDefault();
    const nextKey = sectionKeys[nextIndex];
    handleSelectSection(nextKey);
    requestAnimationFrame(() => {
      sectionTabRefs.current[nextKey]?.focus();
    });
  };

  useEffect(() => {
    if (!isAddSectionOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!addSectionRef.current) return;
      if (event.target instanceof Node && !addSectionRef.current.contains(event.target)) {
        setAddSectionOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddSectionOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isAddSectionOpen]);

  useEffect(() => {
    if (!isAddEvidenceOpen || !addEvidenceRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    addEvidenceLastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusable = addEvidenceRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddEvidenceOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      addEvidenceLastFocusRef.current?.focus();
    };
  }, [isAddEvidenceOpen]);

  const sectionEditor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Underline,
        Citation,
        Placeholder.configure({
          placeholder: "Start writing…",
        }),
      ],
      content: draft.contentBySection[draft.activeSection] ?? emptyDoc(),
      editorProps: {
        attributes: {
          class: styles.proseMirror,
        },
      },
      onFocus: ({ editor }) => {
        activeEditorRef.current = editor;
        setActiveEditor(editor);
      },
      onUpdate: ({ editor }) => {
        const key = activeSectionRef.current;
        handleUpdateSection(key, editor.getJSON());
      },
    },
    []
  );

  const lastLoadedSectionRef = useRef<DraftSectionKey | null>(null);

  useEffect(() => {
    if (!sectionEditor) return;
    if (draft.mode !== "section") {
      lastLoadedSectionRef.current = null;
      return;
    }
    if (lastLoadedSectionRef.current === draft.activeSection) return;
    const content = draft.contentBySection[draft.activeSection] ?? emptyDoc();
    sectionEditor.commands.setContent(content, { emitUpdate: false });
    activeEditorRef.current = sectionEditor;
    lastLoadedSectionRef.current = draft.activeSection;
  }, [draft.activeSection, draft.contentBySection, draft.mode, sectionEditor]);

  const layoutVars = useMemo(() => {
    const rail = 48;
    const ledger = draft.panels.ledgerCollapsed ? rail : clamp(draft.panels.ledgerWidth, 260, 520);
    const copilot = draft.panels.copilotCollapsed ? rail : clamp(draft.panels.copilotWidth, 300, 560);
    return {
      "--ledger-width": `${ledger}px`,
      "--copilot-width": `${copilot}px`,
    } as CSSProperties;
  }, [draft.panels]);

  const dragStateRef = useRef<
    | { side: "ledger"; startX: number; startWidth: number }
    | { side: "copilot"; startX: number; startWidth: number }
    | null
  >(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragStateRef.current) return;
      const dx = event.clientX - dragStateRef.current.startX;
      if (dragStateRef.current.side === "ledger") {
        const next = clamp(dragStateRef.current.startWidth + dx, 260, 520);
        updateDraft((prev) => ({
          ...prev,
          panels: {
            ...prev.panels,
            ledgerWidth: next,
            ledgerCollapsed: false,
          },
        }));
      } else {
        const next = clamp(dragStateRef.current.startWidth - dx, 300, 560);
        updateDraft((prev) => ({
          ...prev,
          panels: {
            ...prev.panels,
            copilotWidth: next,
            copilotCollapsed: false,
          },
        }));
      }
    };

    const onUp = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateDraft]);

  if (!project) {
    return (
      <AppShell activeNav="projects">
        <div className={styles.notFound}>
          <h1>Project not found</h1>
          <Link href="/" className="header-btn header-btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  const copilotMessages = draft.copilotBySection[draft.activeSection] ?? [];

  return (
    <AppShell activeNav="projects" noMainPadding initiallyCollapsed>
      <div className={styles.page}>
        <div className={styles.top}>
          <div className={styles.topLeft}>
            <Link href={`/project/${project.id}`} className={styles.backLink}>
              <span className="material-icons-round">arrow_back</span>
              Project
            </Link>
            <div className={styles.projectName} title={project.name}>
              {project.name}
            </div>
          </div>

          <div className={styles.topCenter}>
            <div className={styles.sectionTabsWrap}>
              <div className={styles.sectionTabs} role="tablist" aria-label="Draft sections" aria-orientation="horizontal">
                {orderedSections.map((section, index) => {
                  const isDragging = draggingKey === section.key;
                  const isDragOver = dragOverKey === section.key && draggingKey && draggingKey !== section.key;
                  const dropClass =
                    isDragOver && dragOverPosition === "after"
                      ? styles.sectionTabDropAfter
                      : isDragOver && dragOverPosition === "before"
                        ? styles.sectionTabDropBefore
                        : "";
                  return (
                    <button
                      key={section.key}
                      type="button"
                      role="tab"
                      draggable
                      aria-grabbed={isDragging}
                      aria-selected={draft.activeSection === section.key}
                      aria-controls={draft.mode === "section" ? "draft-section-panel" : undefined}
                      id={`draft-tab-${section.key}`}
                      className={`${styles.sectionTab} ${draft.activeSection === section.key ? styles.sectionTabActive : ""} ${
                        isDragging ? styles.sectionTabDragging : ""
                      } ${dropClass}`}
                      onClick={() => handleSelectSection(section.key)}
                      onKeyDown={(event) => handleSectionKeyDown(event, index)}
                      onDragStart={(event) => handleDragStart(event, section.key)}
                      onDragOver={(event) => handleDragOver(event, section.key)}
                      onDrop={(event) => handleDrop(event, section.key)}
                      onDragEnd={handleDragEnd}
                      tabIndex={draft.activeSection === section.key ? 0 : -1}
                      ref={(el) => {
                        sectionTabRefs.current[section.key] = el;
                      }}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </div>
              <div className={styles.addSection} ref={addSectionRef}>
                <button
                  type="button"
                  className={`${styles.addSectionButton} ${!hasAvailableSections ? styles.addSectionButtonDisabled : ""}`}
                  onClick={() => {
                    if (!hasAvailableSections) return;
                    setAddSectionOpen((prev) => !prev);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={isAddSectionOpen}
                  aria-label="Add section"
                  disabled={!hasAvailableSections}
                >
                  <span className="material-icons-round">add</span>
                  Add section
                </button>
                {isAddSectionOpen ? (
                  <div className={styles.sectionMenu} role="menu" aria-label="Add section">
                    {availableSections.map((section) => (
                      <button
                        key={section.key}
                        type="button"
                        role="menuitem"
                        className={styles.sectionMenuItem}
                        onClick={() => handleAddSection(section.key)}
                      >
                        <span>{section.label}</span>
                        <span className="material-icons-round">add</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.topRight}>
            <div className={styles.modeToggle} role="group" aria-label="Draft mode">
              <button
                type="button"
                className={`${styles.modeOption} ${draft.mode === "section" ? styles.modeActive : ""}`}
                onClick={() => handleToggleMode("section")}
                aria-pressed={draft.mode === "section"}
              >
                Section
              </button>
              <button
                type="button"
                className={`${styles.modeOption} ${draft.mode === "full" ? styles.modeActive : ""}`}
                onClick={() => handleToggleMode("full")}
                aria-pressed={draft.mode === "full"}
              >
                Full Draft
              </button>
              <div
                className={`${styles.modeSlider} ${draft.mode === "full" ? styles.modeSliderRight : ""}`}
                aria-hidden="true"
              />
            </div>

            <div className={styles.saveBadge} role="status" aria-live="polite" aria-atomic="true">
              <span className="material-icons-round">{saveStatus === "saving" ? "sync" : "check_circle"}</span>
              {saveStatus === "saving" ? "Saving" : "Saved"}
            </div>
          </div>
        </div>

        <div className={styles.body} style={layoutVars}>
          {!draft.panels.ledgerCollapsed ? (
            <aside className={styles.ledger} aria-label="Evidence ledger" id={ledgerPanelId}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>
                  <span className="material-icons-round">article</span>
                  Evidence Ledger
                </div>
                <div className={styles.panelHeaderActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Add evidence"
                    onClick={() => setAddEvidenceOpen(true)}
                  >
                    <span className="material-icons-round">add</span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Collapse evidence ledger"
                    aria-controls={ledgerPanelId}
                    aria-expanded={!draft.panels.ledgerCollapsed}
                    onClick={() =>
                      updateDraft((prev) => ({
                        ...prev,
                        panels: { ...prev.panels, ledgerCollapsed: true },
                      }))
                    }
                  >
                    <span className="material-icons-round">chevron_left</span>
                  </button>
                </div>
              </div>

              <div className={styles.panelSubhead}>
                <span className={styles.subLabel}>Section</span>
                <span className={styles.subValue}>{activeSectionLabel}</span>
              </div>

              <div className={styles.panelBody}>
                {usedEvidence.length === 0 ? (
                  <div className={styles.emptyPanel}>
                    <div className={styles.emptyIcon}>
                      <span className="material-icons-round">library_add</span>
                    </div>
                    <h3>No evidence yet</h3>
                    <p>Add papers you’ll cite for this section.</p>
                    <button type="button" className="header-btn header-btn-primary" onClick={() => setAddEvidenceOpen(true)}>
                      Add evidence
                    </button>
                  </div>
                ) : (
                  <div className={styles.ledgerList}>
                    {usedEvidence.map((ref) => (
                      <div key={ref.id} className={styles.ledgerItem}>
                        <div className={styles.ledgerMeta}>
                          <div className={styles.ledgerLabel}>{referenceLabel(ref)}</div>
                          <div className={styles.ledgerTitle}>{ref.title}</div>
                        </div>
                        <div className={styles.ledgerActions}>
                          <button type="button" className={styles.smallBtn} onClick={() => insertCitation(ref)}>
                            Cite
                          </button>
                          <button type="button" className={styles.smallBtnGhost} onClick={() => handleRemoveEvidence(ref.id)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          ) : (
            <button
              type="button"
              className={styles.expandRailLeft}
              aria-label="Expand evidence ledger"
              aria-controls={ledgerPanelId}
              aria-expanded={!draft.panels.ledgerCollapsed}
              onClick={() => updateDraft((prev) => ({ ...prev, panels: { ...prev.panels, ledgerCollapsed: false } }))}
            >
              <span className="material-icons-round">chevron_right</span>
              <span className={styles.expandRailText}>Evidence</span>
            </button>
          )}

          <div
            className={`${styles.resizeHandle} ${draft.panels.ledgerCollapsed ? styles.resizeHandleHidden : ""}`}
            role="separator"
            aria-label="Resize evidence ledger"
            aria-hidden={draft.panels.ledgerCollapsed}
            onPointerDown={(e) => {
              if (draft.panels.ledgerCollapsed) return;
              dragStateRef.current = {
                side: "ledger",
                startX: e.clientX,
                startWidth: clamp(draft.panels.ledgerWidth, 260, 520),
              };
              document.body.style.userSelect = "none";
              document.body.style.cursor = "col-resize";
            }}
          />

          <section className={styles.center} aria-label="Draft editor">
            <div className={styles.centerHeader}>
              <div className={styles.centerTitle}>
                <span className="material-icons-round">edit</span>
                {activeSectionLabel}
              </div>
            </div>

            <EditorToolbar editor={draft.mode === "section" ? sectionEditor : activeEditor} />

            {draft.mode === "section" ? (
              <div
                className={styles.sectionEditorWrapper}
                role="tabpanel"
                id="draft-section-panel"
                aria-labelledby={`draft-tab-${draft.activeSection}`}
              >
                <div className={styles.editorSurface}>
                  <EditorContent editor={sectionEditor} />
                </div>
                <div className={styles.helperText}>{activeSectionMeta?.placeholder}</div>
              </div>
            ) : (
              <div className={styles.fullDraftScroll} role="region" aria-label="Full draft">
                {orderedSections.map((section) => (
                  <div
                    key={section.key}
                    className={styles.fullSection}
                    ref={(el) => {
                      sectionElRef.current[section.key] = el;
                    }}
                  >
                    <div className={styles.fullSectionHeading}>
                      <h2>{section.label}</h2>
                      <p className={styles.fullSectionHint}>{section.placeholder}</p>
                    </div>
                    <FullSectionEditor
                      sectionKey={section.key}
                      content={draft.contentBySection[section.key] ?? emptyDoc()}
                      onFocusSection={handleFocusSection}
                      onUpdateSection={handleUpdateSection}
                      registerEditor={registerEditor}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <div
            className={`${styles.resizeHandle} ${draft.panels.copilotCollapsed ? styles.resizeHandleHidden : ""}`}
            role="separator"
            aria-label="Resize copilot panel"
            aria-hidden={draft.panels.copilotCollapsed}
            onPointerDown={(e) => {
              if (draft.panels.copilotCollapsed) return;
              dragStateRef.current = {
                side: "copilot",
                startX: e.clientX,
                startWidth: clamp(draft.panels.copilotWidth, 300, 560),
              };
              document.body.style.userSelect = "none";
              document.body.style.cursor = "col-resize";
            }}
          />

          {!draft.panels.copilotCollapsed ? (
            <aside className={styles.copilot} aria-label="AI copilot" id={copilotPanelId}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>
                  <span className="material-icons-round">smart_toy</span>
                  Copilot
                </div>
                <div className={styles.panelHeaderActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Collapse copilot"
                    aria-controls={copilotPanelId}
                    aria-expanded={!draft.panels.copilotCollapsed}
                    onClick={() =>
                      updateDraft((prev) => ({
                        ...prev,
                        panels: { ...prev.panels, copilotCollapsed: true },
                      }))
                    }
                  >
                    <span className="material-icons-round">chevron_right</span>
                  </button>
                </div>
              </div>

              <div className={styles.panelSubhead}>
                <span className={styles.subLabel}>Context</span>
                <span className={styles.subValue}>
                  {activeSectionLabel} · {usedEvidence.length} evidence
                </span>
              </div>

              <div className={styles.copilotBody} ref={copilotListRef} onScroll={handleCopilotScroll}>
                {copilotMessages.length === 0 ? (
                  <div className={styles.emptyPanel}>
                    <div className={styles.emptyIcon}>
                      <span className="material-icons-round">tips_and_updates</span>
                    </div>
                    <h3>Draft faster</h3>
                    <p>Ask for an outline, rewrite, or evidence-backed phrasing.</p>
                    <div className={styles.suggestRow}>
                      <button
                        type="button"
                        className={styles.suggestChip}
                        onClick={() => setCopilotInput(`Outline the ${activeSectionLabel} section`)}
                      >
                        Outline
                      </button>
                      <button
                        type="button"
                        className={styles.suggestChip}
                        onClick={() => setCopilotInput(`Rewrite this paragraph for the ${activeSectionLabel} section:`)}
                      >
                        Rewrite
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.chatList}>
                    {copilotMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`${styles.chatMsg} ${msg.sender === "ai" ? styles.chatMsgAi : styles.chatMsgUser}`}
                      >
                        <div className={styles.chatBubble}>
                          <pre className={styles.chatText}>{msg.text}</pre>
                          {msg.sender === "ai" ? (
                            <div className={styles.chatActions}>
                              <button type="button" className={styles.smallBtn} onClick={() => insertCopilotText(msg.text)}>
                                Insert
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.copilotInputArea}>
                <form
                  className={styles.copilotInputRow}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCopilotSend();
                  }}
                >
                  <input
                    type="text"
                    value={copilotInput}
                    onChange={(e) => setCopilotInput(e.target.value)}
                    placeholder={`Ask about ${activeSectionLabel}…`}
                    aria-label="Copilot prompt"
                  />
                  <button type="submit" className={styles.iconBtn} aria-label="Send">
                    <span className="material-icons-round">send</span>
                  </button>
                </form>
              </div>
            </aside>
          ) : (
            <button
              type="button"
              className={styles.expandRailRight}
              aria-label="Expand copilot"
              aria-controls={copilotPanelId}
              aria-expanded={!draft.panels.copilotCollapsed}
              onClick={() => updateDraft((prev) => ({ ...prev, panels: { ...prev.panels, copilotCollapsed: false } }))}
            >
              <span className={styles.expandRailText}>Copilot</span>
              <span className="material-icons-round">chevron_left</span>
            </button>
          )}
        </div>
      </div>

      <div
        className={`modal-overlay ${isAddEvidenceOpen ? "active" : ""}`}
        aria-hidden={!isAddEvidenceOpen}
        ref={addEvidenceRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setAddEvidenceOpen(false);
          }
        }}
      >
        <div className="modal-glass" role="dialog" aria-modal="true" aria-labelledby="addEvidenceTitle">
          <div className="modal-header">
            <h2 id="addEvidenceTitle">Add Evidence</h2>
            <button className="close-modal-btn" aria-label="Close" onClick={() => setAddEvidenceOpen(false)}>
              <span className="material-icons-round">close</span>
            </button>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.modalSearch}>
              <span className={`material-icons-round ${styles.modalSearchIcon}`}>search</span>
              <input
                type="text"
                value={evidenceQuery}
                onChange={(e) => setEvidenceQuery(e.target.value)}
                placeholder="Search references…"
                aria-label="Search references"
              />
            </div>

            <div className={styles.modalList}>
              {filteredEvidence.map((ref) => {
                const isAdded = usedEvidenceIds.includes(ref.id);
                return (
                  <div key={ref.id} className={styles.modalItem}>
                    <div className={styles.modalItemMeta}>
                      <div className={styles.ledgerLabel}>{referenceLabel(ref)}</div>
                      <div className={styles.ledgerTitle}>{ref.title}</div>
                    </div>
                    <button
                      type="button"
                      className={isAdded ? styles.smallBtnDisabled : styles.smallBtn}
                      disabled={isAdded}
                      onClick={() => handleAddEvidence(ref.id)}
                    >
                      {isAdded ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function DraftPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DraftContent />
    </Suspense>
  );
}
