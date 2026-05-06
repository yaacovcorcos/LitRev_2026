import { afterEach, describe, expect, it } from "vitest";
import {
    AGENT_MODE_CONFIG,
    DELEGATION_TOOL_NAMES,
    GENERAL_GLOBAL_TOOLS,
    GENERAL_PROJECT_CORE_TOOLS,
    getContextualAllowedTools,
} from "@/lib/agent/router";
import { AVAILABLE_TOOLS, getToolDefinitions } from "@/lib/server/ai/tools/base";
import { getContextualToolDefinitions } from "@/lib/server/ai/tool-helpers";

const ALL_TOOL_NAMES = AVAILABLE_TOOLS.map((t) => t.definition.name).sort();
const DELEGATION_TOOL_SET = new Set<string>(DELEGATION_TOOL_NAMES);
const FEATURE_ENABLED_TOOL_NAMES = AVAILABLE_TOOLS
    .map((t) => t.definition.name)
    .filter((name) => !DELEGATION_TOOL_SET.has(name))
    .sort();

function withDelegationFlag(value: boolean): void {
    process.env.ENABLE_DELEGATION = value ? "true" : "false";
    delete process.env.NEXT_PUBLIC_ENABLE_DELEGATION;
}

afterEach(() => {
    delete process.env.ENABLE_DELEGATION;
    delete process.env.NEXT_PUBLIC_ENABLE_DELEGATION;
});

describe("getToolDefinitions", () => {
    it("returns all feature-enabled tools when no agentMode is provided", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions();
        expect(defs.map((d) => d.name).sort()).toEqual(FEATURE_ENABLED_TOOL_NAMES);
    });

    it("returns only global-safe feature-enabled tools in global scope", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions(undefined, "global");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual([
            "ask_user",
            "create_project",
            "forget_memory",
            "inspect_memory",
            "list_projects",
            "open_project",
            "search_openalex",
            "search_pubmed",
            "search_semantic_scholar",
            "store_memory",
        ]);
    });

    it("uses the narrowed project general surface when delegation is off", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions("general");
        expect(defs.map((d) => d.name).sort()).toEqual([...GENERAL_PROJECT_CORE_TOOLS].sort());
    });

    it("uses the bounded project general surface when delegation is on", () => {
        withDelegationFlag(true);
        const defs = getToolDefinitions("general");
        expect(defs.map((d) => d.name).sort()).toEqual([
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
        ]);
    });

    it("uses the same global general surface regardless of delegation flag", () => {
        withDelegationFlag(true);
        const enabledNames = getToolDefinitions("general", "global").map((d) => d.name).sort();

        withDelegationFlag(false);
        const disabledNames = getToolDefinitions("general", "global").map((d) => d.name).sort();

        expect(enabledNames).toEqual([...GENERAL_GLOBAL_TOOLS].sort());
        expect(disabledNames).toEqual([...GENERAL_GLOBAL_TOOLS].sort());
    });

    it("applies scope filter before mode filter", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions("search", "global");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual([
            "ask_user",
            "forget_memory",
            "inspect_memory",
            "search_openalex",
            "search_pubmed",
            "search_semantic_scholar",
            "store_memory",
        ]);
    });

    it("filters tools for protocol mode", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions("protocol");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "forget_memory", "inspect_memory", "search_openalex", "search_pubmed", "search_semantic_scholar", "store_memory", "update_criteria", "update_protocol", "update_study"]);
    });

    it("filters tools for search mode", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions("search");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["add_to_ledger", "ask_user", "forget_memory", "inspect_memory", "read_protocol", "recommend_studies", "search_openalex", "search_pubmed", "search_semantic_scholar", "store_memory", "update_study"]);
    });

    it("filters tools for scoping mode", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions("scoping");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "forget_memory", "inspect_memory", "list_projects", "open_project", "recommend_studies", "search_openalex", "search_pubmed", "search_semantic_scholar", "store_memory"]);
    });

    it("filters tools for screening mode", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions("screening");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "bulk_screening", "delete_study", "exclude_study", "extract_pdf", "forget_memory", "inspect_memory", "preview_study_pdf_update", "read_study_content", "store_memory", "update_study", "update_study_direct"]);
    });

    it("filters tools for drafting mode", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions("drafting");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "forget_memory", "inspect_memory", "read_ledger", "read_protocol", "read_study_content", "store_memory", "update_note", "update_study"]);
    });

    it("filters tools for qa mode", () => {
        withDelegationFlag(false);
        const defs = getToolDefinitions("qa");
        const names = defs.map((d) => d.name).sort();
        expect(names).toEqual(["ask_user", "forget_memory", "inspect_memory", "read_ledger", "read_protocol", "read_study_content", "search_openalex", "search_pubmed", "search_semantic_scholar", "store_memory", "update_study"]);
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
        const modes = ["protocol", "scoping", "search", "screening", "drafting", "qa", "general"] as const;
        withDelegationFlag(false);
        for (const mode of modes) {
            const filtered = getToolDefinitions(mode).map((d) => d.name);
            for (const name of filtered) {
                expect(ALL_TOOL_NAMES, `${mode}: ${name} not in AVAILABLE_TOOLS`).toContain(name);
            }
        }
    });
});

