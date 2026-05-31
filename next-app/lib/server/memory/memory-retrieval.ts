/**
 * Memory Retrieval System
 * Deterministic-first retrieval with keyword scoring fallback (planC Phase 5.4)
 */

import { prisma } from "@/lib/server/prisma";
import { Prisma } from "@prisma/client";
import { getUserMemories } from "./user-memory";
import { getProjectMemories, searchProjectMemories } from "./project-memory";
import { getStudyMemories, getStudyMemoriesForProject, searchStudyMemories } from "./study-memory";
import { searchSemanticMemories } from "./semantic-memory";
import { runMemoryMaintenanceLoop } from "./maintenance";
import { recordRunEvent } from "@/lib/server/agent/run-event-recorder";
import { logServerWarn } from "@/lib/server/logging";
import type { AgentMode } from "@/types/agent";

export interface MemoryContext {
    userId: string;
    projectId?: string;
    studyId?: string;
    conversationId?: string;
    query?: string;
    agentMode?: AgentMode;
    citedStudyIds?: string[];
    runId?: string;
}

export interface RetrievedMemory {
    id: string;
    type: "user" | "project" | "study";
    memoryType: string;
    content: string;
    relevance: number;
    updatedAt?: string;
    source?: string;
    authority?: string;
    polarity?: string;
    tags?: string[];
    lexicalScore?: number;
    semanticScore?: number;
    deterministic?: boolean;
    retrievalId?: string;
    retrievalItemId?: string;
}

const HYBRID_VECTOR_WEIGHT = 0.7;
const HYBRID_TEXT_WEIGHT = 0.3;
const MMR_LAMBDA = 0.7;
const TEMPORAL_DECAY_HALF_LIFE_DAYS = 30;
const ADVANCED_RETRIEVAL_CANDIDATE_MULTIPLIER = 3;

function readBooleanFlag(value: string | undefined): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isAdvancedRetrievalRerankEnabled(): boolean {
    return readBooleanFlag(process.env.ENABLE_MEMORY_ADVANCED_RERANKING);
}

function toIsoDate(value: unknown): string | undefined {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return undefined;
}

const SIGNAL_STOPWORDS = new Set([
    "about", "after", "again", "because", "between", "could", "does", "from", "have", "into",
    "more", "most", "other", "should", "their", "there", "these", "those", "this", "using",
    "with", "without", "were", "what", "when", "where", "which", "will", "would", "into",
]);

// ── Token estimation ────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function trimToTokenBudget(memories: RetrievedMemory[], budget: number): RetrievedMemory[] {
    let usedTokens = 0;
    const result: RetrievedMemory[] = [];
    for (const m of memories) {
        const tokens = estimateTokens(m.content);
        if (usedTokens + tokens > budget && result.length > 0) break;
        result.push(m);
        usedTokens += tokens;
    }
    return result;
}

function normalizedTerms(input: string): string[] {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 4 && !SIGNAL_STOPWORDS.has(term));
}

function likelyUsedInAnswer(memoryContent: string, answerText: string): boolean {
    const memoryTerms = normalizedTerms(memoryContent);
    const answerSet = new Set(normalizedTerms(answerText));
    if (memoryTerms.length === 0 || answerSet.size === 0) return false;
    let overlap = 0;
    for (const term of memoryTerms) {
        if (answerSet.has(term)) overlap += 1;
        if (overlap >= 2) return true;
    }
    return false;
}

function memoryKey(memory: Pick<RetrievedMemory, "type" | "id">): string {
    return `${memory.type}:${memory.id}`;
}

// ── Relevance scoring ───────────────────────────────────────────────────────

