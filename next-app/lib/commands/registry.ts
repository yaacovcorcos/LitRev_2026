/**
 * Command Palette Registry
 * Static command definitions with context-aware filtering.
 * Pure module — no React dependencies.
 */

import type { ViewTab, FocusMode } from "@/contexts/ProjectShellContext";
import type { AgentMode } from "@/types/agent";

// ── Types ────────────────────────────────────────────────────────────────────

export type CommandContext = {
    isInProject: boolean;
    projectId: string | null;
    activeTab: ViewTab | null;
    focusMode: FocusMode;
    isCopilotCollapsed: boolean;
};

export type CommandHelpers = {
    navigate: (path: string) => void;
    setActiveTab: (tab: ViewTab) => void;
    returnToConversation: () => void;
    toggleCopilot: () => void;
    toggleSidebar: () => void;
    sendMessage: (prompt: string, mode: AgentMode) => void;
    closePalette: () => void;
};

export type CommandSection = "navigation" | "agent" | "mode";

export type CommandDefinition = {
    id: string;
    label: string;
    icon: string;
    section: CommandSection;
    shortcut?: string;
    keywords?: string[];
    when: (ctx: CommandContext) => boolean;
    execute: (helpers: CommandHelpers, ctx: CommandContext) => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const always = () => true;
const inProject = (ctx: CommandContext) => ctx.isInProject;
const inProjectWithAi = (ctx: CommandContext) => ctx.isInProject;
const hasVisibleProjectSideCopilot = (ctx: CommandContext) =>
    ctx.isInProject &&
    ctx.focusMode === "view" &&
    ctx.activeTab !== null &&
    ctx.activeTab !== "overview";

// ── Commands ─────────────────────────────────────────────────────────────────

export const COMMANDS: CommandDefinition[] = [
    // ── Navigation (always) ──
    {
        id: "nav-projects",
        label: "Go to Projects",
        icon: "folder_open",
        section: "navigation",
        keywords: ["home", "dashboard"],
        when: always,
        execute: (h) => { h.closePalette(); h.navigate("/"); },
    },
    {
        id: "nav-ai",
        label: "Go to AI Assistant",
        icon: "smart_toy",
        section: "navigation",
        keywords: ["chat", "assistant"],
        when: always,
        execute: (h) => { h.closePalette(); h.navigate("/ai"); },
    },

    // ── Navigation (project) ──
    {
        id: "nav-overview",
        label: "Go to Overview",
        icon: "dashboard",
        section: "navigation",
        keywords: ["summary", "project"],
        when: inProject,
        execute: (h) => { h.closePalette(); h.setActiveTab("overview"); },
    },
    {
        id: "nav-protocol",
        label: "Go to Protocol",
        icon: "assignment",
        section: "navigation",
        keywords: ["pico", "criteria", "inclusion", "exclusion"],
        when: inProject,
        execute: (h) => { h.closePalette(); h.setActiveTab("protocol"); },
    },
    {
        id: "nav-ledger",
        label: "Go to Ledger",
        icon: "table_chart",
        section: "navigation",
        keywords: ["studies", "table", "data"],
        when: inProject,
        execute: (h) => { h.closePalette(); h.setActiveTab("ledger"); },
    },
    {
        id: "nav-draft",
        label: "Go to Draft",
        icon: "edit_note",
        section: "navigation",
        keywords: ["write", "paper", "manuscript"],
        when: inProject,
        execute: (h) => { h.closePalette(); h.setActiveTab("draft"); },
    },
    {
        id: "nav-memory",
        label: "Go to Memory",
        icon: "psychology",
        section: "navigation",
        keywords: ["knowledge", "memory", "preferences", "prisma"],
        when: inProject,
        execute: (h) => { h.closePalette(); h.setActiveTab("memory"); },
    },
    {
        id: "nav-notes",
        label: "Go to Notes",
        icon: "sticky_note_2",
        section: "navigation",
        keywords: ["memo", "scratchpad"],
        when: inProject,
        execute: (h) => { h.closePalette(); h.setActiveTab("notes"); },
    },
    {
        id: "mode-conversation",
        label: "Switch to Conversation",
        icon: "chat",
        section: "mode",
        shortcut: "\u2318.",
        keywords: ["chat", "talk", "conversation"],
        when: (ctx) => ctx.isInProject && ctx.focusMode === "view",
        execute: (h) => { h.closePalette(); h.returnToConversation(); },
    },
    {
        id: "mode-workspace",
        label: "Switch to Workspace",
        icon: "workspaces",
        section: "mode",
        shortcut: "\u2318.",
        keywords: ["work", "tabs", "view", "workspace"],
        when: (ctx) => ctx.isInProject && ctx.focusMode === "conversation",
        execute: (h) => { h.closePalette(); h.setActiveTab("overview"); },
    },

    // ── Agent actions ──
    {
        id: "agent-search",
        label: "Search PubMed",
        icon: "search",
        section: "agent",
        keywords: ["pubmed", "find", "literature"],
        when: inProjectWithAi,
        execute: (h) => {
            h.closePalette();
            h.returnToConversation();
            h.sendMessage("Search PubMed for relevant studies", "search");
        },
    },
    {
        id: "agent-screen",
        label: "Screen Studies",
        icon: "filter_list",
        section: "agent",
        keywords: ["screening", "evaluate", "criteria"],
        when: inProjectWithAi,
        execute: (h) => {
            h.closePalette();
            h.returnToConversation();
            h.sendMessage("Screen the unscreened studies in my ledger", "screening");
        },
    },
    {
        id: "agent-draft",
        label: "Start Drafting",
        icon: "edit_note",
        section: "agent",
        keywords: ["write", "compose", "draft"],
        when: inProjectWithAi,
        execute: (h) => {
            h.closePalette();
            h.returnToConversation();
            h.sendMessage("Help me draft the next section of my review", "drafting");
        },
    },

    // ── Mode ──
    {
        id: "mode-toggle-copilot",
        label: "Toggle Copilot Panel",
        icon: "side_navigation",
        section: "mode",
        shortcut: "\u2318/",
        keywords: ["panel", "sidebar", "copilot"],
        when: hasVisibleProjectSideCopilot,
        execute: (h) => { h.closePalette(); h.toggleCopilot(); },
    },
    {
        id: "mode-toggle-sidebar",
        label: "Toggle Sidebar",
        icon: "menu",
        section: "mode",
        shortcut: "\u2318B",
        keywords: ["navigation", "collapse", "expand"],
        when: always,
        execute: (h) => { h.closePalette(); h.toggleSidebar(); },
    },
];

// ── Utilities ────────────────────────────────────────────────────────────────

/** Filter commands based on current context */
export function getAvailableCommands(ctx: CommandContext): CommandDefinition[] {
    return COMMANDS.filter((cmd) => cmd.when(ctx));
}

/** Group available commands by section */
export function getGroupedCommands(ctx: CommandContext): Record<CommandSection, CommandDefinition[]> {
    const available = getAvailableCommands(ctx);
    return {
        navigation: available.filter((c) => c.section === "navigation"),
        agent: available.filter((c) => c.section === "agent"),
        mode: available.filter((c) => c.section === "mode"),
    };
}
