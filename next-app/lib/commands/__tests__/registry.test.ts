import { describe, it, expect } from "vitest";
import {
    COMMANDS,
    getAvailableCommands,
    getGroupedCommands,
    type CommandContext,
} from "../registry";

// ── Test context factories ──────────────────────────────────────────────────

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
    return {
        isInProject: false,
        projectId: null,
        activeTab: null,
        focusMode: "conversation",
        isCopilotCollapsed: false,
        ...overrides,
    };
}

const globalCtx = makeCtx();
const projectCtx = makeCtx({ isInProject: true, projectId: "p1", activeTab: "overview" });

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Command Registry", () => {
    it("all commands have unique IDs", () => {
        const ids = COMMANDS.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("all commands have required fields", () => {
        for (const cmd of COMMANDS) {
            expect(cmd.id).toBeTruthy();
            expect(cmd.label).toBeTruthy();
            expect(cmd.icon).toBeTruthy();
            expect(["navigation", "agent", "mode"]).toContain(cmd.section);
            expect(typeof cmd.when).toBe("function");
            expect(typeof cmd.execute).toBe("function");
        }
    });

    describe("context filtering", () => {
        it("global context shows navigation-only commands", () => {
            const cmds = getAvailableCommands(globalCtx);
            // Should include nav-projects, nav-ai, mode-toggle-sidebar
            expect(cmds.find((c) => c.id === "nav-projects")).toBeTruthy();
            expect(cmds.find((c) => c.id === "nav-ai")).toBeTruthy();
            expect(cmds.find((c) => c.id === "mode-toggle-sidebar")).toBeTruthy();

            // Should NOT include project-only commands
            expect(cmds.find((c) => c.id === "nav-overview")).toBeUndefined();
            expect(cmds.find((c) => c.id === "agent-search")).toBeUndefined();
        });

        it("project context shows all command types", () => {
            const cmds = getAvailableCommands(projectCtx);
            expect(cmds.find((c) => c.id === "nav-overview")).toBeTruthy();
            expect(cmds.find((c) => c.id === "agent-search")).toBeTruthy();
            expect(cmds.find((c) => c.id === "mode-toggle-copilot")).toBeTruthy();
            expect(cmds.find((c) => c.id === "nav-conversation")).toBeTruthy();
        });
    });

    describe("getGroupedCommands", () => {
        it("returns commands grouped by section", () => {
            const groups = getGroupedCommands(projectCtx);
            expect(groups.navigation.length).toBeGreaterThan(0);
            expect(groups.agent.length).toBeGreaterThan(0);
            expect(groups.mode.length).toBeGreaterThan(0);

            // Each command in its section
            for (const cmd of groups.navigation) {
                expect(cmd.section).toBe("navigation");
            }
            for (const cmd of groups.agent) {
                expect(cmd.section).toBe("agent");
            }
            for (const cmd of groups.mode) {
                expect(cmd.section).toBe("mode");
            }
        });

        it("global context has empty agent group", () => {
            const groups = getGroupedCommands(globalCtx);
            expect(groups.agent).toHaveLength(0);
        });
    });
});
