"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import { useRouter, useParams } from "next/navigation";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { useProjectCopilotSafe } from "@/contexts/ProjectCopilotContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useHydrated } from "@/hooks/useHydrated";
import {
    getGroupedCommands,
    type CommandContext,
    type CommandHelpers,
    type CommandDefinition,
} from "@/lib/commands/registry";
import type { AgentMode } from "@/types/agent";
import type { CopilotPage } from "@/types/ai";
import styles from "./CommandPalette.module.css";

const SECTION_LABELS: Record<string, string> = {
    navigation: "Navigation",
    agent: "Agent Actions",
    mode: "Mode",
};

export function CommandPalette() {
    useGlobalShortcuts();

    const { isOpen, close, sidebarToggle, copilotToggle } = useCommandPalette();
    const router = useRouter();
    const params = useParams<{ id?: string }>();
    const shell = useProjectShell();
    const copilot = useProjectCopilotSafe();
    const hydrated = useHydrated();
    useBodyScrollLock(isOpen && hydrated);

    // Build context
    const projectId = params?.id ?? null;
    const ctx: CommandContext = useMemo(() => ({
        isInProject: shell.isEmbeddedInProjectShell,
        projectId,
        activeTab: shell.activeTab,
        focusMode: shell.focusMode,
        isCopilotCollapsed: copilot?.isCollapsed ?? true,
    }), [shell, projectId, copilot?.isCollapsed]);

    // Build helpers
    const helpers: CommandHelpers = useMemo(() => ({
        navigate: (path: string) => router.push(path),
        setActiveTab: shell.setActiveTab,
        returnToConversation: shell.returnToConversation,
        toggleCopilot: () => copilotToggle?.(),
        toggleSidebar: () => sidebarToggle?.(),
        sendMessage: (prompt: string, mode: AgentMode) => {
            if (copilot?.sendMessage) {
                const page = (shell.activeTab ?? "overview") as CopilotPage;
                copilot.sendMessage(prompt, page, undefined, undefined, mode);
            }
        },
        closePalette: close,
    }), [router, shell, copilot, close, copilotToggle, sidebarToggle]);

    const groups = useMemo(() => getGroupedCommands(ctx), [ctx]);

    const handleSelect = (cmd: CommandDefinition) => {
        cmd.execute(helpers, ctx);
    };

    if (!isOpen || !hydrated) return null;

    const content = (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            <Command className={styles.palette} label="Command palette">
                <Command.Input
                    className={styles.input}
                    placeholder="Type a command\u2026"
                    autoFocus
                />
                <Command.List className={styles.list}>
                    <Command.Empty className={styles.empty}>No results found</Command.Empty>

                    {(["navigation", "agent", "mode"] as const).map((section) => {
                        const cmds = groups[section];
                        if (cmds.length === 0) return null;
                        return (
                            <Command.Group key={section} heading={SECTION_LABELS[section]} className={styles.group}>
                                {cmds.map((cmd) => (
                                    <Command.Item
                                        key={cmd.id}
                                        className={styles.item}
                                        value={[cmd.label, ...(cmd.keywords ?? [])].join(" ")}
                                        onSelect={() => handleSelect(cmd)}
                                    >
                                        <span className={`material-icons-round ${styles.itemIcon}`}>{cmd.icon}</span>
                                        <span className={styles.itemLabel}>{cmd.label}</span>
                                        {cmd.shortcut && (
                                            <kbd className={styles.kbd}>{cmd.shortcut}</kbd>
                                        )}
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        );
                    })}
                </Command.List>
            </Command>
        </div>
    );

    return createPortal(content, document.body);
}
