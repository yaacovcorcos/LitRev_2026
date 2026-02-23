"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import styles from "./ConversationPicker.module.css";

const DEFAULT_GROUP = "__all__";

export type ConversationPickerItem = {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
};

export type ConversationPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConversationId: string | null;
  currentTitle: string;
  conversations: ConversationPickerItem[];
  onSelect: (conversationId: string) => void | Promise<void>;
  onDelete?: (conversationId: string) => void | Promise<void>;
  onDuplicate?: (conversationId: string) => void | Promise<void>;
  onRename?: (conversationId: string, title: string) => void | Promise<void>;
  searchPlaceholder?: string;
  emptyLabel?: string;
  renderMeta?: (conversation: ConversationPickerItem) => string | null | undefined;
  groupBy?: (conversation: ConversationPickerItem) => string | null;
  groupOrder?: string[];
  variant?: "panel" | "page";
};

export function ConversationPicker({
  open,
  onOpenChange,
  currentConversationId,
  currentTitle,
  conversations,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
  searchPlaceholder = "Search sessions...",
  emptyLabel = "No conversations found",
  renderMeta,
  groupBy,
  groupOrder,
  variant = "panel",
}: ConversationPickerProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const normalized = query.trim().toLowerCase();
    return conversations.filter((conversation) =>
      (conversation.title || "New conversation").toLowerCase().includes(normalized),
    );
  }, [conversations, query]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, ConversationPickerItem[]>();

    filtered.forEach((conversation) => {
      const key = groupBy?.(conversation) ?? DEFAULT_GROUP;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(conversation);
      } else {
        buckets.set(key, [conversation]);
      }
    });

    const keys = Array.from(buckets.keys()).sort((a, b) => {
      if (!groupOrder?.length) return 0;
      const aIndex = groupOrder.indexOf(a);
      const bIndex = groupOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return keys.map((key) => ({
      label: key === DEFAULT_GROUP ? null : key,
      items: buckets.get(key) ?? [],
    }));
  }, [filtered, groupBy, groupOrder]);

  // ── Context menu (right-click on conversation item) ──────────────────────
  const hasContextMenu = !!(onDelete || onDuplicate || onRename);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; conversationId: string } | null>(null);

  const handleItemContextMenu = useCallback((e: React.MouseEvent, conversationId: string) => {
    if (!hasContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, conversationId });
  }, [hasContextMenu]);

  const dismissCtxMenu = useCallback(() => setCtxMenu(null), []);

  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = () => setCtxMenu(null);
    document.addEventListener("click", dismiss);
    document.addEventListener("scroll", dismiss, true);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  const triggerClassName = `${styles.trigger} ${variant === "panel" ? styles.triggerPanel : styles.triggerPage}`;

  return (
    <>
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={triggerClassName}
          title={currentTitle}
          aria-label="Select conversation"
        >
          <span className={styles.triggerTitle}>{currentTitle}</span>
          <svg className={styles.chevronIcon} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className={`${styles.dropdown} ${variant === "page" ? styles.dropdownPage : ""}`} side="bottom" align="start" sideOffset={4}>
          <Command shouldFilter={false} className={styles.command}>
            <div className={styles.searchWrapper}>
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                className={styles.searchInput}
              />
            </div>

            <Command.List className={styles.list}>
              <Command.Empty className={styles.empty}>{emptyLabel}</Command.Empty>

              {grouped.map((group) => (
                <Command.Group
                  key={group.label ?? DEFAULT_GROUP}
                  heading={group.label ?? undefined}
                  className={styles.group}
                >
                  {group.items.map((conversation) => {
                    const meta = renderMeta?.(conversation);
                    const isCurrent = currentConversationId === conversation.id;
                    return (
                      <Command.Item
                        key={conversation.id}
                        value={`${conversation.title || "New conversation"} ${meta ?? ""}`}
                        className={`${styles.item} ${isCurrent ? styles.itemCurrent : ""}`}
                        onSelect={() => {
                          void onSelect(conversation.id);
                          onOpenChange(false);
                        }}
                        onContextMenu={(e) => handleItemContextMenu(e, conversation.id)}
                      >
                        <span className={styles.itemTitle}>{conversation.title || "New conversation"}</span>
                        {meta ? <span className={styles.itemMeta}>{meta}</span> : null}
                        {hasContextMenu && (
                          <button
                            type="button"
                            className={styles.itemMoreBtn}
                            onClick={(e) => handleItemContextMenu(e, conversation.id)}
                            aria-label="More options"
                          >
                            <span className="material-icons-round">more_vert</span>
                          </button>
                        )}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>

    {ctxMenu && createPortal(
      <div
        className={styles.contextMenu}
        style={{ top: ctxMenu.y, left: ctxMenu.x }}
        onClick={dismissCtxMenu}
      >
        {onRename && (
          <button
            type="button"
            className={styles.contextMenuItem}
            onClick={() => {
              const conv = conversations.find((c) => c.id === ctxMenu.conversationId);
              const name = window.prompt("Rename conversation", conv?.title ?? "");
              if (name?.trim()) { void onRename(ctxMenu.conversationId, name.trim()); }
              onOpenChange(false);
            }}
          >
            <span className="material-icons-round">edit</span>
            Rename
          </button>
        )}
        {onDuplicate && (
          <button
            type="button"
            className={styles.contextMenuItem}
            onClick={() => { void onDuplicate(ctxMenu.conversationId); onOpenChange(false); }}
          >
            <span className="material-icons-round">content_copy</span>
            Duplicate
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
            onClick={() => { void onDelete(ctxMenu.conversationId); onOpenChange(false); }}
          >
            <span className="material-icons-round">delete_outline</span>
            Delete
          </button>
        )}
      </div>,
      document.body,
    )}
    </>
  );
}
