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
import { BaseBackButton } from "@/components/BaseBackButton";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { useProjects } from "@/contexts/ProjectsContext";
import { useLedger } from "@/contexts/LedgerContext";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import type { Study } from "@/types/ledger";
import { OPTIONAL_SECTION_KEYS, type DraftMode, DraftSectionId } from "@/types/draft";
import {
  CopilotMessage,
  DEFAULT_SECTION_FORMAT,
  type DraftSectionFormat,
  DraftState,
  emptyDoc,
  loadDraftState,
  saveDraftState,
  createDefaultDraftState,
} from "@/lib/draftStorage";
import { getDraftAction, saveDraftAction } from "@/app/actions/drafts";
import { listProjectFilesAction, createFileAssetAction, deleteFileAssetAction } from "@/app/actions/files";
import dynamic from "next/dynamic";
const ExportModal = dynamic(() => import("@/components/ExportModal").then(m => m.ExportModal), { ssr: false });
import type { FileAsset } from "@/types/files";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import styles from "./draft-studio.module.css";

import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import type { JSONContent } from "@tiptap/core";
import { Citation, ParagraphDirection, EditorToolbar, FullSectionEditor } from "./DraftEditors";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { AddEvidenceModal } from "./AddEvidenceModal";
import {
  EMPTY_IDS,
  studyLabel,
  isBaseSectionKey,
  isDraftMode,
  clamp,
  createCustomSectionId,
  customSectionPlaceholder,
  docHasContent,
  formatToVars,
  jsonToText,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  PARAGRAPH_SPACING_OPTIONS,
  BASE_SECTION_MAP,
  BASE_SECTION_META,
  type SectionMeta,
} from "./draft-helpers";

function DraftContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getProjectById } = useProjects();
  const { getStudiesByProject } = useLedger();
  const project = getProjectById(id);
  const studies = useMemo(() => (id ? getStudiesByProject(id) : []), [id, getStudiesByProject]);
  const { isCollapsed: copilotCollapsed, panelWidth: copilotPanelWidth, setPanelWidth: setCopilotPanelWidth, setCollapsed: setCopilotCollapsed } = useProjectCopilot();
  const { isEmbeddedInProjectShell } = useProjectShell();
  const { openPopupChat } = usePopupChat();

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
        panels: {
          ...loaded.panels,
          ledgerCollapsed: true,
        },
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
        const result = await getDraftAction(id);
        if (result.success && result.data && isActive) {
          setDraft(applyDraftFromQuery(result.data));
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
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
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

  const copilotEmptyState = useMemo(() => ({
    icon: "tips_and_updates",
    title: "Draft faster",
    description: "Ask for an outline, rewrite, or evidence-backed phrasing.",
    suggestions: [
      { label: "Outline", prompt: `Outline the ${activeSectionLabel} section` },
      { label: "Rewrite", prompt: `Rewrite this paragraph for the ${activeSectionLabel} section:` },
    ],
  }), [activeSectionLabel]);

  const scheduleSave = useCallback(
    (next: DraftState) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(async () => {
        if (id) {
          saveDraftState(id, next);
          const result = await saveDraftAction(id, next);
          if (!result.success) {
            console.error("Failed to save draft to backend:", result.error);
            setSaveStatus("error");
            return;
          }
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
    if (!id) return;
    const params = new URLSearchParams();
    params.set("mode", draft.mode);
    params.set("section", draft.activeSection);
    const nextUrl = `/project/${id}/draft?${params.toString()}`;
    if (lastSyncedUrlRef.current === nextUrl) return;
    lastSyncedUrlRef.current = nextUrl;
    router.replace(nextUrl, { scroll: false });
  }, [draft.activeSection, draft.mode, id, router]);

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
    () => studies.filter((s) => usedEvidenceIds.includes(s.id)),
    [studies, usedEvidenceIds]
  );

  const insertCitation = (study: Study) => {
    const editor = activeEditorRef.current
      ?? (draft.mode === "section" ? sectionEditor : editorBySectionRef.current[draft.activeSection])
      ?? null;
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: "citation", attrs: { id: study.id, label: studyLabel(study) } })
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

  // Check if draft has content to export
  const hasDraftContent = useMemo(() => {
    return orderedSections.some((section) => docHasContent(draft.contentBySection[section.id]));
  }, [draft.contentBySection, orderedSections]);

  // Load export history on mount
  useEffect(() => {
    if (!id) return;
    const loadExports = async () => {
      try {
        const result = await listProjectFilesAction(id);
        if (!result.success) { console.error("Failed to load exports:", result.error); return; }
        const exports = result.data
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

    // Collect all cited studies across all sections
    const allCitedIds = new Set<string>();
    for (const sectionIds of Object.values(draft.ledgerBySection)) {
      for (const studyId of sectionIds) {
        allCitedIds.add(studyId);
      }
    }

    // Add References section if there are citations
    const citedStudies = studies.filter((s) => allCitedIds.has(s.id));
    if (citedStudies.length > 0) {
      lines.push(`## References`);
      lines.push("");
      citedStudies
        .sort((a, b) => a.authors.localeCompare(b.authors))
        .forEach((study, idx) => {
          const journalInfo = study.details?.journal ? ` *${study.details.journal}*.` : "";
          const doiInfo = study.details?.doi ? ` https://doi.org/${study.details.doi}` : "";
          lines.push(`${idx + 1}. ${study.authors} (${study.year}). ${study.title}.${journalInfo}${doiInfo}`);
        });
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
    
    const createResult = await createFileAssetAction(id, {
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
    if (!createResult.success) throw new Error(createResult.error);
    const newExport = createResult.data;

    // Update local state
    setExportHistory((prev) => [newExport, ...prev]);
    setLatestExport(newExport);

    return newExport;
  }, [project, id, flushContentCommit, orderedSections, draft.contentBySection, draft.ledgerBySection, latestExport, studies]);

  // Delete export
  const handleDeleteExport = useCallback(async (fileId: string) => {
    if (!id) return;
    const delResult = await deleteFileAssetAction(id, fileId);
    if (!delResult.success) { console.error("Failed to delete export:", delResult.error); return; }
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
  }, [project, draft.contentBySection, orderedSections, flushContentCommit]);

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
    if (isEmbeddedInProjectShell) {
      return {
        "--ledger-width": `${ledger}px`,
        gridTemplateColumns: `${ledger}px 1px 1fr`,
      } as CSSProperties;
    }
    const copilot = copilotCollapsed ? rail : clamp(copilotPanelWidth, 300, 560);
    return {
      "--ledger-width": `${ledger}px`,
      "--copilot-width": `${copilot}px`,
    } as CSSProperties;
  }, [draft.panels, copilotCollapsed, copilotPanelWidth, isEmbeddedInProjectShell]);

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
      <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={styles.appMainOverride}>
        <div className={styles.notFound}>
          <h1>Project not found</h1>
          <Link href="/" className="btn-minimal">
            Back to Dashboard
          </Link>
        </div>
      </ProjectPageLayout>
    );
  }

  const copilotMessages = draft.copilotBySection[draft.activeSection] ?? [];
  const showResultsGuide = draft.activeSection === "results" && !docHasContent(draft.contentBySection.results);

  const pageContent = (
    <>
      <div className={styles.page}>
        <div className={styles.top}>
          <div className={styles.topLeft}>
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
              <span className="material-icons-round">{saveStatus === "saving" ? "sync" : saveStatus === "error" ? "error_outline" : "check_circle"}</span>
              {saveStatus === "saving" ? "Saving" : saveStatus === "error" ? "Save failed" : "Saved"}
            </div>
          </div>
        </div>

        <DemoGuideCard
          projectId={project.id}
          guideId="draft-evidence-chain"
          text="Citations in this draft should map directly to included studies in the Ledger. Ask the copilot to find evidence for any claim you highlight."
          className={styles.demoGuide}
        />
        {showResultsGuide ? (
          <DemoGuideCard
            projectId={project.id}
            guideId="draft-results-empty"
            text="This Results section is intentionally empty. Ask the copilot to draft a results summary from your included studies."
            className={styles.demoGuide}
          />
        ) : null}

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
                      className={styles.panelToggle}
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
                      <span className="material-icons-round">menu_open</span>
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
                    {usedEvidence.map((study) => (
                      <div key={study.id} className={styles.ledgerItem}>
                        <div className={styles.ledgerMeta}>
                          <div className={styles.ledgerLabel}>{studyLabel(study)}</div>
                          <div className={styles.ledgerTitle}>{study.title}</div>
                        </div>
                        <div className={styles.ledgerActions}>
                          <button type="button" className={styles.smallBtn} onClick={() => insertCitation(study)}>
                            Cite
                          </button>
                          <button type="button" className={styles.smallBtnGhost} onClick={() => handleRemoveEvidence(study.id)}>
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
            <div className={styles.collapsedRailLeft} aria-label="Evidence ledger (collapsed)">
              <button
                type="button"
                className={styles.panelToggle}
                aria-label="Expand evidence ledger"
                aria-controls={ledgerPanelId}
                aria-expanded={false}
                onClick={() => updateDraft((prev) => ({ ...prev, panels: { ...prev.panels, ledgerCollapsed: false } }))}
              >
                <span className="material-icons-round">menu_open</span>
              </button>
              <span className={styles.collapsedLabel}>Evidence</span>
            </div>
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
                {!isEmbeddedInProjectShell && <BaseBackButton href={`/project/${id}`} label="Back to project" className={styles.draftBackBtn} />}
                <span className="material-icons-round">edit</span>
                {activeSectionLabel}
              </div>
            </div>

            <div className={styles.toolbarRow}>
              <EditorToolbar
                editor={draft.mode === "section" ? sectionEditor : activeEditor}
                dir={paragraphDir}
                onAskAi={() => {
                  const ed = draft.mode === "section" ? sectionEditor : activeEditor;
                  const selectedText = ed && !ed.state.selection.empty
                    ? ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)
                    : ed?.getText().slice(0, 500) ?? "";
                  openPopupChat({
                    type: "draft_selection",
                    section: activeSectionLabel,
                    selectedText,
                  });
                }}
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

          {!isEmbeddedInProjectShell && (
            <>
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
                section={activeSectionLabel}
                contextDisplay={`${activeSectionLabel} · ${usedEvidence.length} evidence`}
                emptyState={copilotEmptyState}
                inputPlaceholder={`Ask about ${activeSectionLabel}…`}
                onInsert={insertCopilotText}
                panelId={copilotPanelId}
              />
            </>
          )}
        </div>
      </div>

      <AddEvidenceModal
        isOpen={isAddEvidenceOpen}
        onClose={() => setAddEvidenceOpen(false)}
        studies={studies}
        usedEvidenceIds={usedEvidenceIds}
        onAddEvidence={handleAddEvidence}
        projectId={id}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportDocx}
        latestExport={latestExport}
        exportHistory={exportHistory}
        onDeleteExport={handleDeleteExport}
      />
    </>
  );

  return (
    <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={styles.appMainOverride}>
      {pageContent}
    </ProjectPageLayout>
  );
}

export default function DraftPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DraftContent />
    </Suspense>
  );
}
