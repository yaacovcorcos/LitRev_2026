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
import { useProjects } from "@/contexts/ProjectsContext";
import { useLedger } from "@/contexts/LedgerContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { useProjectCopilotSafe } from "@/contexts/ProjectCopilotContext";
import { COMPACT_MEDIA_QUERY, PHONE_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { useDraftExport } from "./useDraftExport";
import { getDraftCitationIssues, synchronizeDraftState } from "./draft-workspace-state";
import {
  BASE_SECTION_MAP,
  EMPTY_IDS,
  FONT_FAMILY_OPTIONS,
  WHOLE_DRAFT_META,
  createCustomSectionId,
  customSectionPlaceholder,
  docHasContent,
  formatToVars,
  jsonToText,
  studyLabel,
  type SectionMeta,
} from "./draft-helpers";
import { DRAFT_SECTIONS, type DraftMode, type DraftSectionId, UNSECTIONED_DRAFT_ID } from "@/types/draft";

type ControllerParams = {
  projectId: string;
};

type PendingSectionRequest = {
  id: DraftSectionId;
  label: string;
  placeholder?: string;
  isCustom: boolean;
};

function createCitationUid(sectionId: DraftSectionId): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cit-${sectionId}-${Date.now().toString(36)}-${rand}`;
}

function currentTargetIdFromActiveSection(activeSection: DraftSectionId | null): DraftSectionId {
  return activeSection ?? UNSECTIONED_DRAFT_ID;
}

function findBlockFocusPosition(editor: Editor, blockId: string | undefined) {
  if (!blockId) return null;
  let focusPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    const nodeBlockId = typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;
    if (nodeBlockId === blockId) {
      focusPos = pos + 1;
      return false;
    }
    return true;
  });
  return focusPos;
}

function moveSectionOrder(order: DraftSectionId[], sectionId: DraftSectionId, direction: "up" | "down") {
  if (sectionId === "references") return order;
  const index = order.indexOf(sectionId);
  if (index < 0) return order;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= order.length || order[targetIndex] === "references") {
    return order;
  }
  const next = [...order];
  const [section] = next.splice(index, 1);
  next.splice(targetIndex, 0, section);
  return next;
}

function reorderSectionOrder(
  order: DraftSectionId[],
  draggingKey: DraftSectionId,
  targetKey: DraftSectionId,
  position: "before" | "after",
) {
  if (draggingKey === "references" || targetKey === "references") return order;
  const next = order.filter((sectionId) => sectionId !== draggingKey);
  const targetIndex = next.indexOf(targetKey);
  if (targetIndex < 0) return order;
  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  next.splice(insertIndex, 0, draggingKey);
  return next;
}

function insertSectionAfterActive(order: DraftSectionId[], activeSection: DraftSectionId | null, nextSectionId: DraftSectionId) {
  const withoutReferences = order.filter((sectionId) => sectionId !== "references");
  const references = order.includes("references") ? ["references"] : [];
  if (activeSection && withoutReferences.includes(activeSection)) {
    const insertIndex = withoutReferences.indexOf(activeSection) + 1;
    return [...withoutReferences.slice(0, insertIndex), nextSectionId, ...withoutReferences.slice(insertIndex), ...references];
  }
  return [...withoutReferences, nextSectionId, ...references];
}

function normalizeModeForSections(mode: DraftMode, sectionOrder: DraftSectionId[]) {
  const hasEditableSection = sectionOrder.some((sectionId) => sectionId !== "references");
  if (mode === "section" && !hasEditableSection) {
    return "full" as const;
  }
  return mode;
}

export function useDraftWorkspaceController({ projectId }: ControllerParams) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getProjectById, isLoadingProjects, projectsError } = useProjects();
  const { getStudiesByProject } = useLedger();
  const { isEmbeddedInProjectShell } = useProjectShell();
  const projectCopilot = useProjectCopilotSafe();
  const { openPopupChat } = usePopupChat();
  const { draft: cachedDraft, warmDomain } = useProjectData();

  const project = getProjectById(projectId);
  const studies = useMemo(() => (projectId ? getStudiesByProject(projectId) : []), [getStudiesByProject, projectId]);
  const queryMode = searchParams.get("mode");
  const querySection = searchParams.get("section");

  const [draft, setDraft] = useState<DraftState>(createDefaultDraftState);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [isAddEvidenceOpen, setAddEvidenceOpen] = useState(false);
  const [isFormatOpen, setFormatOpen] = useState(false);
  const [isAddSectionOpen, setAddSectionOpen] = useState(false);
  const [customSectionName, setCustomSectionName] = useState("");
  const [isPhoneWorkspace, setPhoneWorkspace] = useState(false);
  const [isCompactWorkspace, setCompactWorkspace] = useState(false);
  const [paragraphDir, setParagraphDir] = useState<"ltr" | "rtl">("ltr");
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [pendingSectionRequest, setPendingSectionRequest] = useState<PendingSectionRequest | null>(null);
  const [sectionToRemove, setSectionToRemove] = useState<DraftSectionId | null>(null);
  const [draggingKey, setDraggingKey] = useState<DraftSectionId | null>(null);
  const [dragOverKey, setDragOverKey] = useState<DraftSectionId | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);

  const activeEditorRef = useRef<Editor | null>(null);
  const draftRef = useRef(draft);
  const editorBySectionRef = useRef<Record<DraftSectionId, Editor | null>>({ [UNSECTIONED_DRAFT_ID]: null } as Record<DraftSectionId, Editor | null>);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedCachedRef = useRef(false);
  const sectionTabRefs = useRef<Record<DraftSectionId, HTMLButtonElement | null>>({} as Record<DraftSectionId, HTMLButtonElement | null>);
  const addSectionRef = useRef<HTMLDivElement | null>(null);
  const addSectionInputRef = useRef<HTMLInputElement | null>(null);
  const formatRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<{ sectionId: DraftSectionId; blockId?: string } | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const normalizeForEditor = useCallback(
    (state: DraftState) => synchronizeDraftState({ state, studies, includeNumberInNodes: true }),
    [studies],
  );

  const normalizeForPersistence = useCallback(
    (state: DraftState) => synchronizeDraftState({ state, studies, includeNumberInNodes: false }),
    [studies],
  );

  const applyDraftFromQuery = useCallback((loaded: DraftState) => {
    const modeCandidate = queryMode === "section" || queryMode === "full" ? queryMode : loaded.mode;
    const mode = normalizeModeForSections(modeCandidate, loaded.sectionOrder);
    const requestedSection =
      typeof querySection === "string" && querySection.trim().length > 0 && loaded.sectionOrder.includes(querySection)
        ? querySection
        : null;
    const activeSection = requestedSection ?? loaded.activeSection;
    return {
      ...loaded,
      mode,
      activeSection:
        mode === "section"
          ? activeSection ?? loaded.sectionOrder.find((sectionId) => sectionId !== "references") ?? loaded.sectionOrder[0] ?? null
          : activeSection,
    };
  }, [queryMode, querySection]);

  const scheduleSave = useCallback(
    (next: DraftState) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(async () => {
        const persistableState = normalizeForPersistence(next);
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

  const setDraftLocal = useCallback((updater: (prev: DraftState) => DraftState) => {
    setDraft((prev) => {
      const next = updater(prev);
      draftRef.current = next;
      saveDraftState(projectId, next);
      return next;
    });
  }, [projectId]);

  const commitDraft = useCallback((updater: (prev: DraftState) => DraftState) => {
    setDraft((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      draftRef.current = next;
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  useEffect(() => {
    const local = loadDraftState(projectId);
    const nextDraft = normalizeForEditor(applyDraftFromQuery(local));
    setDraft(nextDraft);
    draftRef.current = nextDraft;
    appliedCachedRef.current = false;
  }, [applyDraftFromQuery, normalizeForEditor, projectId]);

  useEffect(() => {
    if (appliedCachedRef.current) return;
    if (cachedDraft.state === "ready" && cachedDraft.data) {
      const nextDraft = normalizeForEditor(applyDraftFromQuery(cachedDraft.data));
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      appliedCachedRef.current = true;
    } else if (cachedDraft.state === "idle") {
      warmDomain("draft");
    }
  }, [applyDraftFromQuery, cachedDraft, normalizeForEditor, warmDomain]);

  useEffect(() => {
    setDraft((prev) => {
      const next = normalizeForEditor(prev);
      draftRef.current = next;
      return next;
    });
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
    const phoneQuery = window.matchMedia(PHONE_MEDIA_QUERY);
    const compactQuery = window.matchMedia(COMPACT_MEDIA_QUERY);
    const updateWorkspaceMode = () => {
      setPhoneWorkspace(phoneQuery.matches);
      setCompactWorkspace(phoneQuery.matches || compactQuery.matches);
    };
    updateWorkspaceMode();
    if (typeof phoneQuery.addEventListener === "function") {
      phoneQuery.addEventListener("change", updateWorkspaceMode);
      compactQuery.addEventListener("change", updateWorkspaceMode);
      return () => {
        phoneQuery.removeEventListener("change", updateWorkspaceMode);
        compactQuery.removeEventListener("change", updateWorkspaceMode);
      };
    }
    phoneQuery.addListener(updateWorkspaceMode);
    compactQuery.addListener(updateWorkspaceMode);
    return () => {
      phoneQuery.removeListener(updateWorkspaceMode);
      compactQuery.removeListener(updateWorkspaceMode);
    };
  }, []);

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
    if (draft.panels.ledgerCollapsed || !isCompactWorkspace) return;
    setDraftLocal((prev) => ({
      ...prev,
      panels: {
        ...prev.panels,
        ledgerCollapsed: false,
      },
    }));
  }, [draft.panels.ledgerCollapsed, isCompactWorkspace, setDraftLocal]);

  const sectionMetaById = useMemo(() => {
    const map = new Map<DraftSectionId, SectionMeta>(BASE_SECTION_MAP);
    map.set(UNSECTIONED_DRAFT_ID, WHOLE_DRAFT_META);
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
    () => draft.sectionOrder.map((id) => sectionMetaById.get(id)).filter((section): section is SectionMeta => Boolean(section)),
    [draft.sectionOrder, sectionMetaById],
  );
  const fullDraftSections = useMemo(
    () => orderedSections.filter((section) => docHasContent(draft.contentBySection[section.id])),
    [draft.contentBySection, orderedSections],
  );

  const activeNamedSection = draft.activeSection ? sectionMetaById.get(draft.activeSection) ?? null : null;
  const currentTargetId = currentTargetIdFromActiveSection(draft.activeSection);
  const currentTargetMeta = sectionMetaById.get(currentTargetId) ?? WHOLE_DRAFT_META;
  const currentTargetLabel = currentTargetMeta.label;
  const hasEditableSections = draft.sectionOrder.some((sectionId) => sectionId !== "references");
  const firstEditableSectionId = draft.sectionOrder.find((sectionId) => sectionId !== "references") ?? draft.sectionOrder[0] ?? null;
  const hasWholeDraftContent = docHasContent(draft.contentBySection[UNSECTIONED_DRAFT_ID]);
  const shouldRenderWholeDraft = hasWholeDraftContent || orderedSections.length === 0 || draft.activeSection === null;
  const isReferencesTarget = currentTargetId === "references";
  const activeFormat = draft.formattingBySection[currentTargetId] ?? DEFAULT_SECTION_FORMAT;
  const activeFontFamily = FONT_FAMILY_OPTIONS.some((option) => option.value === activeFormat.fontFamily)
    ? activeFormat.fontFamily
    : DEFAULT_SECTION_FORMAT.fontFamily;
  const formatVarsById = useMemo(() => {
    const map: Record<DraftSectionId, React.CSSProperties> = {} as Record<DraftSectionId, React.CSSProperties>;
    for (const [id, format] of Object.entries(draft.formattingBySection)) {
      map[id] = formatToVars(format);
    }
    return map;
  }, [draft.formattingBySection]);

  const availableSections = useMemo(
    () =>
      DRAFT_SECTIONS
        .filter((section) => !draft.sectionOrder.includes(section.key))
        .map((section) => ({
          id: section.key,
          label: section.label,
          placeholder: section.placeholder,
        })),
    [draft.sectionOrder],
  );

  const usedEvidenceIds = draft.ledgerBySection[currentTargetId] ?? EMPTY_IDS;
  const usedEvidence = useMemo(
    () => studies.filter((study) => usedEvidenceIds.includes(study.id)),
    [studies, usedEvidenceIds],
  );
  const citationIssues = useMemo(() => getDraftCitationIssues(draft, studies), [draft, studies]);
  const referencesText = useMemo(() => jsonToText(draft.contentBySection.references), [draft.contentBySection.references]);
  const hasDraftContent = useMemo(() => {
    if (shouldRenderWholeDraft && docHasContent(draft.contentBySection[UNSECTIONED_DRAFT_ID])) {
      return true;
    }
    return orderedSections.some((section) => docHasContent(draft.contentBySection[section.id]));
  }, [draft.contentBySection, orderedSections, shouldRenderWholeDraft]);

  const syncEditorSignals = useCallback((editor: Editor | null) => {
    if (!editor) return;
    setParagraphDir(editor.getAttributes("paragraph")?.dir === "rtl" ? "rtl" : "ltr");
    activeEditorRef.current = editor;
    setActiveEditor(editor);
  }, []);

  const scheduleFocus = useCallback((sectionId: DraftSectionId, blockId?: string) => {
    pendingFocusRef.current = { sectionId, blockId };
    window.setTimeout(() => {
      const pending = pendingFocusRef.current;
      if (!pending) return;
      const editor = editorBySectionRef.current[pending.sectionId];
      if (!editor) return;
      pendingFocusRef.current = null;
      const focusPos = findBlockFocusPosition(editor, pending.blockId);
      if (focusPos) {
        editor.chain().focus(focusPos).run();
      } else {
        editor.chain().focus("end").run();
      }
      editor.view.dom.scrollIntoView({ block: "nearest" });
      syncEditorSignals(editor);
    }, 60);
  }, [syncEditorSignals]);

  const handleSectionFocus = useCallback((sectionId: DraftSectionId, editor: Editor) => {
    syncEditorSignals(editor);
    const nextActiveSection = sectionId === UNSECTIONED_DRAFT_ID ? null : sectionId;
    setDraft((prev) => (prev.activeSection === nextActiveSection ? prev : { ...prev, activeSection: nextActiveSection }));
  }, [syncEditorSignals]);

  const handleSectionSelectionChange = useCallback((_sectionId: DraftSectionId, editor: Editor) => {
    syncEditorSignals(editor);
  }, [syncEditorSignals]);

  const registerEditor = useCallback((sectionId: DraftSectionId, editor: Editor | null) => {
    editorBySectionRef.current[sectionId] = editor;
    if (!editor && activeEditorRef.current === editor) {
      activeEditorRef.current = null;
      setActiveEditor(null);
    }
  }, []);

  const updateSectionContent = useCallback((sectionId: DraftSectionId, json: JSONContent) => {
    commitDraft((prev) => normalizeForEditor({
      ...prev,
      contentBySection: {
        ...prev.contentBySection,
        [sectionId]: json,
      },
    }));
  }, [commitDraft, normalizeForEditor]);

  const selectSection = useCallback((sectionId: DraftSectionId) => {
    setDraftLocal((prev) => ({
      ...prev,
      activeSection: sectionId === UNSECTIONED_DRAFT_ID ? null : sectionId,
    }));
    scheduleFocus(sectionId);
  }, [scheduleFocus, setDraftLocal]);

  const openSectionInSectionMode = useCallback((sectionId: DraftSectionId | null) => {
    if (!sectionId) return;
    setDraftLocal((prev) => ({
      ...prev,
      mode: "section",
      activeSection: sectionId === UNSECTIONED_DRAFT_ID ? null : sectionId,
    }));
    scheduleFocus(sectionId);
  }, [scheduleFocus, setDraftLocal]);

  const handleToggleMode = useCallback((nextMode: DraftMode) => {
    setDraftLocal((prev) => {
      if (nextMode === "section") {
        const firstEditable = prev.sectionOrder.find((sectionId) => sectionId !== "references") ?? prev.sectionOrder[0] ?? null;
        if (!firstEditable) return prev;
        return {
          ...prev,
          mode: "section",
          activeSection: prev.activeSection ?? firstEditable,
        };
      }
      return {
        ...prev,
        mode: "full",
      };
    });
  }, [setDraftLocal]);

  const closeAddSection = useCallback(() => {
    setAddSectionOpen(false);
    setCustomSectionName("");
  }, []);

  const applyPendingSection = useCallback((request: PendingSectionRequest, moveWholeDraftContent: boolean) => {
    commitDraft((prev) => {
      if (prev.sectionOrder.includes(request.id)) return prev;
      const nextSectionOrder = insertSectionAfterActive(prev.sectionOrder, prev.activeSection, request.id);
      const nextContentBySection = {
        ...prev.contentBySection,
        [request.id]: moveWholeDraftContent
          ? prev.contentBySection[UNSECTIONED_DRAFT_ID] ?? emptyDoc()
          : prev.contentBySection[request.id] ?? emptyDoc(),
        [UNSECTIONED_DRAFT_ID]: moveWholeDraftContent ? emptyDoc() : prev.contentBySection[UNSECTIONED_DRAFT_ID] ?? emptyDoc(),
      };
      return normalizeForEditor({
        ...prev,
        sectionOrder: nextSectionOrder,
        activeSection: request.id,
        customSections: request.isCustom
          ? {
              ...prev.customSections,
              [request.id]: request.placeholder ? { label: request.label, placeholder: request.placeholder } : { label: request.label },
            }
          : prev.customSections,
        contentBySection: nextContentBySection,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [request.id]: prev.ledgerBySection[request.id] ?? [],
        },
        copilotBySection: {
          ...prev.copilotBySection,
          [request.id]: prev.copilotBySection[request.id] ?? [],
        },
        formattingBySection: {
          ...prev.formattingBySection,
          [request.id]: prev.formattingBySection[request.id] ?? { ...DEFAULT_SECTION_FORMAT },
        },
      });
    });
    setPendingSectionRequest(null);
    closeAddSection();
    scheduleFocus(request.id);
  }, [closeAddSection, commitDraft, normalizeForEditor, scheduleFocus]);

  const queueAddSection = useCallback((request: PendingSectionRequest) => {
    const hasExistingEditableSections = draftRef.current.sectionOrder.some((sectionId) => sectionId !== "references");
    if (!hasExistingEditableSections && docHasContent(draftRef.current.contentBySection[UNSECTIONED_DRAFT_ID])) {
      setPendingSectionRequest(request);
      closeAddSection();
      return;
    }
    applyPendingSection(request, false);
  }, [applyPendingSection, closeAddSection]);

  const handleAddSection = useCallback((sectionId: DraftSectionId) => {
    const preset = DRAFT_SECTIONS.find((section) => section.key === sectionId);
    if (!preset) return;
    queueAddSection({
      id: preset.key,
      label: preset.label,
      placeholder: preset.placeholder,
      isCustom: false,
    });
  }, [queueAddSection]);

  const handleAddCustomSection = useCallback(() => {
    const name = customSectionName.trim();
    if (!name) return;
    const normalizedLabel = name.toLowerCase();
    const existingLabels = new Set(
      draftRef.current.sectionOrder
        .map((sectionId) => sectionMetaById.get(sectionId)?.label.toLowerCase())
        .filter((label): label is string => Boolean(label)),
    );
    if (existingLabels.has(normalizedLabel)) {
      return;
    }
    queueAddSection({
      id: createCustomSectionId(name),
      label: name,
      placeholder: customSectionPlaceholder(name),
      isCustom: true,
    });
    setCustomSectionName("");
  }, [customSectionName, queueAddSection, sectionMetaById]);

  const confirmPendingMove = useCallback(() => {
    if (!pendingSectionRequest) return;
    applyPendingSection(pendingSectionRequest, true);
  }, [applyPendingSection, pendingSectionRequest]);

  const confirmPendingKeep = useCallback(() => {
    if (!pendingSectionRequest) return;
    applyPendingSection(pendingSectionRequest, false);
  }, [applyPendingSection, pendingSectionRequest]);

  const cancelPendingSectionRequest = useCallback(() => {
    setPendingSectionRequest(null);
  }, []);

  const confirmRemoveSection = useCallback(() => {
    if (!sectionToRemove) return;
    commitDraft((prev) => {
      if (sectionToRemove === "references") return prev;
      const nextOrder = prev.sectionOrder.filter((sectionId) => sectionId !== sectionToRemove);
      const nextCustomSections = { ...prev.customSections };
      delete nextCustomSections[sectionToRemove];
      const nextFormatting = { ...prev.formattingBySection };
      delete nextFormatting[sectionToRemove];
      const nextContent = { ...prev.contentBySection };
      delete nextContent[sectionToRemove];
      const nextLedger = { ...prev.ledgerBySection };
      delete nextLedger[sectionToRemove];
      const nextCopilot = { ...prev.copilotBySection };
      delete nextCopilot[sectionToRemove];
      const nextMode = normalizeModeForSections(prev.mode, nextOrder);
      const nextActiveSection =
        prev.activeSection === sectionToRemove
          ? nextOrder.find((sectionId) => sectionId !== "references") ?? nextOrder[0] ?? null
          : prev.activeSection;
      return normalizeForEditor({
        ...prev,
        mode: nextMode,
        activeSection: nextMode === "section" ? nextActiveSection : nextActiveSection,
        sectionOrder: nextOrder,
        customSections: nextCustomSections,
        formattingBySection: nextFormatting,
        contentBySection: nextContent,
        ledgerBySection: nextLedger,
        copilotBySection: nextCopilot,
      });
    });
    setSectionToRemove(null);
  }, [commitDraft, normalizeForEditor, sectionToRemove]);

  const handleMoveSection = useCallback((sectionId: DraftSectionId, direction: "up" | "down") => {
    commitDraft((prev) => normalizeForEditor({
      ...prev,
      sectionOrder: moveSectionOrder(prev.sectionOrder, sectionId, direction),
    }));
  }, [commitDraft, normalizeForEditor]);

  const handleDragStart = useCallback((event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionId) => {
    if (key === "references") return;
    setDraggingKey(key);
    setDragOverKey(null);
    setDragOverPosition(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
  }, []);

  const handleDragOver = useCallback((event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionId) => {
    if (!draggingKey || draggingKey === key || key === "references") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientX - rect.left > rect.width / 2 ? "after" : "before";
    setDragOverKey(key);
    setDragOverPosition(position);
  }, [draggingKey]);

  const handleDrop = useCallback((event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionId) => {
    event.preventDefault();
    if (!draggingKey || draggingKey === key || !dragOverPosition) return;
    commitDraft((prev) => normalizeForEditor({
      ...prev,
      sectionOrder: reorderSectionOrder(prev.sectionOrder, draggingKey, key, dragOverPosition),
    }));
    setDraggingKey(null);
    setDragOverKey(null);
    setDragOverPosition(null);
  }, [commitDraft, dragOverPosition, draggingKey, normalizeForEditor]);

  const handleDragEnd = useCallback(() => {
    setDraggingKey(null);
    setDragOverKey(null);
    setDragOverPosition(null);
  }, []);

  const handleSelectSectionKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const tabs = orderedSections.map((section) => sectionTabRefs.current[section.id]).filter((tab): tab is HTMLButtonElement => Boolean(tab));
    const next = tabs[index + direction];
    next?.focus();
  }, [orderedSections]);

  const updateSectionFormat = useCallback((sectionId: DraftSectionId, updates: Partial<DraftSectionFormat>) => {
    commitDraft((prev) => ({
      ...prev,
      formattingBySection: {
        ...prev.formattingBySection,
        [sectionId]: {
          ...(prev.formattingBySection[sectionId] ?? DEFAULT_SECTION_FORMAT),
          ...updates,
        },
      },
    }));
  }, [commitDraft]);

  const toggleSidebar = useCallback(() => {
    setDraftLocal((prev) => ({
      ...prev,
      panels: {
        ...prev.panels,
        ledgerCollapsed: !prev.panels.ledgerCollapsed,
      },
    }));
  }, [setDraftLocal]);

  const setSidebarOpen = useCallback((open: boolean) => {
    setDraftLocal((prev) => ({
      ...prev,
      panels: {
        ...prev.panels,
        ledgerCollapsed: !open,
      },
    }));
  }, [setDraftLocal]);

  const insertCitation = useCallback((studyId: string) => {
    const editor = activeEditorRef.current;
    const sectionId = currentTargetIdFromActiveSection(draftRef.current.activeSection);
    if (!editor || sectionId === "references") return;
    editor.chain().focus().insertContent({
      type: "citation",
      attrs: { studyId, uid: createCitationUid(sectionId) },
    }).run();
  }, []);

  const handleAddEvidence = useCallback((studyId: string) => {
    const targetId = currentTargetIdFromActiveSection(draftRef.current.activeSection);
    commitDraft((prev) => {
      const existing = prev.ledgerBySection[targetId] ?? [];
      if (existing.includes(studyId)) return prev;
      return {
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [targetId]: [studyId, ...existing],
        },
      };
    });
  }, [commitDraft]);

  const handleRemoveEvidence = useCallback((studyId: string) => {
    const targetId = currentTargetIdFromActiveSection(draftRef.current.activeSection);
    commitDraft((prev) => {
      const existing = prev.ledgerBySection[targetId] ?? [];
      return {
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [targetId]: existing.filter((id) => id !== studyId),
        },
      };
    });
  }, [commitDraft]);

  const handleAskAi = useCallback(() => {
    const editor = activeEditorRef.current;
    if (!editor || isReferencesTarget) return;
    const selectedText = !editor.state.selection.empty
      ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
      : editor.getText().slice(0, 500);
    openPopupChat({
      type: "draft_selection",
      projectId,
      section: currentTargetLabel,
      selectedText,
    });
  }, [currentTargetLabel, isReferencesTarget, openPopupChat, projectId]);

  const insertCopilotText = useCallback((text: string) => {
    activeEditorRef.current?.chain().focus().insertContent(text).run();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (draft.mode === "full") {
      params.delete("mode");
    } else {
      params.set("mode", draft.mode);
    }
    if (draft.activeSection) {
      params.set("section", draft.activeSection);
    } else {
      params.delete("section");
    }
    const next = params.toString();
    const nextHref = next ? `/project/${projectId}/draft?${next}` : `/project/${projectId}/draft`;
    router.replace(nextHref, { scroll: false });
  }, [draft.activeSection, draft.mode, projectId, router, searchParams]);

  const exportState = useDraftExport({
    projectId,
    projectName: project?.name,
    draft,
    getDraftSnapshot: () => draftRef.current,
    orderedSections,
    sectionMetaById,
    studies,
  });

  const copilotEmptyState = useMemo(() => ({
    icon: "tips_and_updates",
    title: "Draft faster",
    description: "Ask for an outline, rewrite, or evidence-backed phrasing.",
    suggestions: [
      { label: "Outline", prompt: `Outline the ${currentTargetLabel} section` },
      { label: "Rewrite", prompt: `Rewrite this paragraph for the ${currentTargetLabel} section:` },
    ],
  }), [currentTargetLabel]);

  const showResultsGuide = currentTargetId === "results" && !docHasContent(draft.contentBySection.results);

  return {
    project,
    isLoadingProjects,
    projectsError,
    isEmbeddedInProjectShell,
    projectCopilot,
    draft,
    saveStatus,
    isAddEvidenceOpen,
    setAddEvidenceOpen,
    isFormatOpen,
    setFormatOpen,
    isAddSectionOpen,
    setAddSectionOpen,
    customSectionName,
    setCustomSectionName,
    sectionTabRefs,
    addSectionRef,
    addSectionInputRef,
    formatRef,
    orderedSections,
    fullDraftSections,
    availableSections,
    hasEditableSections,
    firstEditableSectionId,
    activeSectionLabel: activeNamedSection?.label ?? currentTargetLabel,
    currentTargetId,
    currentTargetLabel,
    isReferencesTarget,
    activeEditor,
    paragraphDir,
    formatVarsById,
    activeFormat,
    activeFontFamily,
    shouldRenderWholeDraft,
    wholeDraftMeta: WHOLE_DRAFT_META,
    isSidebarCollapsed: draft.panels.ledgerCollapsed,
    toggleSidebar,
    setSidebarOpen,
    isPhoneWorkspace,
    isCompactWorkspace,
    draggingKey,
    dragOverKey,
    dragOverPosition,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleSelectSectionKeyDown,
    handleToggleMode,
    handleAddSection,
    handleAddCustomSection,
    selectSection,
    openSectionInSectionMode,
    handleMoveSection,
    requestRemoveSection: setSectionToRemove,
    sectionToRemove,
    confirmRemoveSection,
    cancelRemoveSection: () => setSectionToRemove(null),
    pendingSectionRequest,
    confirmPendingMove,
    confirmPendingKeep,
    cancelPendingSectionRequest,
    updateSectionFormat,
    registerEditor,
    handleSectionFocus,
    handleSectionSelectionChange,
    updateSectionContent,
    usedEvidence,
    usedEvidenceIds,
    referencesText,
    studies,
    handleAddEvidence,
    handleRemoveEvidence,
    insertCitation,
    studyLabel,
    handleAskAi,
    insertCopilotText,
    copilotEmptyState,
    showResultsGuide,
    ...exportState,
  };
}
