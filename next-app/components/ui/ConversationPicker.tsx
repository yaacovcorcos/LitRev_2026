"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
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
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const effectiveConversations = useMemo(
    () =>
      conversations.map((conversation) => ({
        ...conversation,
        title: titleOverrides[conversation.id] ?? conversation.title,
      })),
    [conversations, titleOverrides],
  );

  useEffect(() => {
    setTitleOverrides((prev) => {
      const next: Record<string, string> = {};
      for (const [id, value] of Object.entries(prev)) {
        const conversation = conversations.find((item) => item.id === id);
        if (!conversation) continue;
        // Once server state catches up, drop the local optimistic override.
        if ((conversation.title ?? "") === value) continue;
        next[id] = value;
      }
      if (Object.keys(next).length === Object.keys(prev).length) return prev;
      return next;
    });
  }, [conversations]);

  const filtered = useMemo(() => {
    if (!query.trim()) return effectiveConversations;
    const normalized = query.trim().toLowerCase();
    return effectiveConversations.filter((conversation) =>
      (conversation.title || "New conversation").toLowerCase().includes(normalized),
    );
  }, [effectiveConversations, query]);

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

  const hasContextMenu = !!(onDelete || onDuplicate || onRename);

  const resetRenameState = useCallback(() => {
    if (renameSaving) return;
    setRenameTargetId(null);
    setRenameValue("");
    setRenameError(null);
  }, [renameSaving]);

  const beginRename = useCallback(
    (conversationId: string) => {
      if (!onRename) return;
      const conversation = effectiveConversations.find((item) => item.id === conversationId);
      setRenameTargetId(conversationId);
      setRenameValue(conversation?.title ?? "");
      setRenameError(null);
    },
    [effectiveConversations, onRename],
  );

  const submitRename = useCallback(async () => {
    if (!renameTargetId || !onRename) return;
    const nextTitle = renameValue.trim();
    if (!nextTitle) {
      setRenameError("Conversation name is required.");
      return;
    }

    const prevTitle = effectiveConversations.find((item) => item.id === renameTargetId)?.title ?? null;
    setTitleOverrides((prev) => ({ ...prev, [renameTargetId]: nextTitle }));
    setRenameSaving(true);
    setRenameError(null);
    try {
      await onRename(renameTargetId, nextTitle);
      setRenameTargetId(null);
      setRenameValue("");
    } catch {
      setTitleOverrides((prev) => {
        const next = { ...prev };
        if (prevTitle === null) delete next[renameTargetId];
        else next[renameTargetId] = prevTitle;
        return next;
      });
      setRenameError("Unable to rename conversation. Try again.");
    } finally {
      setRenameSaving(false);
    }
  }, [effectiveConversations, onRename, renameTargetId, renameValue]);

  const triggerClassName = `${styles.trigger} ${variant === "panel" ? styles.triggerPanel : styles.triggerPage}`;

  const onMenuRename = useCallback((conversationId: string) => {
    beginRename(conversationId);
    onOpenChange(false);
  }, [beginRename, onOpenChange]);

  const onMenuDuplicate = useCallback((conversationId: string) => {
    if (!onDuplicate) return;
    void onDuplicate(conversationId);
    onOpenChange(false);
  }, [onDuplicate, onOpenChange]);

  const onMenuDelete = useCallback((conversationId: string) => {
    if (!onDelete) return;
    void onDelete(conversationId);
    onOpenChange(false);
  }, [onDelete, onOpenChange]);

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
                      const conversationTitle = conversation.title || "New conversation";
                      const menuItems = (
                        <>
                          {onRename && (
                            <ContextMenu.Item
                              className={styles.contextMenuItem}
                              onSelect={(event) => {
                                event.preventDefault();
                                onMenuRename(conversation.id);
                              }}
                            >
                              <span className="material-icons-round">edit</span>
                              Rename
                            </ContextMenu.Item>
                          )}
                          {onDuplicate && (
                            <ContextMenu.Item
                              className={styles.contextMenuItem}
                              onSelect={(event) => {
                                event.preventDefault();
                                onMenuDuplicate(conversation.id);
                              }}
                            >
                              <span className="material-icons-round">content_copy</span>
                              Duplicate
                            </ContextMenu.Item>
                          )}
                          {onDelete && (
                            <ContextMenu.Item
                              className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
                              onSelect={(event) => {
                                event.preventDefault();
                                onMenuDelete(conversation.id);
                              }}
                            >
                              <span className="material-icons-round">delete_outline</span>
                              Delete
                            </ContextMenu.Item>
                          )}
                        </>
                      );

                      return (
                        <ContextMenu.Root key={conversation.id}>
                          <ContextMenu.Trigger asChild disabled={!hasContextMenu}>
                            <Command.Item
                              value={`${conversationTitle} ${meta ?? ""}`}
                              className={`${styles.item} ${isCurrent ? styles.itemCurrent : ""}`}
                              onSelect={() => {
                                void onSelect(conversation.id);
                                onOpenChange(false);
                              }}
                            >
                              <span className={styles.itemTitle}>{conversationTitle}</span>
                              {meta ? <span className={styles.itemMeta}>{meta}</span> : null}
                              {hasContextMenu && (
                                <DropdownMenu.Root>
                                  <DropdownMenu.Trigger asChild>
                                    <button
                                      type="button"
                                      className={styles.itemMoreBtn}
                                      onClick={(event) => event.stopPropagation()}
                                      onPointerDown={(event) => event.stopPropagation()}
                                      aria-label="More options"
                                    >
                                      <span className="material-icons-round">more_vert</span>
                                    </button>
                                  </DropdownMenu.Trigger>
                                  <DropdownMenu.Portal>
                                    <DropdownMenu.Content className={styles.contextMenu} align="end" side="bottom" sideOffset={6}>
                                      {onRename && (
                                        <DropdownMenu.Item
                                          className={styles.contextMenuItem}
                                          onSelect={(event) => {
                                            event.preventDefault();
                                            onMenuRename(conversation.id);
                                          }}
                                        >
                                          <span className="material-icons-round">edit</span>
                                          Rename
                                        </DropdownMenu.Item>
                                      )}
                                      {onDuplicate && (
                                        <DropdownMenu.Item
                                          className={styles.contextMenuItem}
                                          onSelect={(event) => {
                                            event.preventDefault();
                                            onMenuDuplicate(conversation.id);
                                          }}
                                        >
                                          <span className="material-icons-round">content_copy</span>
                                          Duplicate
                                        </DropdownMenu.Item>
                                      )}
                                      {onDelete && (
                                        <DropdownMenu.Item
                                          className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
                                          onSelect={(event) => {
                                            event.preventDefault();
                                            onMenuDelete(conversation.id);
                                          }}
                                        >
                                          <span className="material-icons-round">delete_outline</span>
                                          Delete
                                        </DropdownMenu.Item>
                                      )}
                                    </DropdownMenu.Content>
                                  </DropdownMenu.Portal>
                                </DropdownMenu.Root>
                              )}
                            </Command.Item>
                          </ContextMenu.Trigger>
                          {hasContextMenu && (
                            <ContextMenu.Portal>
                              <ContextMenu.Content className={styles.contextMenu}>
                                {menuItems}
                              </ContextMenu.Content>
                            </ContextMenu.Portal>
                          )}
                        </ContextMenu.Root>
                      );
                    })}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Dialog.Root open={renameTargetId !== null} onOpenChange={(nextOpen) => { if (!nextOpen) resetRenameState(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.renameOverlay} />
          <Dialog.Content className={styles.renameDialog}>
            <Dialog.Title className={styles.renameTitle}>Rename conversation</Dialog.Title>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitRename();
              }}
            >
              <label className={styles.renameLabel} htmlFor="conversation-rename-input">Conversation name</label>
              <input
                id="conversation-rename-input"
                className={styles.renameInput}
                value={renameValue}
                autoFocus
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  if (renameError) setRenameError(null);
                }}
              />
              {renameError ? <p className={styles.renameError}>{renameError}</p> : null}
              <div className={styles.renameActions}>
                <button
                  type="button"
                  className={styles.renameCancel}
                  onClick={resetRenameState}
                  disabled={renameSaving}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.renameSave} disabled={renameSaving}>
                  {renameSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