function calculateRelevance(query: string, text: string, tags: string[]): number {
    if (!query) return 0.5;

    const lowerQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();

    let score = 0;

    // Exact match
    if (lowerText.includes(lowerQuery)) {
        score += 1.0;
    }

    // Word overlap
    const queryWords = lowerQuery.split(/\s+/);
    const textWords = lowerText.split(/\s+/);
    const overlap = queryWords.filter((word) => textWords.includes(word)).length;
    score += (overlap / queryWords.length) * 0.5;

    // Tag matching
    if (tags.length > 0) {
        const matchingTags = tags.filter((tag) =>
            lowerQuery.includes(tag.toLowerCase())
        ).length;
        score += (matchingTags / tags.length) * 0.3;
    }

    // Identifier bonus (DOI/PMID/study-id style exact matches)
    const identifierTokens = lowerQuery.match(/\b(?:10\.\d{4,9}\/[-._;()/:a-z0-9]+|pmid:\s*\d+|c[a-z0-9]{8,})\b/gi) || [];
    if (identifierTokens.length > 0) {
        const exactIdentifierMatches = identifierTokens.filter((token) => lowerText.includes(token.trim())).length;
        if (exactIdentifierMatches > 0) {
            score += (exactIdentifierMatches / identifierTokens.length) * 0.9;
        }
    }

    return Math.min(score, 1.0);
}

function utilityMultiplier(memory: RetrievedMemory): number {
    let multiplier = 1.0;

    if (memory.type === "project" && (memory.memoryType === "criterion" || memory.memoryType === "decision")) {
        multiplier += 0.15;
    }

    if (memory.type === "user") {
        multiplier += 0.1;
    }

    if (memory.type === "study" && (memory.tags || []).length > 0) {
        multiplier += 0.05;
    }

    return multiplier;
}

export function hybridFuseScore(lexicalScore: number, semanticScore: number): number {
    return (lexicalScore * HYBRID_TEXT_WEIGHT) + (semanticScore * HYBRID_VECTOR_WEIGHT);
}

export function temporalDecayMultiplier(
    updatedAt: string | undefined,
    nowMs = Date.now(),
    halfLifeDays = TEMPORAL_DECAY_HALF_LIFE_DAYS
): number {
    if (!updatedAt || halfLifeDays <= 0) return 1;
    const updatedAtMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedAtMs)) return 1;
    if (updatedAtMs >= nowMs) return 1;
    const ageDays = Math.max(0, (nowMs - updatedAtMs) / (1000 * 60 * 60 * 24));
    return Math.exp((-Math.log(2) * ageDays) / halfLifeDays);
}

export function applyTemporalDecayScore(
    score: number,
    updatedAt: string | undefined,
    nowMs = Date.now(),
    halfLifeDays = TEMPORAL_DECAY_HALF_LIFE_DAYS
): number {
    return Math.min(Math.max(score * temporalDecayMultiplier(updatedAt, nowMs, halfLifeDays), 0), 1);
}

function memoryTextSimilarity(a: RetrievedMemory, b: RetrievedMemory): number {
    const termsA = new Set(normalizedTerms(a.content));
    const termsB = new Set(normalizedTerms(b.content));
    if (termsA.size === 0 || termsB.size === 0) return 0;

    let intersection = 0;
    for (const term of termsA) {
        if (termsB.has(term)) intersection += 1;
    }
    const union = new Set([...termsA, ...termsB]).size;
    if (union === 0) return 0;
    return intersection / union;
}

export function rerankWithMMR(
    candidates: RetrievedMemory[],
    limit: number,
    lambda = MMR_LAMBDA
): RetrievedMemory[] {
    if (limit <= 0 || candidates.length === 0) return [];
    const boundedLambda = Math.max(0, Math.min(1, lambda));
    const selected: RetrievedMemory[] = [];
    const remaining = [...candidates];

    while (selected.length < limit && remaining.length > 0) {
        let bestIndex = 0;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < remaining.length; i += 1) {
            const candidate = remaining[i];
            const relevance = candidate.relevance;
            const maxSimilarity = selected.length === 0
                ? 0
                : Math.max(...selected.map((picked) => memoryTextSimilarity(candidate, picked)));
            const mmrScore = (boundedLambda * relevance) - ((1 - boundedLambda) * maxSimilarity);
            if (mmrScore > bestScore) {
                bestScore = mmrScore;
                bestIndex = i;
            }
        }

        selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    return selected;
}

