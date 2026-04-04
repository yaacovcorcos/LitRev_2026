"use client";

import { createPortal } from "react-dom";

import type { ChatConversation, ConversationGroup } from "./groupConversationsByDate";
import styles from "./ai-view.module.css";

type ContextMenuState = {
  x: number;
  y: number;
  conversationId: string;
} | null;

type AiHistorySidebarContentProps = {
  historyContentId: string;
  isHistoryLoading: boolean;
  conversations: ChatConversation[];
  historyGroups: ConversationGroup[];
  activeConversationId: string | null;
  renamingId: string | null;
  renameValue: string;
  contextMenu: ContextMenuState;
  setRenameValue: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onConversationContextMenu: (event: React.MouseEvent, conversationId: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDismissContextMenu: () => void;
  onStartRename: (conversationId: string) => void;
  onDuplicateConversation: (conversationId: string, event: React.MouseEvent) => void;
  onDeleteConversation: (conversationId: string, event: React.MouseEvent) => void;
};

export function AiHistorySidebarContent({
  historyContentId,
  isHistoryLoading,
  conversations,
  historyGroups,
  activeConversationId,
  renamingId,
  renameValue,
  contextMenu,
  setRenameValue,
  onSelectConversation,
  onConversationContextMenu,
  onCommitRename,
  onCancelRename,
  onDismissContextMenu,
  onStartRename,
  onDuplicateConversation,
  onDeleteConversation,
}: AiHistorySidebarContentProps) {
  return (
    <>
      <div id={historyContentId} aria-hidden={false}>
        <div className={styles.historyList}>
          {isHistoryLoading && (
            <div className={styles.emptyHistory}>
              <span className="material-icons-round">hourglass_top</span>
              <p>Loading conversations...</p>
            </div>
          )}

          {historyGroups.map((group) => (
            <div className={styles.historyGroup} key={group.title}>
              <h4 className={styles.historyHeading}>{group.title}</h4>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  className={`${styles.historyItem} ${activeConversationId === conv.id ? styles.activeHistory : ""}`}
                  onContextMenu={(event) => onConversationContextMenu(event, conv.id)}
                >
                  {renamingId === conv.id ? (
                    <input
                      className={styles.renameInput}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={onCommitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onCommitRename();
                        if (event.key === "Escape") onCancelRename();
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.historySelectBtn}
                      onClick={() => onSelectConversation(conv.id)}
                      aria-current={activeConversationId === conv.id ? "true" : undefined}
                    >
                      <span className={styles.historyTitle}>{conv.title ?? "New conversation"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.moreBtn}
                    onClick={(event) => onConversationContextMenu(event, conv.id)}
                    aria-label="More options"
                  >
                    <span className="material-icons-round">more_vert</span>
                  </button>
                </div>
              ))}
            </div>
          ))}

          {!isHistoryLoading && conversations.length === 0 && (
            <div className={styles.emptyHistory}>
              <span className="material-icons-round">forum</span>
              <p>No conversations yet</p>
            </div>
          )}
        </div>
      </div>

      {contextMenu && createPortal(
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={onDismissContextMenu}
        >
          <button
            type="button"
            className={styles.contextMenuItem}
            onClick={() => onStartRename(contextMenu.conversationId)}
          >
            <span className="material-icons-round">edit</span>
            Rename
          </button>
          <button
            type="button"
            className={styles.contextMenuItem}
            onClick={(event) => {
              onDismissContextMenu();
              onDuplicateConversation(contextMenu.conversationId, event);
            }}
          >
            <span className="material-icons-round">content_copy</span>
            Duplicate
          </button>
          <button
            type="button"
            className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
            onClick={(event) => {
              onDismissContextMenu();
              onDeleteConversation(contextMenu.conversationId, event);
            }}
          >
            <span className="material-icons-round">delete_outline</span>
            Delete
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
