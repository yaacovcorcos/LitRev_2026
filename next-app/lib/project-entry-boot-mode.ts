"use client";

import type { FocusMode, ViewTab } from "@/contexts/ProjectShellContext";
import { parseProjectConversationPath } from "@/lib/durable-route-state";
import {
  decideConversationRestore,
  readProjectEntryState,
} from "@/lib/project-entry-restore";

export type ProjectBootMode = "conversation" | "overview" | "protocol" | "ledger" | "draft" | "memory" | "notes";

export type ProjectShellBootState = {
  focusMode: FocusMode;
  activeTab: ViewTab;
  bootMode: ProjectBootMode;
};

export function tabFromProjectPathname(pathname: string): ViewTab | null {
  if (pathname.endsWith("/protocol")) return "protocol";
  if (pathname.endsWith("/ledger") || pathname.includes("/ledger/")) return "ledger";
  if (pathname.endsWith("/draft")) return "draft";
  if (pathname.endsWith("/memory")) return "memory";
  if (pathname.endsWith("/notes")) return "notes";
  return null;
}

export function deriveProjectShellBootState(args: {
  pathname: string;
  projectId: string;
  projectEntryRestoreEnabled: boolean;
}): ProjectShellBootState {
  const { pathname, projectId, projectEntryRestoreEnabled } = args;
  const conversationRoute = parseProjectConversationPath(pathname);
  if (conversationRoute?.projectId === projectId) {
    return {
      focusMode: "conversation",
      activeTab: "overview",
      bootMode: "conversation",
    };
  }
  const deepLinkTab = tabFromProjectPathname(pathname);

  if (deepLinkTab) {
    return {
      focusMode: "view",
      activeTab: deepLinkTab,
      bootMode: deepLinkTab,
    };
  }

  if (projectEntryRestoreEnabled) {
    const decision = decideConversationRestore(
      readProjectEntryState(projectId),
      Date.now(),
    );
    if (decision.shouldRestore) {
      return {
        focusMode: "conversation",
        activeTab: "overview",
        bootMode: "conversation",
      };
    }
  }

  return {
    focusMode: "view",
    activeTab: "overview",
    bootMode: "overview",
  };
}