function fuseMemoryLayers(
    deterministic: RetrievedMemory[],
    keyword: RetrievedMemory[],
    semantic: RetrievedMemory[],
    options?: {
        advancedRerank?: boolean;
        maxMemories?: number;
    },
): RetrievedMemory[] {
    const useAdvancedRerank = options?.advancedRerank ?? false;
    const maxMemories = options?.maxMemories;
    const postDeterministicLimit = typeof maxMemories === "number"
        ? Math.max(0, maxMemories - deterministic.length)
        : Number.POSITIVE_INFINITY;
    const deterministicIds = new Set(deterministic.map(memoryKey));
    const fused = new Map<string, {
        memory: RetrievedMemory;
        lexical: number;
        semantic: number;
    }>();

    for (const memory of keyword) {
        const key = memoryKey(memory);
        if (deterministicIds.has(key)) continue;
        const existing = fused.get(key);
        if (!existing) {
            fused.set(key, {
                memory,
                lexical: memory.relevance,
                semantic: 0,
            });
            continue;
        }

        if (memory.relevance > existing.lexical) {
            existing.memory = memory;
        }
        existing.lexical = Math.max(existing.lexical, memory.relevance);
    }

    for (const memory of semantic) {
        const key = memoryKey(memory);
        if (deterministicIds.has(key)) continue;
        const existing = fused.get(key);
        if (!existing) {
            fused.set(key, {
                memory,
                lexical: 0,
                semantic: memory.relevance,
            });
            continue;
        }

        if (memory.relevance > existing.semantic && memory.relevance > existing.lexical) {
            existing.memory = memory;
        }
        existing.semantic = Math.max(existing.semantic, memory.relevance);
    }

    const ranked = [...fused.values()]
        .map((entry) => {
            // Weighted fusion:
            // - semantic leads paraphrase recall (70%)
            // - lexical anchors exact/keyword overlap (30%)
            const fusedScore = hybridFuseScore(entry.lexical, entry.semantic);
            const utilityWeighted = Math.min(fusedScore * utilityMultiplier(entry.memory), 1.0);
            const finalScore = useAdvancedRerank
                ? applyTemporalDecayScore(utilityWeighted, entry.memory.updatedAt)
                : utilityWeighted;
            return {
                ...entry.memory,
                relevance: finalScore,
                lexicalScore: entry.lexical,
                semanticScore: entry.semantic,
                deterministic: false,
            };
        })
        .sort((a, b) => b.relevance - a.relevance);

    if (!Number.isFinite(postDeterministicLimit) || postDeterministicLimit <= 0) {
        return [...deterministic, ...ranked];
    }

    if (!useAdvancedRerank) {
        return [...deterministic, ...ranked.slice(0, postDeterministicLimit)];
    }

    const reranked = rerankWithMMR(ranked, postDeterministicLimit, MMR_LAMBDA);
    return [...deterministic, ...reranked];
}

// ── Phase 1: Deterministic scope rules ──────────────────────────────────────

