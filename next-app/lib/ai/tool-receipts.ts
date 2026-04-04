import type { AIStreamChunk } from "@/types/ai";
import { formatSearchCountDetail, formatSearchSummary } from "@/lib/search-contract";

export type ToolReceiptSeed = {
  displayLabel?: string;
  inputPreview?: string;
  sourceBadge?: string;
  queryPreview?: string;
};

export type ToolReceiptPatch = {
  displayLabel?: string;
  outcomeSummary?: string;
  sourceBadge?: string;
  detailItems?: string[];
  returnedCount?: number;
  totalResults?: number;
  resultIdentifiers?: string[];
  summary?: string;
};

const SEARCH_TOOL_LABELS = {
  search_pubmed: "PubMed",
  search_openalex: "OpenAlex",
  search_semantic_scholar: "Semantic Scholar",
} satisfies Record<string, string>;

type SearchToolName = keyof typeof SEARCH_TOOL_LABELS;

function buildPreview(value: unknown, maxLength = 96): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function isSearchToolName(toolName: string | undefined): toolName is SearchToolName {
  return typeof toolName === "string" && toolName in SEARCH_TOOL_LABELS;
}

function formatSearchResultIdentifier(toolName: SearchToolName, value: Record<string, unknown>): string | null {
  const pmid = typeof value.pmid === "string" ? value.pmid.trim() : "";
  const doi = typeof value.doi === "string" ? value.doi.trim() : "";
  const metadata = typeof value.metadata === "object" && value.metadata
    ? value.metadata as Record<string, unknown>
    : null;

  if (toolName === "search_pubmed") {
    if (pmid) return `PMID ${pmid}`;
    if (doi) return `DOI ${doi}`;
    return null;
  }

  if (doi) return `DOI ${doi}`;
  if (pmid) return `PMID ${pmid}`;

  if (toolName === "search_openalex") {
    const openAlexId = typeof metadata?.openAlexId === "string"
      ? metadata.openAlexId
      : typeof value.sourceUrl === "string"
        ? value.sourceUrl
        : "";
    const shortId = openAlexId.split("/").filter(Boolean).at(-1) ?? "";
    return shortId ? `OpenAlex ${shortId}` : null;
  }

  if (toolName === "search_semantic_scholar") {
    const paperId = typeof metadata?.s2PaperId === "string" ? metadata.s2PaperId.trim() : "";
    return paperId ? `S2 ${paperId}` : null;
  }

  return null;
}

function getSearchResultIdentifiers(toolName: SearchToolName, result: Record<string, unknown>): string[] | undefined {
  const items = Array.isArray(result.results) ? result.results : [];
  const identifiers: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const identifier = formatSearchResultIdentifier(toolName, item as Record<string, unknown>);
    if (!identifier || seen.has(identifier)) continue;
    seen.add(identifier);
    identifiers.push(identifier);
    if (identifiers.length >= 2) break;
  }

  return identifiers.length > 0 ? identifiers : undefined;
}

function buildSearchSummary(toolName: SearchToolName, returnedCount?: number, totalResults?: number): string | undefined {
  const label = SEARCH_TOOL_LABELS[toolName];
  return formatSearchSummary(label, { returnedCount, totalResults });
}

function buildSearchSeed(chunk: AIStreamChunk): ToolReceiptSeed | undefined {
  if (!isSearchToolName(chunk.toolCall?.name)) return undefined;
  const sourceBadge = SEARCH_TOOL_LABELS[chunk.toolCall.name];
  const queryPreview = buildPreview(chunk.toolCall.arguments?.query);
  return {
    displayLabel: `Searching ${sourceBadge}`,
    inputPreview: queryPreview,
    sourceBadge,
    queryPreview,
  };
}

function buildSearchPatch(chunk: AIStreamChunk): ToolReceiptPatch | undefined {
  if (!isSearchToolName(chunk.toolName)) return undefined;
  const result = chunk.toolResult?.result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  const returnedCount = typeof record.returnedCount === "number" ? record.returnedCount : undefined;
  const totalResults = typeof record.totalResults === "number" ? record.totalResults : undefined;
  const resultIdentifiers = getSearchResultIdentifiers(chunk.toolName, record);
  const detailItems = [
    formatSearchCountDetail({ returnedCount, totalResults }),
    resultIdentifiers && resultIdentifiers.length > 0 ? resultIdentifiers.join(" · ") : null,
  ].filter((value): value is string => Boolean(value));

  const summary = chunk.toolResult?.error ?? buildSearchSummary(chunk.toolName, returnedCount, totalResults);

  return {
    displayLabel: `Searched ${SEARCH_TOOL_LABELS[chunk.toolName]}`,
    outcomeSummary: summary,
    sourceBadge: SEARCH_TOOL_LABELS[chunk.toolName],
    detailItems: detailItems.length > 0 ? detailItems : undefined,
    returnedCount,
    totalResults,
    resultIdentifiers,
    summary,
  };
}

