import type { ToolDefinition } from "@/types/ai";

export type SearchSourcePolicy = {
    allowPubMed: true;
    allowOpenAlex: boolean;
    allowSemanticScholar: boolean;
};

export type SearchSourcePolicyInput = {
    text?: string | null;
    explicitToolNames?: readonly string[] | null;
};

export const SEARCH_SOURCE_TOOL_NAMES = [
    "search_pubmed",
    "search_openalex",
    "search_semantic_scholar",
] as const;

export type SearchSourceToolName = typeof SEARCH_SOURCE_TOOL_NAMES[number];

const SEARCH_SOURCE_TOOL_SET = new Set<string>(SEARCH_SOURCE_TOOL_NAMES);
const POLICY_GATED_SEARCH_TOOL_SET = new Set<string>([
    "search_openalex",
    "search_semantic_scholar",
    "recommend_studies",
]);

const OPENALEX_EXPLICIT_RE = /\b(?:open\s*alex|openalex|search_openalex)\b/i;
const SEMANTIC_SCHOLAR_EXPLICIT_RE =
    /\b(?:semantic\s*scholar|semanticscholar|search_semantic_scholar|s2\s+(?:api|source|search|recommendations?))\b/i;

export const DEFAULT_SEARCH_SOURCE_POLICY: SearchSourcePolicy = {
    allowPubMed: true,
    allowOpenAlex: false,
    allowSemanticScholar: false,
};

export function isSearchSourceToolName(toolName: string): toolName is SearchSourceToolName {
    return SEARCH_SOURCE_TOOL_SET.has(toolName);
}

export function isPolicyGatedSearchToolName(toolName: string): boolean {
    return POLICY_GATED_SEARCH_TOOL_SET.has(toolName);
}

export function getSearchSourceLabel(toolName: string): string {
    switch (toolName) {
        case "search_pubmed":
            return "PubMed";
        case "search_openalex":
            return "OpenAlex";
        case "search_semantic_scholar":
            return "Semantic Scholar";
        case "recommend_studies":
            return "Semantic Scholar recommendations";
        default:
            return toolName;
    }
}

export function deriveSearchSourcePolicy(input: string | SearchSourcePolicyInput | null | undefined): SearchSourcePolicy {
    const normalizedInput = typeof input === "string"
        ? { text: input }
        : input ?? {};
    const text = normalizedInput.text ?? "";
    const explicitToolNames = new Set(normalizedInput.explicitToolNames ?? []);

    return {
        allowPubMed: true,
        allowOpenAlex:
            OPENALEX_EXPLICIT_RE.test(text)
            || explicitToolNames.has("search_openalex"),
        allowSemanticScholar:
            SEMANTIC_SCHOLAR_EXPLICIT_RE.test(text)
            || explicitToolNames.has("search_semantic_scholar")
            || explicitToolNames.has("recommend_studies"),
    };
}

export function isSearchToolAllowedBySourcePolicy(
    toolName: string,
    policy: SearchSourcePolicy,
): boolean {
    switch (toolName) {
        case "search_pubmed":
            return policy.allowPubMed;
        case "search_openalex":
            return policy.allowOpenAlex;
        case "search_semantic_scholar":
        case "recommend_studies":
            return policy.allowSemanticScholar;
        default:
            return true;
    }
}

export function filterSearchToolsByPolicy<T extends { name: string }>(
    tools: readonly T[],
    policy: SearchSourcePolicy,
): T[] {
    return tools.filter((tool) => isSearchToolAllowedBySourcePolicy(tool.name, policy));
}

export function filterToolDefinitionsBySearchSourcePolicy(
    toolDefinitions: readonly ToolDefinition[],
    policy: SearchSourcePolicy,
): ToolDefinition[] {
    return filterSearchToolsByPolicy(toolDefinitions, policy);
}