async function gatherDeterministicMemories(
    context: MemoryContext,
): Promise<RetrievedMemory[]> {
    const deterministic: RetrievedMemory[] = [];
    const seenIds = new Set<string>();

    function addMemory(mem: RetrievedMemory) {
        const key = memoryKey(mem);
        if (!seenIds.has(key)) {
            seenIds.add(key);
            deterministic.push(mem);
        }
    }

    // Rule 1: Always include critical ProjectMemory
    if (context.projectId) {
        const critical = await getProjectMemories(context.projectId, {
            importance: "critical",
            status: "active",
        });
        for (const m of critical) {
            addMemory({
                id: m.id,
                type: "project",
                memoryType: m.type,
                content: `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.statement}${m.rationale ? ` | Rationale: ${m.rationale}` : ""}`,
                relevance: 1.5,
                updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
                source: m.source,
                authority: m.authority,
                polarity: m.polarity,
                tags: m.tags,
                deterministic: true,
            });
        }
    }

    // Rule 2 (screening mode): Always include all criteria
    if (context.agentMode === "screening" && context.projectId) {
        const criteria = await getProjectMemories(context.projectId, {
            type: "criterion",
            status: "active",
        });
        for (const m of criteria) {
            addMemory({
                id: m.id,
                type: "project",
                memoryType: m.type,
                content: `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.statement}${m.rationale ? ` | Rationale: ${m.rationale}` : ""}`,
                relevance: 1.3,
                updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
                source: m.source,
                authority: m.authority,
                polarity: m.polarity,
                tags: m.tags,
                deterministic: true,
            });
        }
    }

    // Rule 3 (drafting mode + cited studies): Include StudyMemories for cited studies
    if (context.agentMode === "drafting" && context.citedStudyIds?.length) {
        if (!context.projectId) {
            throw new Error("Project scope is required when retrieving memories for cited studies.");
        }
        for (const studyId of context.citedStudyIds) {
            const studyMems = await getStudyMemoriesForProject(context.projectId, studyId, { status: "active" });
            for (const m of studyMems) {
                addMemory({
                    id: m.id,
                    type: "study",
                    memoryType: m.type,
                    content: `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.content}`,
                    relevance: 1.2,
                    updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
                    source: m.source || undefined,
                    authority: m.authority,
                    polarity: m.polarity,
                    tags: m.tags,
                    deterministic: true,
                });
            }
        }
    }

    // Rule 4 (qa mode): Include exclusion decisions
    if (context.agentMode === "qa" && context.projectId) {
        const exclusionDecisions = await getProjectMemories(context.projectId, {
            type: "decision",
            category: "exclusion",
            status: "active",
        });
        for (const m of exclusionDecisions) {
            addMemory({
                id: m.id,
                type: "project",
                memoryType: m.type,
                content: `[${m.type} - ${m.category}] ${m.statement}${m.rationale ? ` | Rationale: ${m.rationale}` : ""}`,
                relevance: 1.2,
                updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
                source: m.source,
                authority: m.authority,
                polarity: m.polarity,
                tags: m.tags,
                deterministic: true,
            });
        }
    }

    // Rule 5: Always include active UserMemory preferences
    const userPrefs = await getUserMemories(context.userId, { status: "active" });
    for (const m of userPrefs) {
        addMemory({
            id: m.id,
            type: "user",
            memoryType: m.type,
            content: `${m.key}: ${m.value}${m.rationale ? ` (${m.rationale})` : ""}`,
            relevance: 1.0,
            updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
            source: m.source,
            authority: m.authority,
            polarity: m.polarity,
            tags: m.tags,
            deterministic: true,
        });
    }

    return deterministic;
}

// ── Phase 2: Keyword scoring (existing logic) ───────────────────────────────

