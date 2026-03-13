"use client";

import { CSSProperties, useEffect } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Extension, Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { DraftSectionId } from "@/types/draft";
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
  placeholderText?: string;
  surfaceClassName?: string;
  surfaceStyle?: CSSProperties;
};

export function FullSectionEditor({
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
        BlockIdentity,
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

  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) === JSON.stringify(content)) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  return (
    <div className={surfaceClassName ?? styles.editorSurface} style={surfaceStyle}>
      <EditorContent editor={editor} />
    </div>
  );
}
