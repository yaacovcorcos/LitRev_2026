import { describe, it, expect } from "vitest";
import { getToolDefinitions, AVAILABLE_TOOLS } from "@/lib/server/ai/tools/base";
import { AGENT_MODE_CONFIG } from "@/lib/agent/router";
import type { AgentMode } from "@/types/agent";

const ALL_TOOL_NAMES = AVAILABLE_TOOLS.map((t) => t.definition.name).sort();

describe("getToolDefinitions", () => {
    it("returns all tools when no agentMode is provided", () => {
        const defs = getToolDefinitions();
        expect(defs.map((d) => d.name).sort()).toEqual(ALL_TOOL_NAMES);
    });

    it("returns only global-safe tools in global scope", () => {
        const defs = getToolDefinitions(undefined, "global");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "create_project", "delegate_protocol", "delegate_screening", "delegate_search", "forget_memory", "inspect_memory", "list_projects", "open_project", "search_pubmed", "search_semantic_scholar", "store_memory"]);
    });

    it("returns all tools for general mode (empty allowedTools)", () => {
        const defs = getToolDefinitions("general");
        expect(defs.map((d) => d.name).sort()).toEqual(ALL_TOOL_NAMES);
    });

    it("applies scope filter before mode filter", () => {
        const defs = getToolDefinitions("search", "global");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "forget_memory", "inspect_memory", "search_pubmed", "search_semantic_scholar", "store_memory"]);
    });

    it("filters tools for protocol mode", () => {
        const defs = getToolDefinitions("protocol");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "forget_memory", "inspect_memory", "search_pubmed", "search_semantic_scholar", "store_memory", "update_criteria", "update_protocol", "update_study"]);
    });

    it("filters tools for search mode", () => {
        const defs = getToolDefinitions("search");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["add_to_ledger", "ask_user", "forget_memory", "inspect_memory", "read_protocol", "recommend_studies", "search_pubmed", "search_semantic_scholar", "store_memory", "update_study"]);
    });

    it("filters tools for scoping mode", () => {
        const defs = getToolDefinitions("scoping");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "forget_memory", "inspect_memory", "list_projects", "open_project", "recommend_studies", "search_pubmed", "search_semantic_scholar", "store_memory"]);
    });

    it("filters tools for screening mode", () => {
        const defs = getToolDefinitions("screening");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "bulk_screening", "delete_study", "exclude_study", "extract_pdf", "fetch_open_pdf", "forget_memory", "inspect_memory", "read_study_content", "store_memory", "update_study"]);
    });

    it("filters tools for drafting mode", () => {
        const defs = getToolDefinitions("drafting");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "forget_memory", "inspect_memory", "read_ledger", "read_protocol", "read_study_content", "store_memory", "update_note", "update_study"]);
    });

    it("filters tools for qa mode", () => {
        const defs = getToolDefinitions("qa");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "fetch_open_pdf", "forget_memory", "inspect_memory", "read_ledger", "read_protocol", "read_study_content", "search_pubmed", "search_semantic_scholar", "store_memory", "update_study"]);
    });

    it("every allowedTools entry in AGENT_MODE_CONFIG exists in AVAILABLE_TOOLS", () => {
        for (const [mode, config] of Object.entries(AGENT_MODE_CONFIG)) {
            for (const toolName of config.allowedTools) {
                expect(
                    ALL_TOOL_NAMES,
                    `${mode}.allowedTools contains "${toolName}" which is not a registered tool`,
                ).toContain(toolName);
            }
        }
    });

    it("filtered results are a subset of all tools", () => {
        const modes: AgentMode[] = ["protocol", "scoping", "search", "screening", "drafting", "qa", "general"];
        for (const mode of modes) {
            const filtered = getToolDefinitions(mode).map((d) => d.name);
            for (const name of filtered) {
                expect(ALL_TOOL_NAMES, `${mode}: ${name} not in AVAILABLE_TOOLS`).toContain(name);
            }
        }
    });

    it("scopes general mode tools when ENABLE_DELEGATION is on", async () => {
        process.env.ENABLE_DELEGATION = "true";
        // Re-import to pick up the flag change (isDelegationEnabled reads process.env at call time)
        const { getToolDefinitions: getTD } = await import("@/lib/server/ai/tools/base");
        const defs = getTD("general");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual([
            "ask_user",
            "create_project",
            "delegate_protocol",
            "delegate_screening",
            "delegate_search",
            "forget_memory",
            "inspect_memory",
            "list_projects",
            "open_project",
            "read_ledger",
            "read_protocol",
            "read_study_content",
            "store_memory",
            "update_note",
            "update_study",
        ]);
        // Cleanup
        delete process.env.ENABLE_DELEGATION;
    });
});