function buildReadProtocolSeed(): ToolReceiptSeed {
  return {
    displayLabel: "Reading protocol",
    inputPreview: "Current project protocol",
    sourceBadge: "Protocol",
  };
}

function buildReadProtocolPatch(chunk: AIStreamChunk): ToolReceiptPatch | undefined {
  const result = chunk.toolResult?.result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  const hasProtocol = record.hasProtocol === true;
  return {
    displayLabel: "Read protocol",
    outcomeSummary: hasProtocol ? "Loaded the current protocol context." : "No protocol is defined yet.",
    sourceBadge: "Protocol",
    summary: hasProtocol ? "Loaded the current protocol context." : "No protocol is defined yet.",
  };
}

function buildReadLedgerSeed(chunk: AIStreamChunk): ToolReceiptSeed {
  const includeStudies = chunk.toolCall?.arguments?.includeStudies !== false;
  return {
    displayLabel: "Reading ledger",
    inputPreview: includeStudies ? "Current evidence ledger" : "Ledger counts only",
    sourceBadge: "Ledger",
  };
}

function buildReadLedgerPatch(chunk: AIStreamChunk): ToolReceiptPatch | undefined {
  const result = chunk.toolResult?.result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  const counts = typeof record.counts === "object" && record.counts ? record.counts as Record<string, unknown> : null;
  const studies = Array.isArray(record.studies) ? record.studies : [];
  const total = typeof counts?.total === "number" ? counts.total : undefined;
  const included = typeof counts?.included === "number" ? counts.included : undefined;
  const excluded = typeof counts?.excluded === "number" ? counts.excluded : undefined;
  const maybe = typeof counts?.maybe === "number" ? counts.maybe : undefined;
  const unscreened = typeof counts?.unscreened === "number" ? counts.unscreened : undefined;
  const detailItems = [
    typeof total === "number"
      ? `${total} total · ${included ?? 0} included · ${excluded ?? 0} excluded · ${maybe ?? 0} maybe · ${unscreened ?? 0} unscreened`
      : null,
    studies.length > 0 ? `${studies.length} study ${studies.length === 1 ? "row" : "rows"} loaded` : "Counts only",
    record.truncated === true ? "Study list truncated" : null,
  ].filter((value): value is string => Boolean(value));

  const outcomeSummary = typeof total === "number"
    ? `Loaded ledger state for ${total} studies.`
    : "Loaded the current ledger state.";

  return {
    displayLabel: "Read ledger",
    outcomeSummary,
    sourceBadge: "Ledger",
    detailItems: detailItems.length > 0 ? detailItems : undefined,
    summary: outcomeSummary,
  };
}

function buildReadStudyContentSeed(chunk: AIStreamChunk): ToolReceiptSeed {
  const requestedSection = typeof chunk.toolCall?.arguments?.section === "string"
    ? chunk.toolCall.arguments.section
    : "full";
  const sectionLabel = requestedSection === "full" ? "Full text" : `${requestedSection} section`;
  return {
    displayLabel: "Reading study content",
    inputPreview: sectionLabel,
    sourceBadge: "Study PDF",
  };
}

function buildReadStudyContentPatch(chunk: AIStreamChunk): ToolReceiptPatch | undefined {
  const result = chunk.toolResult?.result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  const section = typeof record.section === "string" ? record.section : "full";
  const title = typeof record.title === "string" ? record.title : "";
  const truncated = record.truncated === true;
  const sectionLabel = section === "full" ? "full text" : `${section} section`;
  const detailItems = [
    title ? title : null,
    truncated ? "Excerpt truncated for context" : null,
  ].filter((value): value is string => Boolean(value));
  const outcomeSummary = `Loaded ${sectionLabel}${title ? ` from ${title}` : ""}.`;
  return {
    displayLabel: "Read study content",
    outcomeSummary,
    sourceBadge: "Study PDF",
    detailItems: detailItems.length > 0 ? detailItems : undefined,
    summary: outcomeSummary,
  };
}

