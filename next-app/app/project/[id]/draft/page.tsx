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
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BaseBackButton } from "@/components/BaseBackButton";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { DRAFT_SECTIONS, OPTIONAL_SECTION_KEYS, DraftMode, DraftSectionId, DraftSectionKey } from "@/types/draft";
import {
  CopilotMessage,
  DEFAULT_SECTION_FORMAT,
  DraftSectionFormat,
  DraftState,
  emptyDoc,
  loadDraftState,
  saveDraftState,
  createDefaultDraftState,
} from "@/lib/draftStorage";
import { getDraftAction, saveDraftAction } from "@/app/actions/drafts";
import { listProjectFilesAction, createFileAssetAction, deleteFileAssetAction } from "@/app/actions/files";
import { ExportModal } from "@/components/ExportModal";
import type { FileAsset } from "@/types/files";
import styles from "./draft-studio.module.css";

import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Extension, Node as TiptapNode, mergeAttributes } from "@tiptap/core";
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

const referenceLabel = (ref: Reference) => `${ref.authorsShort}, ${ref.year}`;

const isBaseSectionKey = (value: string | null): value is DraftSectionKey => {
  if (!value) return false;
  return DRAFT_SECTIONS.some((s) => s.key === value);
};

const isDraftMode = (value: string | null): value is DraftMode => value === "section" || value === "full";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type SectionMeta = {
  id: DraftSectionId;
  label: string;
  placeholder?: string;
  isCustom?: boolean;
};

const BASE_SECTION_META: SectionMeta[] = DRAFT_SECTIONS.map((section) => ({
  id: section.key,
  label: section.label,
  placeholder: section.placeholder,
  isCustom: false,
}));

const BASE_SECTION_MAP = new Map<DraftSectionId, SectionMeta>(
  BASE_SECTION_META.map((section) => [section.id, section])
);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const createCustomSectionId = (label: string) => {
  const slug = slugify(label);
  return `custom-${slug || "section"}-${Date.now().toString(36)}`;
};

const customSectionPlaceholder = (label: string) => `Draft the ${label} section.`;

const formatCitationLabel = (label: string) => {
  const trimmed = label.trim();
  if (!trimmed) return "(Citation)";
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) return trimmed;
  return `(${trimmed})`;
};

const docHasContent = (doc: JSONContent | null | undefined): boolean => {
  if (!doc || typeof doc !== "object") return false;
  const stack: JSONContent[] = [doc];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === "text" && typeof node.text === "string" && node.text.trim().length > 0) {
      return true;
    }
    if (node.type === "citation" || node.type === "hardBreak") {
      return true;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        if (child && typeof child === "object") {
          stack.push(child);
        }
      }
    }
  }
  return false;
};

const Citation = TiptapNode.create({
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
      formatCitationLabel(node.attrs.label ?? ""),
    ];
  },
});

const ParagraphDirection = Extension.create({
  name: "paragraphDirection",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => element.getAttribute("dir"),
            renderHTML: (attributes) => {
              if (!attributes.dir) return {};
              const dir = attributes.dir === "rtl" ? "rtl" : "ltr";
              return {
                dir,
                style: `direction: ${dir}; text-align: ${dir === "rtl" ? "right" : "left"};`,
              };
            },
          },
        },
      },
    ];
  },
});

const FONT_FAMILY_OPTIONS = [
  { label: "Default (Manuscript)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Sans (Outfit)", value: "Outfit, sans-serif" },
  { label: "Sans (Arial)", value: "Arial, Helvetica, sans-serif" },
  { label: "Mono (Courier)", value: "'Courier New', Courier, monospace" },
];

const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 30, 32, 36, 40, 48, 60, 72];
const LINE_HEIGHT_OPTIONS = [0.8, 0.9, 0.95, 1.0, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.75, 1.85, 2, 2.5, 3];
const PARAGRAPH_SPACING_OPTIONS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

const formatToVars = (format: DraftSectionFormat): CSSProperties =>
  ({
    "--editor-font-size": `${format.fontSize}px`,
    "--editor-line-height": `${format.lineHeight}`,
    "--editor-paragraph-spacing": `${format.paragraphSpacing}px`,
    "--editor-font-family": format.fontFamily,
  }) as CSSProperties;

type ToolbarProps = {
  editor: Editor | null;
  dir?: "ltr" | "rtl";
};

