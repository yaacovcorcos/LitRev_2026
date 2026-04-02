"use client";

import {
  CSSProperties,
  Suspense,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BaseBackButton } from "@/components/BaseBackButton";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { useProjects } from "@/contexts/ProjectsContext";
import { useLedger } from "@/contexts/LedgerContext";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import { EmptyState, EmptyStateSkeleton } from "@/components/ui/EmptyState";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { OPTIONAL_SECTION_KEYS, UNSECTIONED_DRAFT_ID, type DraftMode, DraftSectionId } from "@/types/draft";
import {
  DEFAULT_SECTION_FORMAT,
  DraftState,
  emptyDoc,
  loadDraftState,
  saveDraftState,
  createDefaultDraftState,
} from "@/lib/draftStorage";
import { saveDraftAction } from "@/app/actions/drafts";
import { useProjectData } from "@/hooks/useProjectData";
import dynamic from "next/dynamic";
const ExportModal = dynamic(() => import("@/components/ExportModal").then(m => m.ExportModal), { ssr: false });
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import styles from "./draft-studio.module.css";

import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import type { JSONContent } from "@tiptap/core";
import { Citation, ParagraphDirection, EditorToolbar, FullSectionEditor } from "./DraftEditors";
import type { Study } from "@/types/ledger";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { useContextCaptureActions } from "@/hooks/useContextCaptureActions";
import { getContextCaptureAction } from "@/lib/context-capture/actions";
import { buildDraftSelectionTarget } from "@/lib/context-capture/targets";
import { AddEvidenceModal } from "./AddEvidenceModal";
import { DraftTopBar, DraftFormattingPanel } from "./DraftToolbar";
import {
  EMPTY_IDS,
  studyLabel,
  clamp,
  docHasContent,
  jsonToText,
  formatToVars,
  FONT_FAMILY_OPTIONS,
  BASE_SECTION_MAP,
  type SectionMeta,
} from "./draft-helpers";
import { useDraftExport } from "./useDraftExport";
import { useDraftSections } from "./useDraftSections";
import { useDraftCopilot } from "./useDraftCopilot";
import { buildReferencesDoc, compileDraftCitations } from "@/lib/citation-compiler";
import { COARSE_POINTER_MEDIA_QUERY, MOBILE_VIEWPORT_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { isMobileDraftV2Enabled } from "@/lib/mobile/feature-flags";
import { isContextToolbarV1Enabled } from "@/lib/context-capture/feature-flags";
import {
  buildDraftRouteSearchParams,
  readDraftRouteState,
  type DraftRouteState,
} from "@/lib/durable-route-state";
import {
  buildCanonicalDraftRouteState,
  canUseDraftSectionMode,
  getVisibleFullDraftSectionIds,
  resolveDraftEvidenceTarget,
  resolveDraftMode,
  resolveFullDraftActiveSection,
  resolveDraftRouteProjection,
  resolveSectionModeActiveSection,
} from "@/lib/draftStateContracts";

function createCitationUid(sectionId: DraftSectionId): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cit-${sectionId}-${Date.now().toString(36)}-${rand}`;
}

function withCompiledCitations(state: DraftState, studies: Study[], includeNumberInNodes: boolean): DraftState {
  const compiled = compileDraftCitations({
    contentBySection: state.contentBySection,
    sectionOrder: state.sectionOrder,
    studies,
    includeNumberInNodes,
  });
  const referencesDoc = buildReferencesDoc(compiled.orderedStudyIds, studies);
  return {
    ...state,
    contentBySection: {
      ...compiled.normalizedContentBySection,
      references: referencesDoc,
    },
  };
}

type DraftSectionHeadingProps = {
  id: string;
  label: string;
};

function DraftSectionHeading({ id, label }: DraftSectionHeadingProps) {
  return (
    <header className={styles.manuscriptSectionHeader}>
      <h2 id={id} className={styles.manuscriptSectionTitle}>
        {label}
      </h2>
    </header>
  );
}

function DraftContent() {
  const { id } = useParams<{ id: string }>();
  const mobileDraftV2Enabled = isMobileDraftV2Enabled();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getProjectById, isLoadingProjects, projectsError } = useProjects();
  const { getStudiesByProject } = useLedger();
  const project = getProjectById(id);
  const studies = useMemo(() => (id ? getStudiesByProject(id) : []), [id, getStudiesByProject]);
  const { isCollapsed: copilotCollapsed, panelWidth: copilotPanelWidth, setPanelWidth: setCopilotPanelWidth } = useProjectCopilot();
  const { isEmbeddedInProjectShell } = useProjectShell();
  const { openPopupChat } = usePopupChat();
  const { captureEnabled, openPopupForTarget, runAction } = useContextCaptureActions();
  const contextToolbarEnabled = isContextToolbarV1Enabled();
  const sendToCopilotAction = getContextCaptureAction("send_to_copilot");
  const rewriteSelectionAction = getContextCaptureAction("rewrite_selection");
  const checkClaimSupportAction = getContextCaptureAction("check_claim_support");
  const draftRouteState = useMemo(() => readDraftRouteState(searchParams), [searchParams]);

  const [draft, setDraft] = useState<DraftState>(createDefaultDraftState);
  const normalizeForEditor = useCallback(
    (state: DraftState) => withCompiledCitations(state, studies, true),
    [studies]
  );
  const normalizeForPersistence = useCallback(
    (state: DraftState) => withCompiledCitations(state, studies, false),
    [studies]
  );

  const routeStateRef = useRef<DraftRouteState>(draftRouteState);
  routeStateRef.current = draftRouteState;

  const applyDraftRouteProjection = useCallback(
    (
      loaded: DraftState,
      routeState: DraftRouteState,
      fallbackMode: DraftMode = loaded.mode,
      fallbackActiveSection: DraftSectionId | null = loaded.activeSection,
    ) => {
      const order = [...loaded.sectionOrder];
      const projection = resolveDraftRouteProjection(
        routeState,
        fallbackMode,
        fallbackActiveSection,
        order,
      );
      return {
        ...loaded,
        mode: projection.mode,
        activeSection: projection.activeSection,
        sectionOrder: order,
        panels: {
          ...loaded.panels,
        },
      };
    },
    []
  );

  const { draft: cachedDraft, warmDomain } = useProjectData();
  const appliedCachedRef = useRef(false);

  useEffect(() => {
    // Always paint from localStorage first (instant)
    const local = loadDraftState(id);
    setDraft(normalizeForEditor(applyDraftRouteProjection(local, routeStateRef.current)));
    appliedCachedRef.current = false;
  }, [id, applyDraftRouteProjection, normalizeForEditor]);

  // Apply server data from preload cache when ready
  useEffect(() => {
    if (appliedCachedRef.current) return;
    if (cachedDraft.state === "ready" && cachedDraft.data) {
      setDraft(normalizeForEditor(applyDraftRouteProjection(cachedDraft.data, routeStateRef.current)));
      appliedCachedRef.current = true;
    } else if (cachedDraft.state === "idle") {
      warmDomain("draft");
    }
  }, [cachedDraft, applyDraftRouteProjection, normalizeForEditor, warmDomain]);

  useEffect(() => {
    setDraft((prev) => normalizeForEditor(prev));
  }, [normalizeForEditor]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeEditorRef = useRef<Editor | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const editorBySectionRef = useRef<Record<DraftSectionId, Editor | null>>({} as Record<DraftSectionId, Editor | null>);
  const sectionElRef = useRef<Record<DraftSectionId, HTMLElement | null>>({} as Record<DraftSectionId, HTMLElement | null>);

  const pendingContentRef = useRef<Record<DraftSectionId, JSONContent>>(draft.contentBySection);
  const dirtyContentKeysRef = useRef<Set<DraftSectionId>>(new Set());
  const contentCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedUrlRef = useRef<string | null>(null);
  const pendingPushedUrlRef = useRef<string | null>(null);

  const [isAddEvidenceOpen, setAddEvidenceOpen] = useState(false);
  const [isFormatOpen, setFormatOpen] = useState(false);
  const formatRef = useRef<HTMLDivElement | null>(null);
  const [paragraphDir, setParagraphDir] = useState<"ltr" | "rtl">("ltr");
  const [showDesktopContextToolbar, setShowDesktopContextToolbar] = useState(false);
  const [canRunDraftContextActions, setCanRunDraftContextActions] = useState(false);

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

  const canUseSectionMode = useMemo(() => canUseDraftSectionMode(draft.sectionOrder), [draft.sectionOrder]);
  const resolvedMode = useMemo(() => resolveDraftMode(draft.mode, draft.sectionOrder), [draft.mode, draft.sectionOrder]);
  const routeActiveSection = useMemo(
    () => (
      resolvedMode === "section"
        ? resolveSectionModeActiveSection(draft.activeSection, draft.sectionOrder)
        : resolveFullDraftActiveSection(draft.activeSection, draft.sectionOrder)
    ),
    [draft.activeSection, draft.sectionOrder, resolvedMode],
  );

  const activeSectionRef = useRef<DraftSectionId | null>(routeActiveSection);
  useEffect(() => {
    activeSectionRef.current = routeActiveSection;
  }, [routeActiveSection]);

  const sectionKeys = useMemo(() => orderedSections.map((section) => section.id), [orderedSections]);

  const visibleFullDraftSectionIds = useMemo(
    () => getVisibleFullDraftSectionIds(draft.sectionOrder, draft.contentBySection),
    [draft.contentBySection, draft.sectionOrder],
  );
  const fullDraftSections = useMemo(
    () => visibleFullDraftSectionIds.map((sectionId) => sectionMetaById.get(sectionId)).filter((section): section is SectionMeta => Boolean(section)),
    [sectionMetaById, visibleFullDraftSectionIds],
  );
  const compiledCitations = useMemo(
    () =>
      compileDraftCitations({
        contentBySection: draft.contentBySection,
        sectionOrder: draft.sectionOrder,
        studies,
        includeNumberInNodes: true,
      }),
    [draft.contentBySection, draft.sectionOrder, studies]
  );
  const citationIssues = compiledCitations.issues;

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
  const evidenceTargetSectionId = useMemo(
    () => resolveDraftEvidenceTarget(resolvedMode, routeActiveSection, draft.sectionOrder),
    [draft.sectionOrder, resolvedMode, routeActiveSection],
  );
  const activeSectionMeta = useMemo(
    () => (routeActiveSection ? sectionMetaById.get(routeActiveSection) ?? null : null),
    [routeActiveSection, sectionMetaById]
  );
  const evidenceTargetMeta = useMemo(
    () => (
      evidenceTargetSectionId === UNSECTIONED_DRAFT_ID
        ? { id: UNSECTIONED_DRAFT_ID, label: "Whole draft" }
        : sectionMetaById.get(evidenceTargetSectionId) ?? { id: UNSECTIONED_DRAFT_ID, label: "Whole draft" }
    ),
    [evidenceTargetSectionId, sectionMetaById],
  );
  const activeSectionLabel = activeSectionMeta?.label ?? evidenceTargetMeta.label;
  const isReferencesSection = routeActiveSection === "references";
  const activeFormatSectionId = routeActiveSection ?? evidenceTargetSectionId;
  const formatVarsById = useMemo(() => {
    const map: Record<DraftSectionId, CSSProperties> = {};
    for (const [id, format] of Object.entries(draft.formattingBySection)) {
      map[id] = formatToVars(format);
    }
    return map;
  }, [draft.formattingBySection]);
  const activeFormat = draft.formattingBySection[activeFormatSectionId] ?? DEFAULT_SECTION_FORMAT;
  const activeFontFamily = FONT_FAMILY_OPTIONS.some((option) => option.value === activeFormat.fontFamily)
    ? activeFormat.fontFamily
    : DEFAULT_SECTION_FORMAT.fontFamily;
  const activeFormatVars = formatVarsById[activeFormatSectionId] ?? formatToVars(DEFAULT_SECTION_FORMAT);
  const ledgerPanelId = "draft-ledger-panel";
  const copilotPanelId = "draft-copilot-panel";
  const draftMainClassName = `${styles.appMainOverride} ${mobileDraftV2Enabled ? styles.appMainOverrideMobileV2 : ""}`;

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
        const persistableState = normalizeForPersistence(next);
        if (id) {
          saveDraftState(id, persistableState);
          const result = await saveDraftAction(id, persistableState);
          if (!result.success) {
            console.error("Failed to save draft to backend:", result.error);
            setSaveStatus("error");
            return;
          }
        }
        setSaveStatus("saved");
      }, 400);
    },
    [id, normalizeForPersistence]
  );

  const updateDraft = useCallback(
    (updater: (prev: DraftState) => DraftState) => {
      setDraft((prev) => {
        let next = updater(prev);
        if (next === prev) return prev;
        if (next.contentBySection !== prev.contentBySection || next.sectionOrder !== prev.sectionOrder) {
          next = normalizeForEditor(next);
        }
        scheduleSave(next);
        return next;
      });
    },
    [normalizeForEditor, scheduleSave]
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

  const getDraftSnapshot = useCallback((): DraftState => {
    if (dirtyContentKeysRef.current.size === 0) return draft;
    const nextContent = { ...draft.contentBySection };
    for (const key of dirtyContentKeysRef.current) {
      nextContent[key] = pendingContentRef.current[key];
    }
    return {
      ...draft,
      contentBySection: nextContent,
    };
  }, [draft]);

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
    setDraft((prev) => {
      const nextMode = resolveDraftMode(prev.mode, prev.sectionOrder);
      const nextActiveSection = nextMode === "section"
        ? resolveSectionModeActiveSection(prev.activeSection, prev.sectionOrder)
        : resolveFullDraftActiveSection(prev.activeSection, prev.sectionOrder);
      return prev.mode === nextMode && prev.activeSection === nextActiveSection
        ? prev
        : {
            ...prev,
            mode: nextMode,
            activeSection: nextActiveSection,
          };
    });
  }, [draft.sectionOrder]);

  useEffect(() => {
    setDraft((prev) => {
      const projection = resolveDraftRouteProjection(
        draftRouteState,
        prev.mode,
        prev.activeSection,
        prev.sectionOrder,
      );
      return prev.mode === projection.mode && prev.activeSection === projection.activeSection
        ? prev
        : {
            ...prev,
            mode: projection.mode,
            activeSection: projection.activeSection,
          };
    });
  }, [draftRouteState]);

  useEffect(() => {
    if (!id) return;
    const canonicalRouteState = buildCanonicalDraftRouteState(
      draft.mode,
      draft.activeSection,
      draft.sectionOrder,
    );
    const params = buildDraftRouteSearchParams(canonicalRouteState);
    const query = params.toString();
    const nextUrl = query.length > 0 ? `/project/${id}/draft?${query}` : `/project/${id}/draft`;
    const currentQuery = searchParams.toString();
    const currentUrl = currentQuery.length > 0 ? `/project/${id}/draft?${currentQuery}` : `/project/${id}/draft`;
    if (pendingPushedUrlRef.current) {
      if (currentUrl === pendingPushedUrlRef.current) {
        pendingPushedUrlRef.current = null;
      } else {
        return;
      }
    }
    if (currentUrl === nextUrl) {
      lastSyncedUrlRef.current = nextUrl;
      return;
    }
    if (lastSyncedUrlRef.current === nextUrl) {
      return;
    }
    lastSyncedUrlRef.current = nextUrl;
    router.replace(nextUrl, { scroll: false });
  }, [draft.activeSection, draft.mode, draft.sectionOrder, id, router, searchParams]);

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

  useEffect(() => {
    if (!contextToolbarEnabled || typeof window === "undefined") {
      setShowDesktopContextToolbar(false);
      return;
    }
    const viewportQuery = window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY);
    const pointerQuery = window.matchMedia(COARSE_POINTER_MEDIA_QUERY);
    const syncToolbarMode = () => {
      setShowDesktopContextToolbar(!viewportQuery.matches && !pointerQuery.matches);
    };

    syncToolbarMode();

    if (typeof viewportQuery.addEventListener === "function") {
      viewportQuery.addEventListener("change", syncToolbarMode);
      pointerQuery.addEventListener("change", syncToolbarMode);
      return () => {
        viewportQuery.removeEventListener("change", syncToolbarMode);
        pointerQuery.removeEventListener("change", syncToolbarMode);
      };
    }

    viewportQuery.addListener(syncToolbarMode);
    pointerQuery.addListener(syncToolbarMode);
    return () => {
      viewportQuery.removeListener(syncToolbarMode);
      pointerQuery.removeListener(syncToolbarMode);
    };
  }, [contextToolbarEnabled]);

  const registerEditor = useCallback((key: DraftSectionId, editor: Editor | null) => {
    editorBySectionRef.current[key] = editor;
  }, []);

  const queueUserRouteNavigation = useCallback((routeState: DraftRouteState) => {
    if (!id) return;
    const params = buildDraftRouteSearchParams(routeState);
    const query = params.toString();
    const nextUrl = query.length > 0 ? `/project/${id}/draft?${query}` : `/project/${id}/draft`;
    lastSyncedUrlRef.current = nextUrl;
    pendingPushedUrlRef.current = nextUrl;
    router.push(nextUrl, { scroll: false });
  }, [id, router]);

  const focusEditorForSection = useCallback((key: DraftSectionId) => {
    const editor = editorBySectionRef.current[key] ?? activeEditorRef.current;
    if (!editor) return;
    editor.chain().focus("end").run();
  }, []);

  // Section management + drag-and-drop (extracted hook)
  const {
    isAddSectionOpen, setAddSectionOpen, addSectionRef, customSectionName, setCustomSectionName,
    addSectionInputRef, sectionTabRefs, openSectionInSectionMode, handleAddSection,
    handleAddCustomSection, handleRemoveSection, updateSectionFormat,
    dragOverKey, dragOverPosition, draggingKey, handleDragStart, handleDragOver, handleDrop, handleDragEnd,
  } = useDraftSections({
    updateDraft, activeSectionRef, activeEditorRef, queueContentUpdate, flushContentCommit, focusEditorForSection,
    queueUserRouteNavigation,
  });

  // Export state + callbacks (extracted hook)
  const {
    isExportModalOpen, setExportModalOpen, exportHistory, latestExport,
    exportMode, setExportMode, blockingCitationIssuesCount,
    citationIssues: exportCitationIssues,
    hasDraftContent, handleExportDocx, handleDeleteExport,
  } = useDraftExport({
    projectId: id, projectName: project?.name, draft, getDraftSnapshot, orderedSections, studies, flushContentCommit,
  });

  // Draft copilot chat (extracted hook)
  const {
    insertCopilotText,
  } = useDraftCopilot({
    draft, activeSectionLabel, projectName: project?.name, updateDraft, activeEditorRef,
  });

  const handleSelectSection = (key: DraftSectionId) => {
    if (resolvedMode === "full") {
      const el = sectionElRef.current[key];
      if (!el) {
        openSectionInSectionMode(key);
        return;
      }

      if (routeActiveSection !== key) {
        queueUserRouteNavigation({ mode: "full", sectionId: key });
      }

      updateDraft((prev) => (prev.activeSection === key ? prev : { ...prev, activeSection: key }));
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => focusEditorForSection(key), 250);
      return;
    }

    if (routeActiveSection !== key) {
      queueUserRouteNavigation({ mode: "section", sectionId: key });
    }

    const sectionEditor = activeEditorRef.current;
    if (sectionEditor) {
      const currentKey = activeSectionRef.current;
      if (currentKey) {
        queueContentUpdate(currentKey, sectionEditor.getJSON());
        flushContentCommit();
      }
    }
    updateDraft((prev) => (prev.activeSection === key ? prev : { ...prev, activeSection: key }));
    setTimeout(() => focusEditorForSection(key), 0);
  };

  const handleToggleMode = (mode: DraftMode) => {
    if (mode === "section" && !canUseSectionMode) {
      return;
    }
    const editor = activeEditorRef.current;
    if (editor) {
      const currentKey = activeSectionRef.current;
      if (currentKey) {
        queueContentUpdate(currentKey, editor.getJSON());
      }
    }
    flushContentCommit();

    const nextActiveSection = mode === "section"
      ? resolveSectionModeActiveSection(routeActiveSection, draft.sectionOrder)
      : resolveFullDraftActiveSection(routeActiveSection, draft.sectionOrder);

    if (mode === resolvedMode && nextActiveSection === routeActiveSection) {
      return;
    }

    queueUserRouteNavigation({ mode, sectionId: nextActiveSection });

    updateDraft((prev) => {
      return {
        ...prev,
        mode,
        activeSection: nextActiveSection,
      };
    });
    if (mode === "full" && nextActiveSection) {
      setTimeout(() => {
        const el = sectionElRef.current[nextActiveSection];
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        focusEditorForSection(nextActiveSection);
      }, 0);
    } else if (nextActiveSection) {
      setTimeout(() => focusEditorForSection(nextActiveSection), 0);
    }
  };

  const usedEvidenceIds = draft.ledgerBySection[evidenceTargetSectionId] ?? EMPTY_IDS;
  const usedEvidence = useMemo(
    () => studies.filter((s) => usedEvidenceIds.includes(s.id)),
    [studies, usedEvidenceIds]
  );

  const insertCitation = (study: Study) => {
    const editor = activeEditorRef.current
      ?? (resolvedMode === "section" ? sectionEditor : (routeActiveSection ? editorBySectionRef.current[routeActiveSection] : null))
      ?? null;
    if (!editor) return;
    const uid = createCitationUid(activeFormatSectionId);
    editor
      .chain()
      .focus()
      .insertContent({ type: "citation", attrs: { studyId: study.id, uid } })
      .insertContent(" ")
      .run();
  };

  const handleAddEvidence = (refId: string) => {
    const targetSection = resolveDraftEvidenceTarget(resolvedMode, activeSectionRef.current, draft.sectionOrder);
    updateDraft((prev) => {
      const existing = prev.ledgerBySection[targetSection] ?? [];
      if (existing.includes(refId)) return prev;
      return {
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [targetSection]: [refId, ...existing],
        },
      };
    });
  };

  const handleRemoveEvidence = (refId: string) => {
    const targetSection = resolveDraftEvidenceTarget(resolvedMode, activeSectionRef.current, draft.sectionOrder);
    updateDraft((prev) => {
      const existing = prev.ledgerBySection[targetSection] ?? [];
      if (!existing.includes(refId)) return prev;
      return {
        ...prev,
        ledgerBySection: {
          ...prev.ledgerBySection,
          [targetSection]: existing.filter((id) => id !== refId),
        },
      };
    });
  };

  const handleFocusSection = useCallback(
    (key: DraftSectionId, editor: Editor) => {
      activeEditorRef.current = editor;
      setActiveEditor(editor);
      if (resolvedMode === "full") {
        updateDraft((prev) => (prev.activeSection === key ? prev : { ...prev, activeSection: key }));
      }
    },
    [resolvedMode, updateDraft]
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
      content: draft.contentBySection[routeActiveSection ?? UNSECTIONED_DRAFT_ID] ?? emptyDoc(),
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
        if (activeSectionRef.current === "references") return;
        const key = activeSectionRef.current;
        if (key) {
          handleUpdateSection(key, editor.getJSON());
        }
      },
    },
    []
  );

  const lastLoadedSectionRef = useRef<DraftSectionId | null>(null);

  useEffect(() => {
    if (!sectionEditor) return;
    sectionEditor.setEditable(!isReferencesSection);
  }, [isReferencesSection, sectionEditor]);

  useEffect(() => {
    if (!sectionEditor) return;
    if (resolvedMode !== "section") {
      lastLoadedSectionRef.current = null;
      return;
    }
    if (!routeActiveSection) return;
    if (lastLoadedSectionRef.current === routeActiveSection) return;
    const content = draft.contentBySection[routeActiveSection] ?? emptyDoc();
    sectionEditor.commands.setContent(content, { emitUpdate: false });
    activeEditorRef.current = sectionEditor;
    lastLoadedSectionRef.current = routeActiveSection;
  }, [draft.contentBySection, resolvedMode, routeActiveSection, sectionEditor]);

  const formattingEditor = resolvedMode === "section" ? sectionEditor : activeEditor;

  const buildCurrentDraftSelectionTarget = useCallback(() => {
    if (isReferencesSection) return null;
    const editor = resolvedMode === "section"
      ? sectionEditor
      : activeEditorRef.current ?? activeEditor;
    if (!editor) return null;

    const fullText = editor.getText().trim();
    if (!fullText) return null;

    const selectedText = !editor.state.selection.empty
      ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to).trim()
      : fullText.slice(0, 500);

    return buildDraftSelectionTarget({
      projectId: id,
      section: activeSectionLabel,
      selectedText,
      surroundingText: fullText.slice(0, 1_200),
      citedStudyIds: draft.ledgerBySection[evidenceTargetSectionId] ?? undefined,
      sourceSurface: "draft",
    });
  }, [
    activeEditor,
    activeSectionLabel,
    draft.ledgerBySection,
    evidenceTargetSectionId,
    id,
    isReferencesSection,
    resolvedMode,
    sectionEditor,
  ]);

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

  useEffect(() => {
    if (!formattingEditor) return;
    const syncEditorState = () => {
      setParagraphDir(formattingEditor.getAttributes("paragraph")?.dir === "rtl" ? "rtl" : "ltr");
      setCanRunDraftContextActions(Boolean(formattingEditor.getText().trim()));
    };
    syncEditorState();
    formattingEditor.on("selectionUpdate", syncEditorState);
    formattingEditor.on("transaction", syncEditorState);
    return () => {
      formattingEditor.off("selectionUpdate", syncEditorState);
      formattingEditor.off("transaction", syncEditorState);
    };
  }, [formattingEditor]);

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
  }, [setCopilotPanelWidth, updateDraft]);

  if (isLoadingProjects) {
    return (
      <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={draftMainClassName}>
        <EmptyStateSkeleton className={styles.notFound} />
      </ProjectPageLayout>
    );
  }

  if (projectsError) {
    return (
      <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={draftMainClassName}>
        <EmptyState
          variant="error"
          icon="cloud_off"
          title="Unable to load project"
          description={projectsError}
          primaryAction={{ label: "Retry", onClick: () => window.location.reload() }}
          secondaryAction={{ label: "Back to Dashboard", href: "/" }}
          className={styles.notFound}
        />
      </ProjectPageLayout>
    );
  }

  if (!project) {
    return (
      <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={draftMainClassName}>
        <EmptyState
          variant="error"
          icon="folder_off"
          title="Project not found"
          description="This project may have been deleted or you don't have access."
          primaryAction={{ label: "Back to Dashboard", href: "/" }}
          className={styles.notFound}
        />
      </ProjectPageLayout>
    );
  }

  const showResultsGuide = routeActiveSection === "results" && !docHasContent(draft.contentBySection.results);
  const draftPageClassName = `${styles.page} ${mobileDraftV2Enabled ? styles.pageMobileV2 : ""}`;
  const showDraftContextToolbar = captureEnabled
    && contextToolbarEnabled
    && showDesktopContextToolbar
    && !isReferencesSection;

  const pageContent = (
    <>
      <div className={draftPageClassName} data-mobile-draft-v2={mobileDraftV2Enabled ? "1" : "0"}>
        <DraftTopBar
          projectName={project.name}
          activeSection={routeActiveSection}
          mode={resolvedMode}
          orderedSections={orderedSections}
          availableSections={availableSections}
          draggingKey={draggingKey}
          dragOverKey={dragOverKey}
          dragOverPosition={dragOverPosition}
          sectionTabRefs={sectionTabRefs}
          addSectionRef={addSectionRef}
          addSectionInputRef={addSectionInputRef}
          isAddSectionOpen={isAddSectionOpen}
          setAddSectionOpen={setAddSectionOpen}
          customSectionName={customSectionName}
          setCustomSectionName={setCustomSectionName}
          onSelectSection={handleSelectSection}
          onSectionKeyDown={handleSectionKeyDown}
          onToggleMode={handleToggleMode}
          onAddSection={handleAddSection}
          onAddCustomSection={handleAddCustomSection}
          onRemoveSection={handleRemoveSection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          hasDraftContent={hasDraftContent}
          onExportClick={() => setExportModalOpen(true)}
          saveStatus={saveStatus}
          canUseSectionMode={canUseSectionMode}
        />

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
                    {!isReferencesSection && (
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label="Add evidence"
                        onClick={() => setAddEvidenceOpen(true)}
                      >
                        <span className="material-icons-round">add</span>
                      </button>
                    )}
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
                  <span className={styles.ledgerContextSection}>{evidenceTargetMeta.label}</span>
                </div>
              </div>

              <div className={styles.panelBody}>
                {isReferencesSection ? (
                  <div className={styles.emptyPanel}>
                    <div className={styles.emptyIcon}>
                      <span className="material-icons-round">auto_awesome</span>
                    </div>
                    <h3>Auto-generated section</h3>
                    <p>References are generated from citation nodes in manuscript sections.</p>
                  </div>
                ) : usedEvidence.length === 0 ? (
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
                editor={isReferencesSection ? null : (resolvedMode === "section" ? sectionEditor : activeEditor)}
                dir={paragraphDir}
                onAskAi={() => {
                  if (isReferencesSection) return;
                  const ed = resolvedMode === "section" ? sectionEditor : activeEditor;
                  const selectedText = ed && !ed.state.selection.empty
                    ? ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)
                    : ed?.getText().slice(0, 500) ?? "";
                  if (captureEnabled) {
                    openPopupForTarget(buildDraftSelectionTarget({
                      projectId: id,
                      section: activeSectionLabel,
                      selectedText,
                      surroundingText: ed?.getText().slice(0, 1_200) ?? "",
                    }));
                    return;
                  }
                  openPopupChat({
                    type: "draft_selection",
                    projectId: id,
                    section: activeSectionLabel,
                    selectedText,
                  });
                }}
              />
              {showDraftContextToolbar ? (
                <div className={styles.contextActionStrip} role="group" aria-label="Draft context actions">
                  <div className={styles.contextActionMeta}>Draft context</div>
                  <button
                    type="button"
                    className={styles.contextActionPrimary}
                    onClick={() => handleDraftContextAction(
                      "send_to_copilot",
                      sendToCopilotAction.defaultPrompt ?? "Use this context in your answer.",
                    )}
                    disabled={!canRunDraftContextActions}
                    title={canRunDraftContextActions ? "Attach this draft context to the copilot composer." : "Add draft text to enable context actions."}
                  >
                    <span className="material-icons-round">{sendToCopilotAction.icon}</span>
                    {sendToCopilotAction.label}
                  </button>
                  <button
                    type="button"
                    className={styles.contextActionButton}
                    onClick={() => handleDraftContextAction(
                      "rewrite_selection",
                      rewriteSelectionAction.defaultPrompt ?? "Rewrite this text for clarity while preserving the meaning and staying conservative.",
                    )}
                    disabled={!canRunDraftContextActions}
                    title={canRunDraftContextActions ? "Prefill the copilot with a rewrite request for this draft context." : "Add draft text to enable context actions."}
                  >
                    <span className="material-icons-round">{rewriteSelectionAction.icon}</span>
                    {rewriteSelectionAction.label}
                  </button>
                  <button
                    type="button"
                    className={styles.contextActionButton}
                    onClick={() => handleDraftContextAction(
                      "check_claim_support",
                      checkClaimSupportAction.defaultPrompt ?? "Check whether this claim is supported and point out any missing or weak evidence.",
                    )}
                    disabled={!canRunDraftContextActions}
                    title={canRunDraftContextActions ? "Prefill the copilot with a claim-support check for this draft context." : "Add draft text to enable context actions."}
                  >
                    <span className="material-icons-round">{checkClaimSupportAction.icon}</span>
                    {checkClaimSupportAction.label}
                  </button>
                </div>
              ) : null}
              <DraftFormattingPanel
                isOpen={isFormatOpen}
                setOpen={setFormatOpen}
                formatRef={formatRef}
                activeSection={activeFormatSectionId}
                activeFormat={activeFormat}
                activeFontFamily={activeFontFamily}
                onUpdateFormat={updateSectionFormat}
              />
            </div>
            {citationIssues.length > 0 && (
              <div className={styles.citationIssues} role="status" aria-live="polite">
                <div className={styles.citationIssuesTitle}>
                  <span className="material-icons-round">warning</span>
                  {citationIssues.length} citation issue{citationIssues.length === 1 ? "" : "s"} detected
                </div>
                <ul className={styles.citationIssuesList}>
                  {citationIssues.slice(0, 3).map((issue) => (
                    <li key={`${issue.uid}-${issue.type}`}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {resolvedMode === "section" ? (
              <div
                className={styles.sectionEditorWrapper}
                role="tabpanel"
                id="draft-section-panel"
                aria-labelledby={routeActiveSection ? `draft-tab-${routeActiveSection}` : undefined}
              >
                {isReferencesSection ? (
                  <>
                    <div className={styles.editorSurface} style={activeFormatVars}>
                      <DraftSectionHeading id={`section-heading-${routeActiveSection ?? "whole-draft"}`} label={activeSectionLabel} />
                      <pre className={styles.referencesReadOnly}>{jsonToText(draft.contentBySection.references)}</pre>
                    </div>
                    <div className={styles.helperText}>References are auto-generated from inline citations.</div>
                  </>
                ) : (
                  <>
                    <div className={styles.editorSurface} style={activeFormatVars}>
                      <DraftSectionHeading id={`section-heading-${routeActiveSection ?? "whole-draft"}`} label={activeSectionLabel} />
                      <EditorContent editor={sectionEditor} />
                    </div>
                    <div className={styles.helperText}>{activeSectionMeta?.placeholder}</div>
                  </>
                )}
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
                        className={`${styles.manuscriptSection} ${routeActiveSection === section.id ? styles.manuscriptSectionActive : ""
                          }`}
                        ref={(el) => {
                          sectionElRef.current[section.id] = el;
                        }}
                        aria-labelledby={`manuscript-${section.id}`}
                      >
                        <DraftSectionHeading id={`manuscript-${section.id}`} label={section.label} />
                        {section.id === "references" ? (
                          <div className={styles.manuscriptEditorSurface}>
                            <pre className={styles.referencesReadOnly}>{jsonToText(draft.contentBySection.references)}</pre>
                          </div>
                        ) : (
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
                        )}
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
        exportMode={exportMode}
        onExportModeChange={setExportMode}
        citationIssuesCount={exportCitationIssues.length}
        blockingCitationIssuesCount={blockingCitationIssuesCount}
        latestExport={latestExport}
        exportHistory={exportHistory}
        onDeleteExport={handleDeleteExport}
      />
    </>
  );

  return (
    <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={draftMainClassName}>
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