describe("getContextualAllowedTools", () => {
    it("returns the four-case general matrix explicitly", () => {
        withDelegationFlag(false);
        const projectWithoutDelegation = getContextualAllowedTools("general", "project").sort();
        const globalWithoutDelegation = getContextualAllowedTools("general", "global").sort();

        withDelegationFlag(true);
        const projectWithDelegation = getContextualAllowedTools("general", "project").sort();
        const globalWithDelegation = getContextualAllowedTools("general", "global").sort();

        expect(projectWithoutDelegation).toEqual([...GENERAL_PROJECT_CORE_TOOLS].sort());
        expect(projectWithDelegation).toEqual([
            ...GENERAL_PROJECT_CORE_TOOLS,
            ...DELEGATION_TOOL_NAMES,
        ].sort());
        expect(globalWithoutDelegation).toEqual([...GENERAL_GLOBAL_TOOLS].sort());
        expect(globalWithDelegation).toEqual([...GENERAL_GLOBAL_TOOLS].sort());
    });
});

describe("getContextualToolDefinitions", () => {
    it("uses PubMed-only search tools by default in contextual runtime filtering", () => {
        const defs = getContextualToolDefinitions({
            agentMode: "search",
            scope: "project",
            studyLedger: null,
            userMessage: "find RCTs about metformin",
        });
        const names = defs.map((d) => d.name);

        expect(names).toContain("search_pubmed");
        expect(names).not.toContain("recommend_studies");
        expect(names).not.toContain("search_openalex");
        expect(names).not.toContain("search_semantic_scholar");
    });

    it("exposes OpenAlex only when the request names OpenAlex", () => {
        const defs = getContextualToolDefinitions({
            agentMode: "search",
            scope: "project",
            studyLedger: null,
            userMessage: "search OpenAlex for AI triage studies",
        });
        const names = defs.map((d) => d.name);

        expect(names).toContain("search_pubmed");
        expect(names).toContain("search_openalex");
        expect(names).not.toContain("recommend_studies");
        expect(names).not.toContain("search_semantic_scholar");
    });

    it("exposes Semantic Scholar only when the request names Semantic Scholar", () => {
        const defs = getContextualToolDefinitions({
            agentMode: "search",
            scope: "project",
            studyLedger: null,
            userMessage: "use Semantic Scholar for citation-network discovery",
        });
        const names = defs.map((d) => d.name);

        expect(names).toContain("search_pubmed");
        expect(names).toContain("recommend_studies");
        expect(names).not.toContain("search_openalex");
        expect(names).toContain("search_semantic_scholar");
    });

    it("hides study-context-only tools when no studyId is available", () => {
        const defs = getContextualToolDefinitions({
            agentMode: "screening",
            scope: "project",
            studyLedger: null,
            studyId: null,
        });
        const names = defs.map((d) => d.name);
        expect(names).not.toContain("update_study_direct");
        expect(names).not.toContain("preview_study_pdf_update");
    });

    it("keeps study-context-only tools when a studyId is available", () => {
        const defs = getContextualToolDefinitions({
            agentMode: "screening",
            scope: "project",
            studyLedger: null,
            studyId: "study-1",
        });
        const names = defs.map((d) => d.name);
        expect(names).toContain("update_study_direct");
        expect(names).toContain("preview_study_pdf_update");
    });
});