function EditorToolbar({ editor, dir = "ltr" }: ToolbarProps) {
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
        aria-label="Toggle text direction"
        onClick={() => {
          editor.chain().focus().updateAttributes("paragraph", { dir: dir === "rtl" ? "ltr" : "rtl" }).run();
        }}
      >
        <span className="material-icons-round">
          {dir === "rtl" ? "format_align_right" : "format_align_left"}
        </span>
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
  sectionId: DraftSectionId;
  content: JSONContent;
  onFocusSection: (key: DraftSectionId, editor: Editor) => void;
  onUpdateSection: (key: DraftSectionId, json: JSONContent) => void;
  registerEditor: (key: DraftSectionId, editor: Editor | null) => void;
  placeholderText?: string;
  surfaceClassName?: string;
  surfaceStyle?: CSSProperties;
};

function FullSectionEditor({
  sectionId,
  content,
  onFocusSection,
  onUpdateSection,
  registerEditor,
  placeholderText,
  surfaceClassName,
  surfaceStyle,
}: FullSectionEditorProps) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Underline,
        Citation,
        ParagraphDirection,
        Placeholder.configure({
          placeholder: placeholderText ?? "Start writing…",
        }),
      ],
      content,
      editorProps: {
        attributes: {
          class: styles.proseMirror,
        },
      },
      onFocus: ({ editor }) => onFocusSection(sectionId, editor),
      onUpdate: ({ editor }) => onUpdateSection(sectionId, editor.getJSON()),
    },
    []
  );

  useEffect(() => {
    registerEditor(sectionId, editor);
    return () => registerEditor(sectionId, null);
  }, [editor, registerEditor, sectionId]);

  return (
    <div className={surfaceClassName ?? styles.editorSurface} style={surfaceStyle}>
      <EditorContent editor={editor} />
    </div>
  );
}

function DraftContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { getProjectById } = useProjects();
  const project = getProjectById(id);
  const { isCollapsed: copilotCollapsed, panelWidth: copilotPanelWidth, setPanelWidth: setCopilotPanelWidth, setCollapsed: setCopilotCollapsed } = useProjectCopilot();

  const queryMode = searchParams.get("mode");
  const querySection = searchParams.get("section");

  const [draft, setDraft] = useState<DraftState>(createDefaultDraftState);

  const applyDraftFromQuery = useCallback(
    (loaded: DraftState) => {
      const mode = isDraftMode(queryMode) ? queryMode : loaded.mode;
      const order = [...loaded.sectionOrder];
      const rawQuery = querySection?.trim();
      const sectionFromQuery =
        rawQuery && (isBaseSectionKey(rawQuery) || loaded.customSections?.[rawQuery]) ? rawQuery : null;
      if (sectionFromQuery && !order.includes(sectionFromQuery)) {
        order.push(sectionFromQuery);
      }
      const candidate = sectionFromQuery ?? loaded.activeSection;
      const activeSection = order.includes(candidate) ? candidate : order[0] ?? loaded.activeSection;
      return {
        ...loaded,
        mode,
        activeSection,
        sectionOrder: order,
      };
    },
    [queryMode, querySection]
  );

  useEffect(() => {
    let isActive = true;
    const local = loadDraftState(id);
    setDraft(applyDraftFromQuery(local));

    const loadRemote = async () => {
      if (!id) return;
      try {
        const remote = await getDraftAction(id);
        if (remote && isActive) {
          setDraft(applyDraftFromQuery(remote));
        }
      } catch (err) {
        console.error("Failed to load draft from backend", err);
      }
    };

    loadRemote();
    return () => {
      isActive = false;
    };
  }, [id, applyDraftFromQuery]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeEditorRef = useRef<Editor | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const editorBySectionRef = useRef<Record<DraftSectionId, Editor | null>>({} as Record<DraftSectionId, Editor | null>);
  const sectionElRef = useRef<Record<DraftSectionId, HTMLElement | null>>({} as Record<DraftSectionId, HTMLElement | null>);
  const sectionTabRefs = useRef<Record<DraftSectionId, HTMLButtonElement | null>>({} as Record<
    DraftSectionId,
    HTMLButtonElement | null
  >);

  const activeSectionRef = useRef<DraftSectionId>(draft.activeSection);
  useEffect(() => {
    activeSectionRef.current = draft.activeSection;
  }, [draft.activeSection]);

  const pendingContentRef = useRef<Record<DraftSectionId, JSONContent>>(draft.contentBySection);
  const dirtyContentKeysRef = useRef<Set<DraftSectionId>>(new Set());
  const contentCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedUrlRef = useRef<string>("");

  const [isAddEvidenceOpen, setAddEvidenceOpen] = useState(false);
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const addEvidenceRef = useRef<HTMLDivElement | null>(null);
  const addEvidenceLastFocusRef = useRef<HTMLElement | null>(null);

  const [isAddSectionOpen, setAddSectionOpen] = useState(false);
  const addSectionRef = useRef<HTMLDivElement | null>(null);
  const [customSectionName, setCustomSectionName] = useState("");
  const addSectionInputRef = useRef<HTMLInputElement | null>(null);
  const dragKeyRef = useRef<DraftSectionId | null>(null);
  const [dragOverKey, setDragOverKey] = useState<DraftSectionId | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const [draggingKey, setDraggingKey] = useState<DraftSectionId | null>(null);
  const [isFormatOpen, setFormatOpen] = useState(false);
  const formatRef = useRef<HTMLDivElement | null>(null);
  const [paragraphDir, setParagraphDir] = useState<"ltr" | "rtl">("ltr");

  const [copilotInput, setCopilotInput] = useState("");
  const copilotListRef = useRef<HTMLDivElement | null>(null);
  const copilotAutoScrollRef = useRef(true);

  // Export modal state
  const [isExportModalOpen, setExportModalOpen] = useState(false);
  const [exportHistory, setExportHistory] = useState<FileAsset[]>([]);
  const [latestExport, setLatestExport] = useState<FileAsset | null>(null);

  const sectionMetaById = useMemo(() => {
    const map = new Map<DraftSectionId, SectionMeta>(BASE_SECTION_MAP);
    for (const [id, meta] of Object.entries(draft.customSections)) {
      map.set(id, {
        id,
        label: meta.label,
        placeholder: meta.placeholder,
        isCustom: true,
      });
    }
    return map;
  }, [draft.customSections]);

  const orderedSections = useMemo(
    () =>
      draft.sectionOrder
        .map((id) => sectionMetaById.get(id))
        .filter((section): section is SectionMeta => Boolean(section)),
    [draft.sectionOrder, sectionMetaById]
  );

  const sectionKeys = useMemo(() => orderedSections.map((section) => section.id), [orderedSections]);

  const fullDraftSections = useMemo(
    () => orderedSections.filter((section) => docHasContent(draft.contentBySection[section.id])),
    [draft.contentBySection, orderedSections]
  );

  const availableSectionKeys = useMemo(
    () => OPTIONAL_SECTION_KEYS.filter((key) => !draft.sectionOrder.includes(key)),
    [draft.sectionOrder]
  );

  const availableSections = useMemo(
    () =>
      availableSectionKeys
        .map((key) => sectionMetaById.get(key))
        .filter((section): section is SectionMeta => Boolean(section)),
    [availableSectionKeys, sectionMetaById]
  );
  const hasAvailableSections = availableSections.length > 0;

  const activeSectionMeta = useMemo(
    () => sectionMetaById.get(draft.activeSection) ?? null,
    [draft.activeSection, sectionMetaById]
  );
  const activeSectionLabel = activeSectionMeta?.label ?? "Draft";
  const formatVarsById = useMemo(() => {
    const map: Record<DraftSectionId, CSSProperties> = {};
    for (const [id, format] of Object.entries(draft.formattingBySection)) {
      map[id] = formatToVars(format);
    }
    return map;
  }, [draft.formattingBySection]);
  const activeFormat = draft.formattingBySection[draft.activeSection] ?? DEFAULT_SECTION_FORMAT;
  const activeFontFamily = FONT_FAMILY_OPTIONS.some((option) => option.value === activeFormat.fontFamily)
    ? activeFormat.fontFamily
    : DEFAULT_SECTION_FORMAT.fontFamily;
  const activeFormatVars = formatVarsById[draft.activeSection] ?? formatToVars(DEFAULT_SECTION_FORMAT);
  const ledgerPanelId = "draft-ledger-panel";
  const copilotPanelId = "draft-copilot-panel";

  const scheduleSave = useCallback(
    (next: DraftState) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(() => {
        if (id) {
          saveDraftState(id, next);
          saveDraftAction(id, next).catch((err) => {
            console.error("Failed to save draft to backend", err);
          });
        }
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
    (key: DraftSectionId, json: JSONContent) => {
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
    if (!id || typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("mode", draft.mode);
    params.set("section", draft.activeSection);
    const nextUrl = `/project/${id}/draft?${params.toString()}`;
    if (lastSyncedUrlRef.current === nextUrl) return;
    lastSyncedUrlRef.current = nextUrl;
    window.history.replaceState(null, "", nextUrl);
  }, [draft.activeSection, draft.mode, id]);

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

  const registerEditor = useCallback((key: DraftSectionId, editor: Editor | null) => {
    editorBySectionRef.current[key] = editor;
  }, []);

  const focusEditorForSection = useCallback((key: DraftSectionId) => {
    const editor = editorBySectionRef.current[key] ?? activeEditorRef.current;
    if (!editor) return;
    editor.chain().focus("end").run();
  }, []);

  const handleSelectSection = (key: DraftSectionId) => {
    if (draft.mode === "full") {
      const el = sectionElRef.current[key];
      if (!el) {
        openSectionInSectionMode(key);
        return;
      }

      updateDraft((prev) => (prev.activeSection === key ? prev : { ...prev, activeSection: key }));
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => focusEditorForSection(key), 250);
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

    const nextActiveSection =
      mode === "full"
        ? docHasContent(pendingContentRef.current[draft.activeSection])
          ? draft.activeSection
          : draft.sectionOrder.find((key) => docHasContent(pendingContentRef.current[key])) ?? draft.activeSection
        : draft.activeSection;

    updateDraft((prev) => {
      if (prev.mode === mode && prev.activeSection === nextActiveSection) return prev;
      return {
        ...prev,
        mode,
        activeSection: nextActiveSection,
      };
    });
    if (mode === "full") {
      setTimeout(() => {
        const el = sectionElRef.current[nextActiveSection];
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        focusEditorForSection(nextActiveSection);
      }, 0);
    } else {
      setTimeout(() => focusEditorForSection(nextActiveSection), 0);
    }
  };

  const openSectionInSectionMode = (key: DraftSectionId) => {
    const editor = activeEditorRef.current;
    if (editor) {
      queueContentUpdate(activeSectionRef.current, editor.getJSON());
    }
    flushContentCommit();
    updateDraft((prev) => {
      const order = prev.sectionOrder.includes(key) ? prev.sectionOrder : [...prev.sectionOrder, key];
      if (prev.mode === "section" && prev.activeSection === key && order === prev.sectionOrder) return prev;
      return {
        ...prev,
        mode: "section",
        activeSection: key,
        sectionOrder: order,
      };
    });
    setTimeout(() => {
      activeEditorRef.current?.chain().focus("end").run();
    }, 60);
  };

  const handleAddSection = (key: DraftSectionId) => {
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

  const handleAddCustomSection = () => {
    const name = customSectionName.trim();
    if (!name) return;
    const id = createCustomSectionId(name);
    updateDraft((prev) => {
      const next = [...prev.sectionOrder];
      const activeIndex = next.indexOf(prev.activeSection);
      const insertIndex = activeIndex >= 0 ? activeIndex + 1 : next.length;
      next.splice(insertIndex, 0, id);
      return {
        ...prev,
        sectionOrder: next,
        activeSection: id,
        customSections: {
          ...prev.customSections,
          [id]: { label: name, placeholder: customSectionPlaceholder(name) },
        },
        contentBySection: {
          ...prev.contentBySection,
          [id]: emptyDoc(),
        },
        ledgerBySection: {
          ...prev.ledgerBySection,
          [id]: [],
        },
        copilotBySection: {
          ...prev.copilotBySection,
          [id]: [],
        },
        formattingBySection: {
          ...prev.formattingBySection,
          [id]: { ...DEFAULT_SECTION_FORMAT },
        },
      };
    });
    setCustomSectionName("");
    setAddSectionOpen(false);
    setTimeout(() => {
      sectionTabRefs.current[id]?.focus();
    }, 0);
  };

  const handleRemoveSection = (key: DraftSectionId) => {
    updateDraft((prev) => {
      const idx = prev.sectionOrder.indexOf(key);
      if (idx < 0) return prev;
      const next = prev.sectionOrder.filter((k) => k !== key);
      if (next.length === 0) return prev; // Don't remove last section
      const newActive = next[Math.max(0, idx - 1)] ?? next[0];
      const nextCustom = { ...prev.customSections };
      if (key in nextCustom) delete nextCustom[key];
      const nextFormatting = { ...prev.formattingBySection };
      if (key in nextFormatting) delete nextFormatting[key];
      return {
        ...prev,
        sectionOrder: next,
        activeSection: newActive,
        customSections: nextCustom,
        formattingBySection: nextFormatting,
      };
    });
  };

  const updateSectionFormat = useCallback(
    (sectionId: DraftSectionId, updates: Partial<DraftSectionFormat>) => {
      updateDraft((prev) => {
        const current = prev.formattingBySection[sectionId] ?? DEFAULT_SECTION_FORMAT;
        return {
          ...prev,
          formattingBySection: {
            ...prev.formattingBySection,
            [sectionId]: {
              ...current,
              ...updates,
            },
          },
        };
      });
    },
    [updateDraft]
  );

  const handleDragStart = (event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionId) => {
    dragKeyRef.current = key;
    setDraggingKey(key);
    setDragOverKey(null);
    setDragOverPosition(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionId) => {
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

  const handleDrop = (event: ReactDragEvent<HTMLButtonElement>, targetKey: DraftSectionId) => {
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

  // Helper to convert TipTap JSON to plain text/markdown
  const jsonToText = useCallback((doc: JSONContent | null | undefined): string => {
    if (!doc) return "";

    const extractText = (node: JSONContent): string => {
      if (node.type === "text") {
        let text = node.text || "";
        // Apply marks for markdown
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === "bold") text = `**${text}**`;
            if (mark.type === "italic") text = `*${text}*`;
          }
        }
        return text;
      }
      if (node.type === "citation") {
        return node.attrs?.label ? `(${node.attrs.label})` : "(Citation)";
      }
      if (node.type === "hardBreak") {
        return "\n";
      }
      if (!node.content) return "";

      const children = node.content.map(extractText).join("");

      // Add formatting based on node type
      switch (node.type) {
        case "paragraph":
          return children + "\n\n";
        case "heading":
          const level = node.attrs?.level || 1;
          return "#".repeat(level) + " " + children + "\n\n";
        case "bulletList":
          return children;
        case "orderedList":
          return children;
        case "listItem":
          return "- " + children.trim() + "\n";
        case "blockquote":
          return "> " + children.split("\n").filter(Boolean).join("\n> ") + "\n\n";
        default:
          return children;
      }
    };

    return extractText(doc).trim();
  }, []);

  // Check if draft has content to export
  const hasDraftContent = useMemo(() => {
    return orderedSections.some((section) => docHasContent(draft.contentBySection[section.id]));
  }, [draft.contentBySection, orderedSections]);

  // Load export history on mount
  useEffect(() => {
    if (!id) return;
    const loadExports = async () => {
      try {
        const files = await listProjectFilesAction(id);
        const exports = files
          .filter((f) => f.kind === "export" && f.format === "docx")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setExportHistory(exports);
        setLatestExport(exports[0] || null);
      } catch (err) {
        console.error("Failed to load exports", err);
      }
    };
    loadExports();
  }, [id]);

  // Export draft as DOCX (creates file asset)
  const handleExportDocx = useCallback(async (): Promise<FileAsset> => {
    if (!project || !id) throw new Error("Project not found");

    // Flush any pending content
    flushContentCommit();

    // Build markdown content for export
    const lines: string[] = [];
    lines.push(`# ${project.name}`);
    lines.push("");
    lines.push(`*Draft exported on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`);
    lines.push("");

    for (const section of orderedSections) {
      const content = draft.contentBySection[section.id];
      if (!docHasContent(content)) continue;
      lines.push(`## ${section.label}`);
      lines.push("");
      lines.push(jsonToText(content));
      lines.push("");
    }

    const markdownContent = lines.join("\n");
    
    // Calculate version number
    const nextVersion = (latestExport?.version ?? 0) + 1;
    const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, "-")}-v${nextVersion}.docx`;
    
    // In real implementation: send to server-side export endpoint
    // For now, create a mock DOCX file asset
    const storagePath = `/exports/${id}/${filename}`;
    
    // Simulate export delay
    await new Promise((r) => setTimeout(r, 1500));
    
    const newExport = await createFileAssetAction(id, {
      kind: "export",
      format: "docx",
      filename,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: markdownContent.length * 2, // Rough estimate
      storagePath,
      publicUrl: storagePath,
      version: nextVersion,
      metadata: { sections: orderedSections.length },
    });

    // Update local state
    setExportHistory((prev) => [newExport, ...prev]);
    setLatestExport(newExport);
    
    return newExport;
  }, [project, id, flushContentCommit, orderedSections, draft.contentBySection, jsonToText, latestExport]);

  // Delete export
  const handleDeleteExport = useCallback(async (fileId: string) => {
    if (!id) return;
    await deleteFileAssetAction(id, fileId);
    setExportHistory((prev) => prev.filter((f) => f.id !== fileId));
    if (latestExport?.id === fileId) {
      const remaining = exportHistory.filter((f) => f.id !== fileId);
      setLatestExport(remaining[0] || null);
    }
  }, [id, latestExport, exportHistory]);

  // Export full draft as markdown (quick export)
  const handleExportDraft = useCallback(() => {
    if (!project) return;

    // Flush any pending content
    flushContentCommit();

    const lines: string[] = [];
    lines.push(`# ${project.name}`);
    lines.push("");
    lines.push(`*Draft exported on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Export each section in order
    for (const section of orderedSections) {
      const content = draft.contentBySection[section.id];
      if (!docHasContent(content)) continue;

      lines.push(`## ${section.label}`);
      lines.push("");
      lines.push(jsonToText(content));
      lines.push("");
    }

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `draft-${project.id}-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [project, draft.contentBySection, orderedSections, jsonToText, flushContentCommit]);

  const handleFocusSection = useCallback(
    (key: DraftSectionId, editor: Editor) => {
      activeEditorRef.current = editor;
      setActiveEditor(editor);
      if (draft.mode === "full") {
        updateDraft((prev) => (prev.activeSection === key ? prev : { ...prev, activeSection: key }));
      }
    },
    [draft.mode, updateDraft]
  );

  const handleUpdateSection = useCallback(
    (key: DraftSectionId, json: JSONContent) => {
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
    if (!isFormatOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!formatRef.current) return;
      if (event.target instanceof Node && !formatRef.current.contains(event.target)) {
        setFormatOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFormatOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isFormatOpen]);

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
        ParagraphDirection,
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

  const lastLoadedSectionRef = useRef<DraftSectionId | null>(null);

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

  const formattingEditor = draft.mode === "section" ? sectionEditor : activeEditor;

  useEffect(() => {
    if (!formattingEditor) return;
    const syncDir = () => {
      const dir = formattingEditor.getAttributes("paragraph")?.dir === "rtl" ? "rtl" : "ltr";
      setParagraphDir(dir);
    };
    syncDir();
    formattingEditor.on("selectionUpdate", syncDir);
    formattingEditor.on("transaction", syncDir);
    return () => {
      formattingEditor.off("selectionUpdate", syncDir);
      formattingEditor.off("transaction", syncDir);
    };
  }, [formattingEditor]);

  const setParagraphDirection = (dir: "ltr" | "rtl") => {
    if (!formattingEditor) return;
    formattingEditor.chain().focus().updateAttributes("paragraph", { dir }).run();
    setParagraphDir(dir);
  };

  const layoutVars = useMemo(() => {
    const rail = 48;
    const ledger = draft.panels.ledgerCollapsed ? rail : clamp(draft.panels.ledgerWidth, 260, 520);
    const copilot = copilotCollapsed ? rail : clamp(copilotPanelWidth, 300, 560);
    return {
      "--ledger-width": `${ledger}px`,
      "--copilot-width": `${copilot}px`,
    } as CSSProperties;
  }, [draft.panels, copilotCollapsed, copilotPanelWidth]);

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
        setCopilotPanelWidth(next);
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
    <AppShell activeNav="projects" noMainPadding initiallyCollapsed mainClassName={styles.appMainOverride}>
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
                  const isDragging = draggingKey === section.id;
                  const isDragOver = dragOverKey === section.id && draggingKey && draggingKey !== section.id;
                  const dropClass =
                    isDragOver && dragOverPosition === "after"
                      ? styles.sectionTabDropAfter
                      : isDragOver && dragOverPosition === "before"
                        ? styles.sectionTabDropBefore
                        : "";
                  const canRemove = orderedSections.length > 1;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      role="tab"
                      draggable
                      aria-grabbed={isDragging}
                      aria-selected={draft.activeSection === section.id}
                      aria-controls={draft.mode === "section" ? "draft-section-panel" : undefined}
                      id={`draft-tab-${section.id}`}
                      className={`${styles.sectionTab} ${draft.activeSection === section.id ? styles.sectionTabActive : ""} ${isDragging ? styles.sectionTabDragging : ""
                        } ${dropClass}`}
                      onClick={() => handleSelectSection(section.id)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (canRemove) handleRemoveSection(section.id);
                      }}
                      onKeyDown={(event) => handleSectionKeyDown(event, index)}
                      onDragStart={(event) => handleDragStart(event, section.id)}
                      onDragOver={(event) => handleDragOver(event, section.id)}
                      onDrop={(event) => handleDrop(event, section.id)}
                      onDragEnd={handleDragEnd}
                      tabIndex={draft.activeSection === section.id ? 0 : -1}
                      title={canRemove ? "Double-click to remove" : ""}
                      ref={(el) => {
                        sectionTabRefs.current[section.id] = el;
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
                  className={styles.addSectionButton}
                  onClick={() => setAddSectionOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isAddSectionOpen}
                  aria-label="Add section"
                >
                  <span className="material-icons-round">add</span>
                  Add
                </button>
                {isAddSectionOpen ? (
                  <div className={styles.sectionMenu} role="menu" aria-label="Add section">
                    <div className={styles.customSectionInput}>
                      <input
                        ref={addSectionInputRef}
                        type="text"
                        placeholder="New section name..."
                        value={customSectionName}
                        onChange={(e) => setCustomSectionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddCustomSection();
                          }
                        }}
                        className={styles.customSectionField}
                      />
                      <button
                        type="button"
                        className={styles.customSectionBtn}
                        onClick={handleAddCustomSection}
                        disabled={!customSectionName.trim()}
                      >
                        <span className="material-icons-round">add</span>
                      </button>
                    </div>
                    {availableSections.length > 0 && (
                      <div className={styles.sectionMenuDivider} />
                    )}
                    {availableSections.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        role="menuitem"
                        className={styles.sectionMenuItem}
                        onClick={() => handleAddSection(section.id)}
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

            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => setExportModalOpen(true)}
              disabled={!hasDraftContent}
              title={hasDraftContent ? "Export draft" : "Add content to enable export"}
            >
              <span className="material-icons-round">download</span>
              Export
            </button>

            <div className={styles.saveBadge} role="status" aria-live="polite" aria-atomic="true">
              <span className="material-icons-round">{saveStatus === "saving" ? "sync" : "check_circle"}</span>
              {saveStatus === "saving" ? "Saving" : "Saved"}
            </div>
          </div>
        </div>

        <div className={styles.body} style={layoutVars}>
          {!draft.panels.ledgerCollapsed ? (
            <aside className={styles.ledger} aria-label="Evidence ledger" id={ledgerPanelId}>
              <div className={styles.ledgerHeader}>
                <div className={styles.ledgerHeaderTop}>
                  <span className={styles.ledgerTitle}>Evidence Ledger</span>
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
                <div className={styles.ledgerContext}>
                  <span className={styles.ledgerContextLabel}>for</span>
                  <span className={styles.ledgerContextSection}>{activeSectionLabel}</span>
                </div>
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
                <BaseBackButton href={`/project/${id}`} className={styles.draftBackBtn} />
                <span className="material-icons-round">edit</span>
                {activeSectionLabel}
              </div>
            </div>

            <div className={styles.toolbarRow}>
              <EditorToolbar
                editor={draft.mode === "section" ? sectionEditor : activeEditor}
                dir={paragraphDir}
              />
              <div className={styles.formattingControls} ref={formatRef}>
                <button
                  type="button"
                  className={styles.formatToggle}
                  aria-expanded={isFormatOpen}
                  aria-label="Open formatting options"
                  onClick={() => setFormatOpen((prev) => !prev)}
                >
                  <span className="material-icons-round">tune</span>
                  Formatting
                </button>
                {isFormatOpen ? (
                  <div className={styles.formatPanel} role="dialog" aria-label="Formatting options">
                    <div className={styles.formatGrid}>
                      <label className={styles.formatField}>
                        <span className={styles.formatFieldLabel}>Font</span>
                        <select
                          className={styles.formatSelect}
                          value={activeFontFamily}
                          onChange={(event) =>
                            updateSectionFormat(draft.activeSection, { fontFamily: event.target.value })
                          }
                        >
                          {FONT_FAMILY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.formatField}>
                        <span className={styles.formatFieldLabel}>Font size</span>
                        <select
                          className={styles.formatSelect}
                          value={activeFormat.fontSize}
                          onChange={(event) =>
                            updateSectionFormat(draft.activeSection, { fontSize: Number(event.target.value) })
                          }
                        >
                          {FONT_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size}px
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.formatField}>
                        <span className={styles.formatFieldLabel}>Line spacing</span>
                        <select
                          className={styles.formatSelect}
                          value={activeFormat.lineHeight}
                          onChange={(event) =>
                            updateSectionFormat(draft.activeSection, { lineHeight: Number(event.target.value) })
                          }
                        >
                          {LINE_HEIGHT_OPTIONS.map((height) => (
                            <option key={height} value={height}>
                              {height}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.formatField}>
                        <span className={styles.formatFieldLabel}>Paragraph spacing</span>
                        <select
                          className={styles.formatSelect}
                          value={activeFormat.paragraphSpacing}
                          onChange={(event) =>
                            updateSectionFormat(draft.activeSection, { paragraphSpacing: Number(event.target.value) })
                          }
                        >
                          {PARAGRAPH_SPACING_OPTIONS.map((space) => (
                            <option key={space} value={space}>
                              {space}px
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {draft.mode === "section" ? (
              <div
                className={styles.sectionEditorWrapper}
                role="tabpanel"
                id="draft-section-panel"
                aria-labelledby={`draft-tab-${draft.activeSection}`}
              >
                <div className={styles.editorSurface} style={activeFormatVars}>
                  <EditorContent editor={sectionEditor} />
                </div>
                <div className={styles.helperText}>{activeSectionMeta?.placeholder}</div>
              </div>
            ) : (
              <div className={styles.fullDraftScroll} role="region" aria-label="Full draft">
                <article className={styles.manuscript} aria-label="Manuscript draft">
                  <header className={styles.manuscriptHeader}>
                    <h1 className={styles.manuscriptTitle}>{project.name}</h1>
                    <p className={styles.manuscriptSubtitle}>Full manuscript view — sections appear as you write them.</p>
                  </header>

                  {fullDraftSections.length === 0 ? (
                    <div className={styles.emptyPanel}>
                      <div className={styles.emptyIcon}>
                        <span className="material-icons-round">description</span>
                      </div>
                      <h3>Nothing written yet</h3>
                      <p>Start drafting in Section mode — completed sections will show up here in order.</p>
                      <button
                        type="button"
                        className={styles.smallBtn}
                        onClick={() => openSectionInSectionMode(draft.sectionOrder[0] ?? "abstract")}
                      >
                        Start drafting
                      </button>
                    </div>
                  ) : (
                    fullDraftSections.map((section) => (
                      <section
                        key={section.id}
                        className={`${styles.manuscriptSection} ${draft.activeSection === section.id ? styles.manuscriptSectionActive : ""
                          }`}
                        ref={(el) => {
                          sectionElRef.current[section.id] = el;
                        }}
                        aria-labelledby={`manuscript-${section.id}`}
                      >
                        <header className={styles.manuscriptSectionHeader}>
                          <h2 id={`manuscript-${section.id}`} className={styles.manuscriptSectionTitle}>
                            {section.label}
                          </h2>
                        </header>
                        <FullSectionEditor
                          sectionId={section.id}
                          content={draft.contentBySection[section.id] ?? emptyDoc()}
                          placeholderText={section.placeholder}
                          surfaceClassName={styles.manuscriptEditorSurface}
                          surfaceStyle={formatVarsById[section.id] ?? formatToVars(DEFAULT_SECTION_FORMAT)}
                          onFocusSection={handleFocusSection}
                          onUpdateSection={handleUpdateSection}
                          registerEditor={registerEditor}
                        />
                      </section>
                    ))
                  )}
                </article>
              </div>
            )}
          </section>

          <div
            className={`${styles.resizeHandle} ${copilotCollapsed ? styles.resizeHandleHidden : ""}`}
            role="separator"
            aria-label="Resize copilot panel"
            aria-hidden={copilotCollapsed}
            onPointerDown={(e) => {
              if (copilotCollapsed) return;
              dragStateRef.current = {
                side: "copilot",
                startX: e.clientX,
                startWidth: clamp(copilotPanelWidth, 300, 560),
              };
              document.body.style.userSelect = "none";
              document.body.style.cursor = "col-resize";
            }}
          />

          <ProjectCopilot
            page="draft"
            section={draft.activeSection}
            contextDisplay={`${activeSectionLabel} · ${usedEvidence.length} evidence`}
            emptyState={{
              icon: "tips_and_updates",
              title: "Draft faster",
              description: "Ask for an outline, rewrite, or evidence-backed phrasing.",
              suggestions: [
                { label: "Outline", prompt: `Outline the ${activeSectionLabel} section` },
                { label: "Rewrite", prompt: `Rewrite this paragraph for the ${activeSectionLabel} section:` },
              ],
            }}
            inputPlaceholder={`Ask about ${activeSectionLabel}…`}
            onInsert={insertCopilotText}
            panelId={copilotPanelId}
          />
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

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportDocx}
        latestExport={latestExport}
        exportHistory={exportHistory}
        onDeleteExport={handleDeleteExport}
      />
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
