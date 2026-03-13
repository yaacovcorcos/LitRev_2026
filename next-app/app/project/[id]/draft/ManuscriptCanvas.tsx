"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { DraftSectionId } from "@/types/draft";
import { buildDraftEditorExtensions } from "./DraftEditors";
import { buildDraftEditorMap, type DraftEditorBlockEntry, type DraftEditorMap } from "./workspace-view-model";
import styles from "./draft-studio.module.css";

const BLOCK_TOOL_NODE_TYPES = new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote"]);
const REFERENCES_MUTATION_KEYS = new Set(["Backspace", "Delete", "Enter", "Tab"]);

function sectionIdAtViewPosition(view: { state: { doc: { content: { size: number }; resolve: (position: number) => { depth: number; node: (depth: number) => { type: { name: string }; attrs: { sectionId?: string } } } } } }, position: number) {
  const docSize = view.state.doc.content.size;
  const safePosition = Math.max(0, Math.min(position, docSize));
  const $pos = view.state.doc.resolve(safePosition);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "manuscriptSection") continue;
    return typeof node.attrs.sectionId === "string" ? node.attrs.sectionId : null;
  }
  return null;
}

type ManuscriptCanvasProps = {
  manuscriptDoc: JSONContent;
  formatVarsById: Record<DraftSectionId, Record<string, string>>;
  activeBlockId: string | null;
  selectedBlockEntry: DraftEditorBlockEntry | null;
  onEditorReady: (editor: Editor | null) => void;
  onManuscriptChange: (doc: JSONContent) => void;
  onEditorMapChange: (editorMap: DraftEditorMap) => void;
  onSelectionUpdate: (selectionFrom: number, editorMap: DraftEditorMap) => void;
  onEditorSignalsChange: () => void;
  onMoveSelectedBlock: (direction: "up" | "down") => void;
};

