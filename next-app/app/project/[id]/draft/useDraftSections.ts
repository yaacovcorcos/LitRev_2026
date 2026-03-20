/**
 * Custom hook encapsulating section CRUD and drag-and-drop logic
 * for the Draft Studio page. Extracted from page.tsx (D-4).
 */
import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { DraftSectionId } from "@/types/draft";
import { DEFAULT_SECTION_FORMAT, type DraftSectionFormat, DraftState, emptyDoc } from "@/lib/draftStorage";
import { createCustomSectionId, customSectionPlaceholder } from "./draft-helpers";
import type { Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";

type UseDraftSectionsDeps = {
  updateDraft: (updater: (prev: DraftState) => DraftState) => void;
  activeSectionRef: React.MutableRefObject<DraftSectionId | null>;
  activeEditorRef: React.MutableRefObject<Editor | null>;
  queueContentUpdate: (key: DraftSectionId, json: JSONContent) => void;
  flushContentCommit: () => void;
  focusEditorForSection: (key: DraftSectionId) => void;
};

export function useDraftSections(deps: UseDraftSectionsDeps) {
  const {
    updateDraft,
    activeSectionRef,
    activeEditorRef,
    queueContentUpdate,
    flushContentCommit,
  } = deps;

  // Section management state
  const [isAddSectionOpen, setAddSectionOpen] = useState(false);
  const addSectionRef = useRef<HTMLDivElement | null>(null);
  const [customSectionName, setCustomSectionName] = useState("");
  const addSectionInputRef = useRef<HTMLInputElement | null>(null);
  const sectionTabRefs = useRef<Record<DraftSectionId, HTMLButtonElement | null>>({} as Record<
    DraftSectionId,
    HTMLButtonElement | null
  >);

  // Drag-and-drop state
  const dragKeyRef = useRef<DraftSectionId | null>(null);
  const [dragOverKey, setDragOverKey] = useState<DraftSectionId | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const [draggingKey, setDraggingKey] = useState<DraftSectionId | null>(null);

  const openSectionInSectionMode = useCallback((key: DraftSectionId) => {
    const editor = activeEditorRef.current;
    const currentActiveSection = activeSectionRef.current;
    if (editor && currentActiveSection) {
      queueContentUpdate(currentActiveSection, editor.getJSON());
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateDraft, queueContentUpdate, flushContentCommit]);

  const handleAddSection = useCallback((key: DraftSectionId) => {
    updateDraft((prev) => {
      if (prev.sectionOrder.includes(key)) return prev;
      const next = [...prev.sectionOrder];
      const activeIndex = prev.activeSection ? next.indexOf(prev.activeSection) : -1;
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
  }, [updateDraft]);

  const handleAddCustomSection = useCallback(() => {
    const name = customSectionName.trim();
    if (!name) return;
    const id = createCustomSectionId(name);
    updateDraft((prev) => {
      const next = [...prev.sectionOrder];
      const activeIndex = prev.activeSection ? next.indexOf(prev.activeSection) : -1;
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
  }, [customSectionName, updateDraft]);

  const handleRemoveSection = useCallback((key: DraftSectionId) => {
    updateDraft((prev) => {
      const idx = prev.sectionOrder.indexOf(key);
      if (idx < 0) return prev;
      const next = prev.sectionOrder.filter((k) => k !== key);
      if (next.length === 0) return prev;
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
  }, [updateDraft]);

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

  // Drag-and-drop handlers
  const handleDragStart = useCallback((event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionId) => {
    dragKeyRef.current = key;
    setDraggingKey(key);
    setDragOverKey(null);
    setDragOverPosition(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
  }, []);

  const handleDragOver = useCallback((event: ReactDragEvent<HTMLButtonElement>, key: DraftSectionId) => {
    const dragging = dragKeyRef.current;
    if (!dragging || dragging === key) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - rect.left;
    const position = offset > rect.width / 2 ? "after" : "before";
    setDragOverKey(key);
    setDragOverPosition(position);
  }, []);

  const handleDrop = useCallback((event: ReactDragEvent<HTMLButtonElement>, targetKey: DraftSectionId) => {
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
  }, [dragOverPosition, updateDraft]);

  const handleDragEnd = useCallback(() => {
    dragKeyRef.current = null;
    setDraggingKey(null);
    setDragOverKey(null);
    setDragOverPosition(null);
  }, []);

  // Close add-section dropdown on outside click
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

  return {
    // Section management
    isAddSectionOpen,
    setAddSectionOpen,
    addSectionRef,
    customSectionName,
    setCustomSectionName,
    addSectionInputRef,
    sectionTabRefs,
    openSectionInSectionMode,
    handleAddSection,
    handleAddCustomSection,
    handleRemoveSection,
    updateSectionFormat,
    // Drag-and-drop
    dragOverKey,
    dragOverPosition,
    draggingKey,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