function buildInspectMemorySeed(chunk: AIStreamChunk): ToolReceiptSeed {
  const memoryType = typeof chunk.toolCall?.arguments?.memoryType === "string"
    ? chunk.toolCall.arguments.memoryType
    : "all";
  const key = buildPreview(chunk.toolCall?.arguments?.key, 48);
  return {
    displayLabel: "Checking memory",
    inputPreview: key ? `${memoryType} memory · key: ${key}` : `${memoryType} memory`,
    sourceBadge: "Memory",
  };
}

function buildInspectMemoryPatch(chunk: AIStreamChunk): ToolReceiptPatch | undefined {
  const result = chunk.toolResult?.result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const memories = Array.isArray(record.memories) ? record.memories : [];
  const detailItems = memories
    .slice(0, 3)
    .map((memory) => (memory && typeof memory === "object" && typeof (memory as Record<string, unknown>).key === "string")
      ? String((memory as Record<string, unknown>).key)
      : null)
    .filter((value): value is string => Boolean(value));

  return {
    displayLabel: "Checked memory",
    outcomeSummary: summary || undefined,
    sourceBadge: "Memory",
    detailItems: detailItems.length > 0 ? detailItems : undefined,
    summary: summary || undefined,
  };
}

function buildDelegateSeed(chunk: AIStreamChunk, label: string, sourceBadge: string): ToolReceiptSeed {
  return {
    displayLabel: `Delegating ${label.toLowerCase()}`,
    inputPreview: buildPreview(chunk.toolCall?.arguments?.task, 120),
    sourceBadge,
  };
}

function buildDelegatePatch(chunk: AIStreamChunk, label: string, sourceBadge: string): ToolReceiptPatch | undefined {
  const result = chunk.toolResult?.result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const toolCallCount = typeof record.toolCallCount === "number" ? record.toolCallCount : undefined;
  const stopReason = typeof record.stopReason === "string" ? record.stopReason.trim() : "";
  const detailItems = [
    typeof toolCallCount === "number" ? `${toolCallCount} delegated tool ${toolCallCount === 1 ? "call" : "calls"}` : null,
    stopReason ? `Stop reason: ${stopReason}` : null,
    record.searchPlanUsed === true ? "Structured search plan used" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    displayLabel: `Delegated ${label.toLowerCase()}`,
    outcomeSummary: summary || undefined,
    sourceBadge,
    detailItems: detailItems.length > 0 ? detailItems : undefined,
    summary: summary || undefined,
  };
}

export function buildToolReceiptSeed(chunk: AIStreamChunk): ToolReceiptSeed | undefined {
  switch (chunk.toolCall?.name) {
    case "search_pubmed":
    case "search_openalex":
    case "search_semantic_scholar":
      return buildSearchSeed(chunk);
    case "read_protocol":
      return buildReadProtocolSeed();
    case "read_ledger":
      return buildReadLedgerSeed(chunk);
    case "read_study_content":
      return buildReadStudyContentSeed(chunk);
    case "inspect_memory":
      return buildInspectMemorySeed(chunk);
    case "delegate_search":
      return buildDelegateSeed(chunk, "Search", "Search agent");
    case "delegate_screening":
      return buildDelegateSeed(chunk, "Screening", "Screening agent");
    case "delegate_protocol":
      return buildDelegateSeed(chunk, "Protocol", "Protocol agent");
    default:
      return undefined;
  }
}

export function buildToolReceiptPatch(chunk: AIStreamChunk): ToolReceiptPatch | undefined {
  switch (chunk.toolName) {
    case "search_pubmed":
    case "search_openalex":
    case "search_semantic_scholar":
      return buildSearchPatch(chunk);
    case "read_protocol":
      return buildReadProtocolPatch(chunk);
    case "read_ledger":
      return buildReadLedgerPatch(chunk);
    case "read_study_content":
      return buildReadStudyContentPatch(chunk);
    case "inspect_memory":
      return buildInspectMemoryPatch(chunk);
    case "delegate_search":
      return buildDelegatePatch(chunk, "Search", "Search agent");
    case "delegate_screening":
      return buildDelegatePatch(chunk, "Screening", "Screening agent");
    case "delegate_protocol":
      return buildDelegatePatch(chunk, "Protocol", "Protocol agent");
    default:
      return undefined;
  }
}
