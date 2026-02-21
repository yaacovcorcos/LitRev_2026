"use client";

import { useEffect, useMemo, useState } from "react";
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

  const triggerClassName = `${styles.trigger} ${variant === "panel" ? styles.triggerPanel : styles.triggerPage}`;

  return (
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
                      >
                        <span className={styles.itemTitle}>{conversation.title || "New conversation"}</span>
                        {meta ? <span className={styles.itemMeta}>{meta}</span> : null}
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
  );
}
