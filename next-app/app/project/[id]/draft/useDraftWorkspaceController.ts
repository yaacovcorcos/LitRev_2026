"use client";

import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { saveDraftAction } from "@/app/actions/drafts";
import {
  DEFAULT_SECTION_FORMAT,
  createDefaultDraftState,
  emptyDoc,
  loadDraftState,
  saveDraftState,
  type DraftSectionFormat,
  type DraftState,
} from "@/lib/draftStorage";
import { useProjectData } from "@/hooks/useProjectData";
import { buildCompatContentBySection } from "@/lib/manuscript/schema";
import {
  extractManuscriptOutline,
  insertManuscriptSection,
  moveTopLevelBlock,
  removeManuscriptSection,
  reorderManuscriptSection,
} from "@/lib/manuscript/workspace";
import { useProjects } from "@/contexts/ProjectsContext";
import { useLedger } from "@/contexts/LedgerContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { useContextCaptureActions } from "@/hooks/useContextCaptureActions";
import { buildDraftSelectionTarget } from "@/lib/context-capture/targets";
import { getContextCaptureAction } from "@/lib/context-capture/actions";
import { COARSE_POINTER_MEDIA_QUERY, MOBILE_VIEWPORT_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { isMobileDraftV2Enabled } from "@/lib/mobile/feature-flags";
import { isContextToolbarV1Enabled } from "@/lib/context-capture/feature-flags";
import { useDraftExport } from "./useDraftExport";
import { applyManuscriptDocToDraftState, getDraftCitationIssues, synchronizeDraftState } from "./draft-workspace-state";
import {
  BASE_SECTION_MAP,
  EMPTY_IDS,
  FONT_FAMILY_OPTIONS,
  createCustomSectionId,
  customSectionPlaceholder,
  docHasContent,
  formatToVars,
  isBaseSectionKey,
  studyLabel,
  type SectionMeta,
} from "./draft-helpers";
import {
  buildDraftOutlineViewModel,
  deriveDraftSelectionState,
  getBlockFocusPosition,
  getHeadingFocusPosition,
  getSectionFocusPosition,
  type DraftEditorMap,
  type DraftOutlineViewModel,
  type DraftSectionStatus,
  type DraftSelectionState,
} from "./workspace-view-model";
import { OPTIONAL_SECTION_KEYS, type DraftSectionId } from "@/types/draft";
import type { ManuscriptDocument } from "@/types/manuscript";

type ControllerParams = {
  projectId: string;
};

function createCitationUid(sectionId: DraftSectionId): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cit-${sectionId}-${Date.now().toString(36)}-${rand}`;
}

function withManuscriptDocument(state: DraftState, manuscript: ManuscriptDocument): DraftState {
  return {
    ...state,
    sectionOrder: manuscript.sections.map((section) => section.sectionId),
    manuscript,
    contentBySection: buildCompatContentBySection(manuscript),
  };
}

export function useDraftWorkspaceController({ projectId }: ControllerParams) {
  const mobileDraftV2Enabled = isMobileDraftV2Enabled();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getProjectById, isLoadingProjects, projectsError } = useProjects();
  const { getStudiesByProject } = useLedger();
  const { isEmbeddedInProjectShell } = useProjectShell();
  const { openPopupChat } = usePopupChat();
  const { captureEnabled, openPopupForTarget, runAction } = useContextCaptureActions();
  const contextToolbarEnabled = isContextToolbarV1Enabled();
  const sendToCopilotAction = getContextCaptureAction("send_to_copilot");
  const rewriteSelectionAction = getContextCaptureAction("rewrite_selection");
  const checkClaimSupportAction = getContextCaptureAction("check_claim_support");

  const project = getProjectById(projectId);
  const studies = useMemo(
    () => (projectId ? getStudiesByProject(projectId) : []),
    [getStudiesByProject, projectId],
  );
  const querySection = searchParams.get("section");

  const [draft, setDraft] = useState<DraftState>(createDefaultDraftState);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [isAddEvidenceOpen, setAddEvidenceOpen] = useState(false);
  const [isFormatOpen, setFormatOpen] = useState(false);
  const [customSectionName, setCustomSectionName] = useState("");
  const [selectionState, setSelectionState] = useState<DraftSelectionState>({
    activeSection: draft.activeSection,
    activeBlockId: null,
  });
  const [editorMap, setEditorMap] = useState<DraftEditorMap | null>(null);
  const [isCompactWorkspace, setCompactWorkspace] = useState(false);
  const [isStructureDrawerOpen, setStructureDrawerOpen] = useState(false);
  const [isContextDrawerOpen, setContextDrawerOpen] = useState(false);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<DraftSectionId>>(new Set());
  const [draggingSectionId, setDraggingSectionId] = useState<DraftSectionId | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<DraftSectionId | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const [paragraphDir, setParagraphDir] = useState<"ltr" | "rtl">("ltr");
  const [canRunDraftContextActions, setCanRunDraftContextActions] = useState(false);
  const [showDesktopContextToolbar, setShowDesktopContextToolbar] = useState(false);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const formatRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedUrlRef = useRef("");
  const initialJumpSectionRef = useRef<DraftSectionId | null>(querySection?.trim() ? querySection : null);

  const { draft: cachedDraft, warmDomain } = useProjectData();
  const appliedCachedRef = useRef(false);

  const normalizeForEditor = useCallback(
    (state: DraftState) => synchronizeDraftState({ state, studies, includeNumberInNodes: true }),
    [studies],
  );

  const normalizeForPersistence = useCallback(
    (state: DraftState) => synchronizeDraftState({ state, studies, includeNumberInNodes: false }),
    [studies],
  );

  const applyDraftFromQuery = useCallback((loaded: DraftState) => {
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
      activeSection,
      sectionOrder: order,
    };
  }, [querySection]);

  const scheduleSave = useCallback(
    (next: DraftState) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(async () => {
        const persistableState = normalizeForPersistence(next);
        if (!projectId) return;
        saveDraftState(projectId, persistableState);
        const result = await saveDraftAction(projectId, persistableState);
        if (!result.success) {
          console.error("Failed to save draft to backend:", result.error);
          setSaveStatus("error");
          return;
        }
        setSaveStatus("saved");
      }, 400);
    },
    [normalizeForPersistence, projectId],
  );

  const commitDraft = useCallback((updater: (prev: DraftState) => DraftState) => {
    setDraft((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const setDraftLocal = useCallback((updater: (prev: DraftState) => DraftState) => {
    setDraft((prev) => updater(prev));
  }, []);

  useEffect(() => {
    const local = loadDraftState(projectId);
    const nextDraft = normalizeForEditor(applyDraftFromQuery(local));
    setDraft(nextDraft);
    setSelectionState((prev) => ({ ...prev, activeSection: nextDraft.activeSection }));
    appliedCachedRef.current = false;
  }, [applyDraftFromQuery, normalizeForEditor, projectId]);

  useEffect(() => {
    if (appliedCachedRef.current) return;
    if (cachedDraft.state === "ready" && cachedDraft.data) {
      const nextDraft = normalizeForEditor(applyDraftFromQuery(cachedDraft.data));
      setDraft(nextDraft);
      setSelectionState((prev) => ({ ...prev, activeSection: nextDraft.activeSection }));
      appliedCachedRef.current = true;
    } else if (cachedDraft.state === "idle") {
      warmDomain("draft");
    }
  }, [applyDraftFromQuery, cachedDraft, normalizeForEditor, warmDomain]);

  useEffect(() => {
    setDraft((prev) => normalizeForEditor(prev));
  }, [normalizeForEditor]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewportQuery = window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY);
    const pointerQuery = window.matchMedia(COARSE_POINTER_MEDIA_QUERY);
    const updateWorkspaceMode = () => {
      setCompactWorkspace(viewportQuery.matches || pointerQuery.matches);
      setShowDesktopContextToolbar(!viewportQuery.matches && !pointerQuery.matches && contextToolbarEnabled);
    };
    updateWorkspaceMode();
    if (typeof viewportQuery.addEventListener === "function") {
      viewportQuery.addEventListener("change", updateWorkspaceMode);
      pointerQuery.addEventListener("change", updateWorkspaceMode);
      return () => {
        viewportQuery.removeEventListener("change", updateWorkspaceMode);
        pointerQuery.removeEventListener("change", updateWorkspaceMode);
      };
    }
    viewportQuery.addListener(updateWorkspaceMode);
    pointerQuery.addListener(updateWorkspaceMode);
    return () => {
      viewportQuery.removeListener(updateWorkspaceMode);
      pointerQuery.removeListener(updateWorkspaceMode);
    };
  }, [contextToolbarEnabled]);

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
    if (!projectId) return;
    const params = new URLSearchParams();
    params.set("section", draft.activeSection);
    const nextUrl = `/project/${projectId}/draft?${params.toString()}`;
    if (lastSyncedUrlRef.current === nextUrl) return;
    lastSyncedUrlRef.current = nextUrl;
    router.replace(nextUrl, { scroll: false });
  }, [draft.activeSection, projectId, router]);

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
    [draft.sectionOrder, sectionMetaById],
  );

  const availableSections = useMemo(
    () =>
      OPTIONAL_SECTION_KEYS
        .filter((key) => !draft.sectionOrder.includes(key))
        .map((key) => sectionMetaById.get(key))
        .filter((section): section is SectionMeta => Boolean(section)),
    [draft.sectionOrder, sectionMetaById],
  );

  const outline = useMemo(() => extractManuscriptOutline(draft.manuscript), [draft.manuscript]);
  const citationIssues = useMemo(() => getDraftCitationIssues(draft, studies), [draft, studies]);
  const outlineView = useMemo<DraftOutlineViewModel[]>(
    () => buildDraftOutlineViewModel({ draft, outline, citationIssues }),
    [citationIssues, draft, outline],
  );

  const activeSectionMeta = useMemo(
    () => sectionMetaById.get(draft.activeSection) ?? null,
    [draft.activeSection, sectionMetaById],
  );
  const activeSectionLabel = activeSectionMeta?.label ?? "Draft";
  const isReferencesSection = draft.activeSection === "references";

  const formatVarsById = useMemo(() => {
    const map: Record<DraftSectionId, Record<string, string>> = {};
    for (const [id, format] of Object.entries(draft.formattingBySection)) {
      map[id] = formatToVars(format) as Record<string, string>;
    }
    return map;
  }, [draft.formattingBySection]);

  const activeFormat = draft.formattingBySection[draft.activeSection] ?? DEFAULT_SECTION_FORMAT;
  const activeFontFamily = FONT_FAMILY_OPTIONS.some((option) => option.value === activeFormat.fontFamily)
    ? activeFormat.fontFamily
    : DEFAULT_SECTION_FORMAT.fontFamily;

  const usedEvidenceIds = draft.ledgerBySection[draft.activeSection] ?? EMPTY_IDS;
  const usedEvidence = useMemo(
    () => studies.filter((study) => usedEvidenceIds.includes(study.id)),
    [studies, usedEvidenceIds],
  );

  const hasDraftContent = useMemo(
    () => orderedSections.some((section) => docHasContent(draft.contentBySection[section.id])),
    [draft.contentBySection, orderedSections],
  );

  const copilotEmptyState = useMemo(() => ({
    icon: "tips_and_updates",
    title: "Draft faster",
    description: "Ask for an outline, rewrite, or evidence-backed phrasing.",
    suggestions: [
      { label: "Outline", prompt: `Outline the ${activeSectionLabel} section` },
      { label: "Rewrite", prompt: `Rewrite this paragraph for the ${activeSectionLabel} section:` },
    ],
  }), [activeSectionLabel]);

  const getDraftSnapshot = useCallback(() => draft, [draft]);

  const {
    isExportModalOpen,
    setExportModalOpen,
    exportHistory,
    latestExport,
    exportMode,
    setExportMode,
    blockingCitationIssuesCount,
    citationIssues: exportCitationIssues,
    handleExportDocx,
    handleDeleteExport,
  } = useDraftExport({
    projectId,
    projectName: project?.name,
    draft,
    getDraftSnapshot,
    orderedSections,
    studies,
    flushContentCommit: () => undefined,
  });

  const insertCopilotText = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor || isReferencesSection) return;
    editor.chain().focus().insertContent(text).run();
  }, [isReferencesSection]);

  const applyDocumentMutation = useCallback((updater: (prev: DraftState) => DraftState) => {
    commitDraft((prev) => {
      const next = updater(prev);
      return normalizeForEditor(next);
    });
  }, [commitDraft, normalizeForEditor]);

  const updateActiveSectionFromSelection = useCallback((nextSelection: DraftSelectionState) => {
    setSelectionState(nextSelection);
    setDraftLocal((prev) => {
      if (prev.activeSection === nextSelection.activeSection) return prev;
      return {
        ...prev,
        activeSection: nextSelection.activeSection,
      };
    });
  }, [setDraftLocal]);

  const handleEditorReady = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
    setEditorInstance(editor);
  }, []);

  const handleEditorMapChange = useCallback((nextMap: DraftEditorMap) => {
    setEditorMap(nextMap);
  }, []);

  const handleSelectionUpdate = useCallback((selectionFrom: number, nextMap: DraftEditorMap) => {
    const nextSelection = deriveDraftSelectionState({
      editorMap: nextMap,
      selectionFrom,
      fallbackSection: draft.activeSection,
    });
    updateActiveSectionFromSelection(nextSelection);
  }, [draft.activeSection, updateActiveSectionFromSelection]);

  const handleManuscriptChange = useCallback((manuscriptDoc: JSONContent) => {
    applyDocumentMutation((prev) => applyManuscriptDocToDraftState(prev, manuscriptDoc));
  }, [applyDocumentMutation]);

  useEffect(() => {
    if (!editorRef.current || !editorMap || !initialJumpSectionRef.current) return;
    const targetSection = initialJumpSectionRef.current;
    const focusPosition = getSectionFocusPosition(editorMap, targetSection);
    if (focusPosition == null) return;
    editorRef.current.chain().focus(focusPosition).run();
    initialJumpSectionRef.current = null;
  }, [editorMap]);

  const focusSection = useCallback((sectionId: DraftSectionId) => {
    if (!editorRef.current || !editorMap) return;
    const focusPosition = getSectionFocusPosition(editorMap, sectionId);
    if (focusPosition == null) return;
    editorRef.current.chain().focus(focusPosition).run();
    setStructureDrawerOpen(false);
    setContextDrawerOpen(false);
  }, [editorMap]);

  const focusHeading = useCallback((sectionId: DraftSectionId, headingId: string) => {
    if (!editorRef.current || !editorMap) return;
    const focusPosition = getHeadingFocusPosition(editorMap, sectionId, headingId);
    if (focusPosition == null) return;
    editorRef.current.chain().focus(focusPosition).run();
    setStructureDrawerOpen(false);
  }, [editorMap]);

  const focusBlock = useCallback((blockId: string) => {
    if (!editorRef.current || !editorMap) return;
    const focusPosition = getBlockFocusPosition(editorMap, blockId);
    if (focusPosition == null) return;
    editorRef.current.chain().focus(focusPosition).run();
  }, [editorMap]);

  const addOptionalSection = useCallback((sectionId: DraftSectionId) => {
    const meta = sectionMetaById.get(sectionId);
    if (!meta) return;
    applyDocumentMutation((prev) => {
      const nextDocument = insertManuscriptSection({
        document: prev.manuscript,
        section: {
          sectionId,
          sectionNodeId: `sec:${sectionId}`,
          kind: "base",
          label: meta.label,
          ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
        },
        afterSectionId: prev.activeSection,
        content: emptyDoc(),
      });
      return withManuscriptDocument({
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [sectionId]: [],
        },
        copilotBySection: {
          ...prev.copilotBySection,
          [sectionId]: [],
        },
        formattingBySection: {
          ...prev.formattingBySection,
          [sectionId]: { ...DEFAULT_SECTION_FORMAT },
        },
        activeSection: sectionId,
      }, nextDocument);
    });
  }, [applyDocumentMutation, sectionMetaById]);

  const addCustomSection = useCallback(() => {
    const label = customSectionName.trim();
    if (!label) return;
    const sectionId = createCustomSectionId(label);
    applyDocumentMutation((prev) => {
      const nextDocument = insertManuscriptSection({
        document: prev.manuscript,
        section: {
          sectionId,
          sectionNodeId: `sec:${sectionId}`,
          kind: "custom",
          label,
          placeholder: customSectionPlaceholder(label),
        },
        afterSectionId: prev.activeSection,
        content: emptyDoc(),
      });
      return withManuscriptDocument({
        ...prev,
        customSections: {
          ...prev.customSections,
          [sectionId]: {
            label,
            placeholder: customSectionPlaceholder(label),
          },
        },
        ledgerBySection: {
          ...prev.ledgerBySection,
          [sectionId]: [],
        },
        copilotBySection: {
          ...prev.copilotBySection,
          [sectionId]: [],
        },
        formattingBySection: {
          ...prev.formattingBySection,
          [sectionId]: { ...DEFAULT_SECTION_FORMAT },
        },
        activeSection: sectionId,
      }, nextDocument);
    });
    setCustomSectionName("");
  }, [applyDocumentMutation, customSectionName]);

  const removeSection = useCallback((sectionId: DraftSectionId) => {
    if (sectionId === "references") return;
    if (!window.confirm(`Remove ${sectionMetaById.get(sectionId)?.label ?? "this section"}?`)) return;
    applyDocumentMutation((prev) => {
      const removedIndex = prev.sectionOrder.indexOf(sectionId);
      const nextDocument = removeManuscriptSection(prev.manuscript, sectionId);
      const nextCustomSections = { ...prev.customSections };
      delete nextCustomSections[sectionId];
      const nextFormattingBySection = { ...prev.formattingBySection };
      delete nextFormattingBySection[sectionId];
      const nextLedgerBySection = { ...prev.ledgerBySection };
      delete nextLedgerBySection[sectionId];
      const nextCopilotBySection = { ...prev.copilotBySection };
      delete nextCopilotBySection[sectionId];
      const nextSectionOrder = nextDocument.sections.map((section) => section.sectionId);
      const fallbackSection = nextSectionOrder[Math.max(0, removedIndex - 1)] ?? nextSectionOrder[0] ?? "abstract";
      return withManuscriptDocument({
        ...prev,
        customSections: nextCustomSections,
        formattingBySection: nextFormattingBySection,
        ledgerBySection: nextLedgerBySection,
        copilotBySection: nextCopilotBySection,
        activeSection: prev.activeSection === sectionId ? fallbackSection : prev.activeSection,
      }, nextDocument);
    });
  }, [applyDocumentMutation, sectionMetaById]);

  const reorderSection = useCallback((sectionId: DraftSectionId, targetSectionId: DraftSectionId, position: "before" | "after") => {
    applyDocumentMutation((prev) => {
      const nextDocument = reorderManuscriptSection({
        document: prev.manuscript,
        sectionId,
        targetSectionId,
        position,
      });
      return withManuscriptDocument({
        ...prev,
      }, nextDocument);
    });
  }, [applyDocumentMutation]);

  const moveSelectedBlock = useCallback((direction: "up" | "down") => {
    if (!selectionState.activeBlockId) return;
    applyDocumentMutation((prev) => {
      const nextDocument = moveTopLevelBlock(prev.manuscript, {
        sectionId: prev.activeSection,
        blockId: selectionState.activeBlockId!,
        direction,
      });
      return withManuscriptDocument({
        ...prev,
      }, nextDocument);
    });
  }, [applyDocumentMutation, selectionState.activeBlockId]);

  const handleSelectSectionKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = outlineView.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }
    event.preventDefault();
    focusSection(outlineView[nextIndex]?.sectionId ?? draft.activeSection);
  }, [draft.activeSection, focusSection, outlineView]);

  const handleSectionDragStart = useCallback((event: ReactDragEvent<HTMLButtonElement>, sectionId: DraftSectionId) => {
    if (sectionId === "references") return;
    setDraggingSectionId(sectionId);
    setDragOverSectionId(null);
    setDragOverPosition(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", sectionId);
  }, []);

  const handleSectionDragOver = useCallback((event: ReactDragEvent<HTMLButtonElement>, sectionId: DraftSectionId) => {
    if (!draggingSectionId || draggingSectionId === sectionId || sectionId === "references") return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY - rect.top > rect.height / 2 ? "after" : "before";
    setDragOverSectionId(sectionId);
    setDragOverPosition(position);
  }, [draggingSectionId]);

  const handleSectionDrop = useCallback((event: ReactDragEvent<HTMLButtonElement>, targetSectionId: DraftSectionId) => {
    event.preventDefault();
    if (!draggingSectionId || draggingSectionId === targetSectionId) return;
    reorderSection(draggingSectionId, targetSectionId, dragOverPosition ?? "before");
    setDraggingSectionId(null);
    setDragOverSectionId(null);
    setDragOverPosition(null);
  }, [dragOverPosition, draggingSectionId, reorderSection]);

  const handleSectionDragEnd = useCallback(() => {
    setDraggingSectionId(null);
    setDragOverSectionId(null);
    setDragOverPosition(null);
  }, []);

  const toggleSectionCollapsed = useCallback((sectionId: DraftSectionId) => {
    setCollapsedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const updateSectionFormat = useCallback((sectionId: DraftSectionId, updates: Partial<DraftSectionFormat>) => {
    commitDraft((prev) => {
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
  }, [commitDraft]);

  const insertCitation = useCallback((studyId: string) => {
    const editor = editorRef.current;
    if (!editor || draft.activeSection === "references") return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "citation",
        attrs: { studyId, uid: createCitationUid(draft.activeSection) },
      })
      .insertContent(" ")
      .run();
  }, [draft.activeSection]);

  const handleAddEvidence = useCallback((studyId: string) => {
    commitDraft((prev) => {
      const existing = prev.ledgerBySection[prev.activeSection] ?? [];
      if (existing.includes(studyId)) return prev;
      return {
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [prev.activeSection]: [studyId, ...existing],
        },
      };
    });
  }, [commitDraft]);

  const handleRemoveEvidence = useCallback((studyId: string) => {
    commitDraft((prev) => {
      const existing = prev.ledgerBySection[prev.activeSection] ?? [];
      if (!existing.includes(studyId)) return prev;
      return {
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [prev.activeSection]: existing.filter((id) => id !== studyId),
        },
      };
    });
  }, [commitDraft]);

  const buildCurrentDraftSelectionTarget = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || isReferencesSection) return null;
    const fullText = editor.getText().trim();
    if (!fullText) return null;
    const selectedText = !editor.state.selection.empty
      ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to).trim()
      : fullText.slice(0, 500);
    return buildDraftSelectionTarget({
      projectId,
      section: activeSectionLabel,
      selectedText,
      surroundingText: fullText.slice(0, 1_200),
      citedStudyIds: draft.ledgerBySection[draft.activeSection] ?? undefined,
      sourceSurface: "draft",
    });
  }, [activeSectionLabel, draft.activeSection, draft.ledgerBySection, isReferencesSection, projectId]);

  const handleAskAi = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || isReferencesSection) return;
    const selectedText = !editor.state.selection.empty
      ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
      : editor.getText().slice(0, 500);
    if (captureEnabled) {
      const target = buildCurrentDraftSelectionTarget();
      if (target) {
        openPopupForTarget(target);
      }
      return;
    }
    openPopupChat({
      type: "draft_selection",
      projectId,
      section: activeSectionLabel,
      selectedText,
    });
  }, [activeSectionLabel, buildCurrentDraftSelectionTarget, captureEnabled, isReferencesSection, openPopupChat, openPopupForTarget, projectId]);

  const handleDraftContextAction = useCallback((
    actionId: "send_to_copilot" | "rewrite_selection" | "check_claim_support",
    prompt: string,
  ) => {
    const target = buildCurrentDraftSelectionTarget();
    if (!target) return;
    runAction({
      actionId,
      targets: [target],
      prompt,
      page: "draft",
      section: activeSectionLabel,
    });
  }, [activeSectionLabel, buildCurrentDraftSelectionTarget, runAction]);

  const syncFormattingFromEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setParagraphDir(editor.getAttributes("paragraph")?.dir === "rtl" ? "rtl" : "ltr");
    setCanRunDraftContextActions(Boolean(editor.getText().trim()));
  }, []);

  const statusLabelByKey: Record<DraftSectionStatus, string> = {
    empty: "Empty",
    drafting: "Drafting",
    issues: "Issues",
    generated: "Generated",
  };

  const activeBlockEntry = useMemo(() => {
    if (!editorMap || !selectionState.activeBlockId) return null;
    return editorMap.blocks[selectionState.activeBlockId] ?? null;
  }, [editorMap, selectionState.activeBlockId]);

  const showResultsGuide = draft.activeSection === "results" && !docHasContent(draft.contentBySection.results);

  return {
    activeBlockEntry,
    activeFontFamily,
    activeFormat,
    activeSectionLabel,
    activeSectionMeta,
    availableSections,
    blockingCitationIssuesCount,
    canRunDraftContextActions,
    captureEnabled,
    checkClaimSupportAction,
    citationIssues,
    copilotEmptyState,
    collapsedSectionIds,
    contextToolbarEnabled,
    customSectionName,
    draft,
    editor: editorInstance,
    draggingSectionId,
    dragOverPosition,
    dragOverSectionId,
    editorMap,
    exportCitationIssues,
    exportHistory,
    exportMode,
    formatRef,
    formatVarsById,
    handleAddCustomSection: addCustomSection,
    handleAddEvidence,
    handleAskAi,
    handleDeleteExport,
    handleDraftContextAction,
    handleEditorMapChange,
    handleEditorReady,
    handleExportDocx,
    handleManuscriptChange,
    handleRemoveEvidence,
    handleSectionDragEnd,
    handleSectionDragOver,
    handleSectionDragStart,
    handleSectionDrop,
    handleSelectSectionKeyDown,
    handleSelectionUpdate,
    hasDraftContent,
    initialJumpSectionRef,
    insertCitation,
    insertCopilotText,
    isAddEvidenceOpen,
    isCompactWorkspace,
    isContextDrawerOpen,
    isEmbeddedInProjectShell,
    isExportModalOpen,
    isFormatOpen,
    isLoadingProjects,
    isMobileDraftV2Enabled: mobileDraftV2Enabled,
    isReferencesSection,
    isStructureDrawerOpen,
    latestExport,
    openPopupForTarget,
    orderedSections,
    outlineView,
    paragraphDir,
    project,
    projectsError,
    saveStatus,
    selectionState,
    sendToCopilotAction,
    setAddEvidenceOpen,
    setContextDrawerOpen,
    setCustomSectionName,
    setExportModalOpen,
    setExportMode,
    setFormatOpen,
    setStructureDrawerOpen,
    showDesktopContextToolbar,
    showResultsGuide,
    statusLabelByKey,
    studies,
    studyLabel,
    syncFormattingFromEditor,
    toggleSectionCollapsed,
    updateSectionFormat,
    usedEvidence,
    usedEvidenceIds,
    focusBlock,
    focusHeading,
    focusSection,
    addOptionalSection,
    removeSection,
    moveSelectedBlock,
    rewriteSelectionAction,
    sectionMetaById,
  };
}
