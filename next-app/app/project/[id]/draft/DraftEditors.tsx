"use client";

import { CSSProperties, useEffect, type ReactNode } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Extension, Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { DraftSectionId } from "@/types/draft";
import { MANUSCRIPT_SECTION_NODE_TYPE } from "@/types/manuscript";
import styles from "./draft-studio.module.css";

const formatCitationLabel = (number: unknown) => {
  if (typeof number === "number" && Number.isFinite(number) && number > 0) {
    return `[${number}]`;
  }
  return "[?]";
};

export const Citation = TiptapNode.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      studyId: { default: null },
      uid: { default: null },
      locator: { default: "" },
      prefix: { default: "" },
      suffix: { default: "" },
      number: { default: null },
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
        "data-study-id": node.attrs.studyId ?? "",
        title: typeof node.attrs.studyId === "string" && node.attrs.studyId ? `Citation: ${node.attrs.studyId}` : "Citation",
      }),
      formatCitationLabel(node.attrs.number),
    ];
  },
});

export const ParagraphDirection = Extension.create({
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

export const BlockIdentity = Extension.create({
  name: "blockIdentity",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote"],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) => {
              if (!attributes.blockId) return {};
              return {
                "data-block-id": attributes.blockId,
              };
            },
          },
        },
      },
    ];
  },
});

export function sectionIdAtPosition(editor: Editor, position: number): DraftSectionId | null {
  const docSize = editor.state.doc.content.size;
  const safePosition = Math.max(0, Math.min(position, docSize));
  const $pos = editor.state.doc.resolve(safePosition);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== MANUSCRIPT_SECTION_NODE_TYPE) continue;
    const sectionId = node.attrs.sectionId;
    return typeof sectionId === "string" && sectionId.trim().length > 0 ? sectionId : null;
  }
  return null;
}

export const ManuscriptSection = TiptapNode.create({
  name: MANUSCRIPT_SECTION_NODE_TYPE,
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      sectionId: { default: null },
      sectionNodeId: { default: null },
      kind: { default: "base" },
      label: { default: "" },
      placeholder: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "section[data-manuscript-section]",
        contentElement: "div[data-manuscript-section-content]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const sectionId = typeof node.attrs.sectionId === "string" ? node.attrs.sectionId : "";
    const label = typeof node.attrs.label === "string" && node.attrs.label ? node.attrs.label : sectionId;
    const sectionNodeId = typeof node.attrs.sectionNodeId === "string" ? node.attrs.sectionNodeId : "";
    const readOnly = sectionId === "references";
    const eyebrow = readOnly ? "Generated references" : "";
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-manuscript-section": "true",
        "data-section-id": sectionId,
        "data-section-node-id": sectionNodeId,
        "data-read-only-section": readOnly ? "true" : "false",
        class: styles.manuscriptSectionNode,
      }),
      [
        "div",
        {
          class: styles.manuscriptSectionChrome,
          contenteditable: "false",
        },
        ["div", { class: styles.manuscriptSectionEyebrow }, eyebrow],
        ["h2", { class: styles.manuscriptSectionNodeTitle }, label],
      ],
      ["div", { class: styles.manuscriptSectionContent, "data-manuscript-section-content": "true" }, 0],
    ];
  },
});

type BuildDraftEditorExtensionsParams = {
  placeholderText?: string;
  manuscript?: boolean;
};

export function buildDraftEditorExtensions(params: BuildDraftEditorExtensionsParams = {}) {
  const { placeholderText, manuscript = false } = params;
  return [
    StarterKit,
    Underline,
    Citation,
    ParagraphDirection,
    BlockIdentity,
    ...(manuscript ? [ManuscriptSection] : []),
    Placeholder.configure({
      placeholder: placeholderText ?? "Start writing…",
    }),
  ];
}

type ToolbarProps = {
  editor: Editor | null;
  dir?: "ltr" | "rtl";
  onAskAi?: () => void;
};

export function EditorToolbar({ editor, dir = "ltr", onAskAi }: ToolbarProps) {
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
        aria-label="Heading 2"
        aria-pressed={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Heading 3"
        aria-pressed={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
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
      {onAskAi && (
        <>
          <div className={styles.toolbarDivider} aria-hidden="true" />
          <button
            type="button"
            className={styles.toolbarButton}
            aria-label="Ask AI"
            onClick={onAskAi}
          >
            <span className="material-icons-round">smart_toy</span>
          </button>
        </>
      )}
    </div>
  );
}

type FullSectionEditorProps = {
  sectionId: DraftSectionId;
  content: JSONContent;
  onFocusSection: (key: DraftSectionId, editor: Editor) => void;
  onUpdateSection: (key: DraftSectionId, json: JSONContent) => void;
  registerEditor: (key: DraftSectionId, editor: Editor | null) => void;
  onSelectionChange?: (key: DraftSectionId, editor: Editor) => void;
  placeholderText?: string;
  surfaceClassName?: string;
  surfaceStyle?: CSSProperties;
  editable?: boolean;
  prefixContent?: ReactNode;
};

export function FullSectionEditor({
  sectionId,
  content,
  onFocusSection,
  onUpdateSection,
  registerEditor,
  onSelectionChange,
  placeholderText,
  surfaceClassName,
  surfaceStyle,
  editable = true,
  prefixContent,
}: FullSectionEditorProps) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: buildDraftEditorExtensions({ placeholderText }),
      content,
      editable,
      editorProps: {
        attributes: {
          class: styles.proseMirror,
        },
      },
      onFocus: ({ editor }) => onFocusSection(sectionId, editor),
      onUpdate: ({ editor }) => onUpdateSection(sectionId, editor.getJSON()),
      onSelectionUpdate: ({ editor }) => onSelectionChange?.(sectionId, editor),
    },
    []
  );

  useEffect(() => {
    registerEditor(sectionId, editor);
    return () => registerEditor(sectionId, null);
  }, [editor, registerEditor, sectionId]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) === JSON.stringify(content)) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  return (
    <div className={surfaceClassName ?? styles.editorSurface} style={surfaceStyle}>
      {prefixContent}
      <EditorContent editor={editor} />
    </div>
  );
}