async function gatherKeywordMemories(
    context: MemoryContext,
    opts: {
        minRelevance: number;
        includeUser: boolean;
        includeProject: boolean;
        includeStudy: boolean;
    },
    excludeIds: Set<string>,
): Promise<RetrievedMemory[]> {
    const results: RetrievedMemory[] = [];
    const query = context.query || "";

    if (opts.includeUser) {
        const userMemories = await getUserMemories(context.userId, { status: "active" });
        for (const m of userMemories) {
            if (excludeIds.has(memoryKey({ id: m.id, type: "user" }))) continue;
            const content = `${m.key}: ${m.value}${m.rationale ? ` (${m.rationale})` : ""}`;
            const relevance = calculateRelevance(query, content, m.tags);
            if (relevance >= opts.minRelevance) {
                results.push({
                    id: m.id,
                    type: "user",
                    memoryType: m.type,
                    content,
                    relevance,
                    updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
                    source: m.source,
                    authority: m.authority,
                    polarity: m.polarity,
                    tags: m.tags,
                    lexicalScore: relevance,
                });
            }
        }
    }

    if (opts.includeProject && context.projectId) {
        const projectMemories = query
            ? await searchProjectMemories(context.projectId, query)
            : await getProjectMemories(context.projectId, { status: "active" });
        for (const m of projectMemories) {
            if (excludeIds.has(memoryKey({ id: m.id, type: "project" }))) continue;
            const content = `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.statement}${m.rationale ? ` | Rationale: ${m.rationale}` : ""}`;
            const relevance = calculateRelevance(query, content, m.tags)
                * (m.importance === "critical" ? 1.5 : m.importance === "important" ? 1.2 : 1.0);
            if (relevance >= opts.minRelevance) {
                results.push({
                    id: m.id,
                    type: "project",
                    memoryType: m.type,
                    content,
                    relevance,
                    updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
                    source: m.source,
                    authority: m.authority,
                    polarity: m.polarity,
                    tags: m.tags,
                    lexicalScore: relevance,
                });
            }
        }
    }

    if (opts.includeStudy && context.studyId) {
        const studyMemories = context.projectId
            ? await getStudyMemoriesForProject(context.projectId, context.studyId, { status: "active" })
            : await getStudyMemories(context.studyId, { status: "active" });
        for (const m of studyMemories) {
            if (context.projectId && m.projectId !== context.projectId) continue;
            if (excludeIds.has(memoryKey({ id: m.id, type: "study" }))) continue;
            const content = `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.content}`;
            const relevance = calculateRelevance(query, m.content, m.tags) * (m.confidence ?? 1.0);
            if (relevance >= opts.minRelevance) {
                results.push({
                    id: m.id, type: "study", memoryType: m.type, content, relevance,
                    updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
                    source: m.source || undefined,
                    authority: m.authority,
                    polarity: m.polarity,
                    tags: m.tags,
                    lexicalScore: relevance,
                });
            }
        }
    }

    if (opts.includeStudy && context.projectId && query) {
        const scopedStudyMatches = await searchStudyMemories(context.projectId, query, context.studyId
            ? { studyId: context.studyId }
            : undefined);

        for (const m of scopedStudyMatches) {
            if (excludeIds.has(memoryKey({ id: m.id, type: "study" }))) continue;
            const content = `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.content}`;
            const relevance = calculateRelevance(query, m.content, m.tags) * (m.confidence ?? 1.0);
            if (relevance >= opts.minRelevance) {
                results.push({
                    id: m.id,
                    type: "study",
                    memoryType: m.type,
                    content,
                    relevance,
                    updatedAt: toIsoDate((m as { updatedAt?: unknown }).updatedAt),
                    source: m.source || undefined,
                    authority: m.authority,
                    polarity: m.polarity,
                    tags: m.tags,
                    lexicalScore: relevance,
                });
            }
        }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
}

// ── Phase 3: Semantic retrieval (pgvector-backed) ────────────────────────────

async function gatherSemanticMemories(
    context: MemoryContext,
    opts: {
        minRelevance: number;
        includeUser: boolean;
        includeProject: boolean;
        includeStudy: boolean;
    },
    excludeIds: Set<string>,
): Promise<RetrievedMemory[]> {
    const results = await searchSemanticMemories(context, opts, excludeIds);
    return results.map((memory) => ({
        ...memory,
        semanticScore: memory.relevance,
    }));
}

// ── Main retrieval ──────────────────────────────────────────────────────────

export async function retrieveMemories(
    context: MemoryContext,
    options?: {
        maxMemories?: number;
        minRelevance?: number;
        includeUser?: boolean;
        includeProject?: boolean;
        includeStudy?: boolean;
        memoryBudgetTokens?: number;
    },
): Promise<RetrievedMemory[]> {
    const {
        maxMemories = 10,
        minRelevance = 0.3,
        includeUser = true,
        includeProject = true,
        includeStudy = true,
        memoryBudgetTokens = 2000,
    } = options || {};

    if (context.citedStudyIds?.length && !context.projectId) {
        throw new Error("Project scope is required when retrieving memories for cited studies.");
    }

    // Phase 1: Deterministic scope rules
    const deterministic = await gatherDeterministicMemories(context);
    const deterministicIds = new Set(deterministic.map(memoryKey));

    // Phase 2: Keyword relevance (skip already-included IDs)
    const keyword = await gatherKeywordMemories(
        context,
        { minRelevance, includeUser, includeProject, includeStudy },
        deterministicIds,
    );

    // Phase 3: Semantic retrieval
    const semantic = await gatherSemanticMemories(
        context,
        { minRelevance, includeUser, includeProject, includeStudy },
        deterministicIds,
    );

    const useAdvancedRerank = isAdvancedRetrievalRerankEnabled();
    const baseCandidatePool = Math.max(maxMemories, 1);
    const candidatePoolSize = useAdvancedRerank
        ? baseCandidatePool * ADVANCED_RETRIEVAL_CANDIDATE_MULTIPLIER
        : baseCandidatePool;
    const keywordCandidates = keyword.slice(0, candidatePoolSize);
    const semanticCandidates = semantic.slice(0, candidatePoolSize);

    // Phase 4: Fuse lexical + semantic layers, then trim by count and token budget
    const fused = fuseMemoryLayers(deterministic, keywordCandidates, semanticCandidates, {
        advancedRerank: useAdvancedRerank,
        maxMemories,
    });
    const merged = fused.slice(0, maxMemories);
    const trimmed = trimToTokenBudget(merged, memoryBudgetTokens);

    // Phase 5: Emit context_assembly event if runId provided
    if (context.runId && trimmed.length > 0) {
        const excluded = merged
            .filter((m) => !trimmed.some((t) => t.id === m.id))
            .map((m) => ({ id: m.id, reason: "budget_exceeded" }));

        const tokensByLayer = (type: string) =>
            trimmed.filter((m) => m.type === type).reduce((sum, m) => sum + estimateTokens(m.content), 0);

        await recordRunEvent({
            runId: context.runId,
            type: "context_assembly",
            payload: {
            deterministicCount: deterministic.length,
            keywordCount: keyword.length,
            semanticCount: semantic.length,
            finalCount: trimmed.length,
            tokenEstimate: trimmed.reduce((s, m) => s + estimateTokens(m.content), 0),
            budget: memoryBudgetTokens,
            perLayer: {
                user: tokensByLayer("user"),
                project: tokensByLayer("project"),
                study: tokensByLayer("study"),
            },
            excluded,
            },
            logContext: "memory_context_assembly",
        }).catch(() => {}); // Non-critical — don't fail retrieval
    }

    // Log retrieval for audit trail
    if (trimmed.length > 0) {
        try {
            const auditItems = await logMemoryRetrieval({
                userId: context.userId,
                projectId: context.projectId,
                conversationId: context.conversationId,
                query: context.query || "context-based",
                memories: trimmed,
            });
            for (const memory of trimmed) {
                const audit = auditItems.get(memoryKey(memory));
                if (!audit) continue;
                memory.retrievalId = audit.retrievalId;
                memory.retrievalItemId = audit.retrievalItemId;
            }
        } catch (error) {
            logServerWarn("memory", "retrieval audit logging failed", {
                userId: context.userId,
                projectId: context.projectId ?? null,
                conversationId: context.conversationId ?? null,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        await incrementRetrievalCounters(trimmed).catch(() => {});
        await runMemoryMaintenanceLoop({ projectId: context.projectId, userId: context.userId }).catch(() => null);
    }

    return trimmed;
}

/**
 * Heuristically mark retrieved memories as used in the final assistant answer.
 * This powers retrieval-hit quality metrics without blocking response generation.
 */
export async function markMemoriesUsedInAnswer(memories: RetrievedMemory[], answerText: string): Promise<void> {
    if (!answerText.trim() || memories.length === 0) return;
    const used = memories.filter((memory) => likelyUsedInAnswer(memory.content, answerText));
    if (used.length === 0) return;

    const userIds = [...new Set(used.filter((m) => m.type === "user").map((m) => m.id))];
    const projectIds = [...new Set(used.filter((m) => m.type === "project").map((m) => m.id))];
    const studyIds = [...new Set(used.filter((m) => m.type === "study").map((m) => m.id))];
    const retrievalItemIds = [...new Set(used.map((m) => m.retrievalItemId).filter((id): id is string => Boolean(id)))];

    const updates: Promise<unknown>[] = [];
    if (userIds.length > 0) {
        const values = userIds.map((id) => Prisma.sql`${id}`);
        updates.push(prisma.$executeRaw`
            UPDATE "UserMemory"
            SET "usedInAnswerCount" = "usedInAnswerCount" + 1,
                "lastUsedAt" = NOW()
            WHERE "id" IN (${Prisma.join(values)})
        `);
    }
    if (projectIds.length > 0) {
        const values = projectIds.map((id) => Prisma.sql`${id}`);
        updates.push(prisma.$executeRaw`
            UPDATE "ProjectMemory"
            SET "usedInAnswerCount" = "usedInAnswerCount" + 1,
                "lastUsedAt" = NOW()
            WHERE "id" IN (${Prisma.join(values)})
        `);
    }
    if (studyIds.length > 0) {
        const values = studyIds.map((id) => Prisma.sql`${id}`);
        updates.push(prisma.$executeRaw`
            UPDATE "StudyMemory"
            SET "usedInAnswerCount" = "usedInAnswerCount" + 1,
                "lastUsedAt" = NOW()
            WHERE "id" IN (${Prisma.join(values)})
        `);
    }
    if (retrievalItemIds.length > 0) {
        updates.push(prisma.memoryRetrievalItem.updateMany({
            where: { id: { in: retrievalItemIds } },
            data: { usedInAnswer: true },
        }));
    }
    if (updates.length > 0) await Promise.all(updates);
}

// ── Audit logging ───────────────────────────────────────────────────────────

async function logMemoryRetrieval(input: {
    userId: string;
    projectId?: string;
    conversationId?: string;
    query: string;
    memories: RetrievedMemory[];
}): Promise<Map<string, { retrievalId: string; retrievalItemId: string }>> {
    const auditItems = new Map<string, { retrievalId: string; retrievalItemId: string }>();
    const memoryIdsByType = input.memories.reduce(
        (acc, mem) => {
            if (!acc[mem.type]) acc[mem.type] = [];
            acc[mem.type].push(mem.id);
            return acc;
        },
        {} as Record<string, string[]>,
    );

    for (const [memoryType, ids] of Object.entries(memoryIdsByType)) {
        const memories = input.memories.filter((memory) => memory.type === memoryType);
        const created = await prisma.memoryRetrieval.create({
            data: {
                conversationId: input.conversationId,
                query: input.query,
                memoryType,
                memoryIds: ids,
                resultCount: ids.length,
                userId: input.userId,
                projectId: input.projectId,
                items: {
                    create: memories.map((memory, index) => ({
                        memoryType,
                        memoryId: memory.id,
                        rank: index + 1,
                        finalScore: memory.relevance,
                        lexicalScore: memory.lexicalScore,
                        semanticScore: memory.semanticScore,
                        deterministic: memory.deterministic ?? false,
                        tokenEstimate: estimateTokens(memory.content),
                        source: memory.source,
                        authority: memory.authority,
                    })),
                },
            },
            include: {
                items: {
                    select: {
                        id: true,
                        retrievalId: true,
                        memoryType: true,
                        memoryId: true,
                    },
                },
            },
        });
        for (const item of created.items ?? []) {
            auditItems.set(`${item.memoryType}:${item.memoryId}`, {
                retrievalId: item.retrievalId,
                retrievalItemId: item.id,
            });
        }
    }
    return auditItems;
}

async function incrementRetrievalCounters(memories: RetrievedMemory[]) {
    const userIds = [...new Set(memories.filter((m) => m.type === "user").map((m) => m.id))];
    const projectIds = [...new Set(memories.filter((m) => m.type === "project").map((m) => m.id))];
    const studyIds = [...new Set(memories.filter((m) => m.type === "study").map((m) => m.id))];

    const updates: Promise<unknown>[] = [];
    if (userIds.length > 0) {
        const userIdValues = userIds.map((id) => Prisma.sql`${id}`);
        updates.push(
            prisma.$executeRaw`
                UPDATE "UserMemory"
                SET "retrievalCount" = "retrievalCount" + 1,
                    "lastUsedAt" = NOW()
                WHERE "id" IN (${Prisma.join(userIdValues)})
            `,
        );
    }
    if (projectIds.length > 0) {
        const projectIdValues = projectIds.map((id) => Prisma.sql`${id}`);
        updates.push(
            prisma.$executeRaw`
                UPDATE "ProjectMemory"
                SET "retrievalCount" = "retrievalCount" + 1,
                    "lastUsedAt" = NOW()
                WHERE "id" IN (${Prisma.join(projectIdValues)})
            `,
        );
    }
    if (studyIds.length > 0) {
        const studyIdValues = studyIds.map((id) => Prisma.sql`${id}`);
        updates.push(
            prisma.$executeRaw`
                UPDATE "StudyMemory"
                SET "retrievalCount" = "retrievalCount" + 1,
                    "lastUsedAt" = NOW()
                WHERE "id" IN (${Prisma.join(studyIdValues)})
            `,
        );
    }

    if (updates.length > 0) {
        await Promise.all(updates);
    }
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function formatMemoriesForContext(memories: RetrievedMemory[]): string {
    if (memories.length === 0) return "";

    const userMemories = memories.filter((m) => m.type === "user");
    const projectMemories = memories.filter((m) => m.type === "project");
    const studyMemories = memories.filter((m) => m.type === "study");

    const sections: string[] = [];

    if (userMemories.length > 0) {
        sections.push(`User Preferences:\n${userMemories.map((m) => `- ${m.content}`).join("\n")}`);
    }
    if (projectMemories.length > 0) {
        sections.push(`Project Context:\n${projectMemories.map((m) => `- ${m.content}`).join("\n")}`);
    }
    if (studyMemories.length > 0) {
        sections.push(`Study Information:\n${studyMemories.map((m) => `- ${m.content}`).join("\n")}`);
    }

    return `\n\n## Relevant Memory\nThe following is from previous conversations and project data. Use these to inform your response — reference user decisions naturally when relevant but do not repeat this list back to the user.\n\n${sections.join("\n\n")}\n`;
}

/**
 * Retrieve and format memories in one call
 */
export async function retrieveAndFormatMemories(
    context: MemoryContext,
    options?: {
        maxMemories?: number;
        minRelevance?: number;
        memoryBudgetTokens?: number;
    },
): Promise<string> {
    const memories = await retrieveMemories(context, options);
    return formatMemoriesForContext(memories);
}

/**
 * Get memory retrieval statistics for a project
 */
export async function getMemoryRetrievalStats(projectId: string) {
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const retrievals = await prisma.memoryRetrieval.findMany({
        where: {
            projectId,
            createdAt: { gte: last7Days },
        },
        orderBy: { createdAt: "desc" },
    });

    const totalRetrievals = retrievals.length;
    const totalMemoriesRetrieved = retrievals.reduce((sum, r) => sum + r.resultCount, 0);
    const avgMemoriesPerRetrieval = totalRetrievals > 0 ? totalMemoriesRetrieved / totalRetrievals : 0;

    const memoryTypeCounts = retrievals.reduce(
        (acc, r) => {
            acc[r.memoryType] = (acc[r.memoryType] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>,
    );

    return {
        totalRetrievals,
        totalMemoriesRetrieved,
        avgMemoriesPerRetrieval,
        memoryTypeCounts,
        recentRetrievals: retrievals.slice(0, 10),
    };
}