export function ManuscriptCanvas({
  manuscriptDoc,
  formatVarsById,
  activeBlockId,
  selectedBlockEntry,
  onEditorReady,
  onManuscriptChange,
  onEditorMapChange,
  onSelectionUpdate,
  onEditorSignalsChange,
  onMoveSelectedBlock,
}: ManuscriptCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [blockToolsTop, setBlockToolsTop] = useState<number | null>(null);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: buildDraftEditorExtensions({ manuscript: true, placeholderText: "Start writing…" }),
      content: manuscriptDoc,
      editorProps: {
        attributes: {
          class: styles.proseMirror,
        },
        handleKeyDown: (view, event) => {
          const activeSectionId = sectionIdAtViewPosition(view, view.state.selection.from);
          if (activeSectionId !== "references") return false;
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
            return true;
          }
          if (REFERENCES_MUTATION_KEYS.has(event.key)) {
            return true;
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            return true;
          }
          return false;
        },
        handleTextInput: (view, from) => {
          const activeSectionId = sectionIdAtViewPosition(view, from);
          return activeSectionId === "references";
        },
        handlePaste: (view) => {
          const activeSectionId = sectionIdAtViewPosition(view, view.state.selection.from);
          return activeSectionId === "references";
        },
        handleDrop: (view) => {
          const activeSectionId = sectionIdAtViewPosition(view, view.state.selection.from);
          return activeSectionId === "references";
        },
      },
      onCreate: ({ editor }) => {
        const editorMap = buildDraftEditorMap(editor.state.doc);
        onEditorReady(editor);
        onEditorMapChange(editorMap);
        onSelectionUpdate(editor.state.selection.from, editorMap);
        onEditorSignalsChange();
      },
      onUpdate: ({ editor }) => {
        const editorMap = buildDraftEditorMap(editor.state.doc);
        onEditorMapChange(editorMap);
        onSelectionUpdate(editor.state.selection.from, editorMap);
        onEditorSignalsChange();
        onManuscriptChange(editor.getJSON());
      },
      onSelectionUpdate: ({ editor }) => {
        const editorMap = buildDraftEditorMap(editor.state.doc);
        onEditorMapChange(editorMap);
        onSelectionUpdate(editor.state.selection.from, editorMap);
        onEditorSignalsChange();
      },
      onFocus: () => {
        onEditorSignalsChange();
      },
    },
    [],
  );

  useEffect(() => {
    onEditorReady(editor);
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) === JSON.stringify(manuscriptDoc)) return;
    const from = editor.state.selection.from;
    const to = editor.state.selection.to;
    editor.commands.setContent(manuscriptDoc, { emitUpdate: false });
    const docSize = editor.state.doc.content.size;
    const safeFrom = Math.min(Math.max(from, 1), Math.max(docSize, 1));
    const safeTo = Math.min(Math.max(to, safeFrom), Math.max(docSize, safeFrom));
    editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
    const editorMap = buildDraftEditorMap(editor.state.doc);
    onEditorMapChange(editorMap);
    onSelectionUpdate(editor.state.selection.from, editorMap);
    onEditorSignalsChange();
  }, [editor, manuscriptDoc, onEditorMapChange, onEditorSignalsChange, onSelectionUpdate]);

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom as HTMLElement;
    Object.entries(formatVarsById).forEach(([sectionId, vars]) => {
      const sectionEl = root.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
      if (!sectionEl) return;
      Object.entries(vars).forEach(([key, value]) => {
        sectionEl.style.setProperty(key, value);
      });
    });
  }, [editor, formatVarsById]);

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom as HTMLElement;
    root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((node) => {
      node.classList.toggle(styles.proseMirrorBlockActive, node.dataset.blockId === activeBlockId);
    });
  }, [activeBlockId, editor]);

  useEffect(() => {
    if (!surfaceRef.current || !editor || !activeBlockId || !selectedBlockEntry) {
      setBlockToolsTop(null);
      return;
    }
    if (!BLOCK_TOOL_NODE_TYPES.has(selectedBlockEntry.nodeType)) {
      setBlockToolsTop(null);
      return;
    }
    const root = editor.view.dom as HTMLElement;
    const activeNode = root.querySelector<HTMLElement>(`[data-block-id="${activeBlockId}"]`);
    if (!activeNode) {
      setBlockToolsTop(null);
      return;
    }
    const sectionEl = activeNode.closest<HTMLElement>("[data-manuscript-section]");
    if (sectionEl?.dataset.sectionId === "references") {
      setBlockToolsTop(null);
      return;
    }
    const syncPosition = () => {
      if (!surfaceRef.current) return;
      const surfaceRect = surfaceRef.current.getBoundingClientRect();
      const nodeRect = activeNode.getBoundingClientRect();
      setBlockToolsTop(nodeRect.top - surfaceRect.top + surfaceRef.current.scrollTop);
    };
    syncPosition();
    const surface = surfaceRef.current;
    surface.addEventListener("scroll", syncPosition, { passive: true });
    window.addEventListener("resize", syncPosition, { passive: true });
    return () => {
      surface.removeEventListener("scroll", syncPosition);
      window.removeEventListener("resize", syncPosition);
    };
  }, [activeBlockId, editor, selectedBlockEntry]);

  const handleSelectCurrentBlock = () => {
    if (!editor || !selectedBlockEntry) return;
    editor.commands.setTextSelection({
      from: selectedBlockEntry.from,
      to: Math.max(selectedBlockEntry.from, selectedBlockEntry.to - 1),
    });
    editor.chain().focus(selectedBlockEntry.focusPos).run();
  };

  return (
    <div className={styles.manuscriptCanvasWrap}>
      <div ref={surfaceRef} className={styles.manuscriptCanvasSurface}>
        {blockToolsTop != null && selectedBlockEntry ? (
          <div className={styles.blockTools} style={{ top: blockToolsTop }}>
            <button
              type="button"
              className={styles.blockToolButton}
              aria-label="Select current block"
              onClick={handleSelectCurrentBlock}
            >
              <span className="material-icons-round">drag_indicator</span>
            </button>
            <button
              type="button"
              className={styles.blockToolButton}
              aria-label="Move block up"
              onClick={() => onMoveSelectedBlock("up")}
            >
              <span className="material-icons-round">arrow_upward</span>
            </button>
            <button
              type="button"
              className={styles.blockToolButton}
              aria-label="Move block down"
              onClick={() => onMoveSelectedBlock("down")}
            >
              <span className="material-icons-round">arrow_downward</span>
            </button>
          </div>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
