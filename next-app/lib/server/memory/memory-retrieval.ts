/**
 * Memory Retrieval System
 * Deterministic-first retrieval with keyword scoring fallback (planC Phase 5.4)
 */

import { prisma } from "@/lib/server/prisma";
import { Prisma } from "@prisma/client";
import { getUserMemories } from "./user-memory";
import { getProjectMemories, searchProjectMemories } from "./project-memory";
import { getStudyMemories, searchStudyMemories } from "./study-memory";
import { searchSemanticMemories } from "./semantic-memory";
import { runMemoryMaintenanceLoop } from "./maintenance";
import { emitEvent } from "@/lib/server/agent/events";
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
    source?: string;
    tags?: string[];
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

function fuseMemoryLayers(
    deterministic: RetrievedMemory[],
    keyword: RetrievedMemory[],
    semantic: RetrievedMemory[],
): RetrievedMemory[] {
    const deterministicIds = new Set(deterministic.map((m) => m.id));
    const fused = new Map<string, {
        memory: RetrievedMemory;
        lexical: number;
        semantic: number;
    }>();

    for (const memory of keyword) {
        if (deterministicIds.has(memory.id)) continue;
        const existing = fused.get(memory.id);
        if (!existing) {
            fused.set(memory.id, {
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
        if (deterministicIds.has(memory.id)) continue;
        const existing = fused.get(memory.id);
        if (!existing) {
            fused.set(memory.id, {
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
            // - lexical dominates exact matching
            // - semantic boosts paraphrase recall when available
            const fusedScore = (entry.lexical * 0.7) + (entry.semantic * 0.3);
            const weightedScore = Math.min(fusedScore * utilityMultiplier(entry.memory), 1.0);
            return {
                ...entry.memory,
                relevance: weightedScore,
            };
        })
        .sort((a, b) => b.relevance - a.relevance);

    return [...deterministic, ...ranked];
}

// ── Phase 1: Deterministic scope rules ──────────────────────────────────────

async function gatherDeterministicMemories(
    context: MemoryContext,
): Promise<RetrievedMemory[]> {
    const deterministic: RetrievedMemory[] = [];
    const seenIds = new Set<string>();

    function addMemory(mem: RetrievedMemory) {
        if (!seenIds.has(mem.id)) {
            seenIds.add(mem.id);
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
                tags: m.tags,
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
                tags: m.tags,
            });
        }
    }

    // Rule 3 (drafting mode + cited studies): Include StudyMemories for cited studies
    if (context.agentMode === "drafting" && context.citedStudyIds?.length) {
        for (const studyId of context.citedStudyIds) {
            const studyMems = await getStudyMemories(studyId, { status: "active" });
            for (const m of studyMems) {
                if (context.projectId && m.projectId !== context.projectId) continue;
                addMemory({
                    id: m.id,
                    type: "study",
                    memoryType: m.type,
                    content: `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.content}`,
                    relevance: 1.2,
                    source: m.source || undefined,
                    tags: m.tags,
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
                tags: m.tags,
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
            tags: m.tags,
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
            if (excludeIds.has(m.id)) continue;
            const content = `${m.key}: ${m.value}${m.rationale ? ` (${m.rationale})` : ""}`;
            const relevance = calculateRelevance(query, content, m.tags);
            if (relevance >= opts.minRelevance) {
                results.push({ id: m.id, type: "user", memoryType: m.type, content, relevance, tags: m.tags });
            }
        }
    }

    if (opts.includeProject && context.projectId) {
        const projectMemories = query
            ? await searchProjectMemories(context.projectId, query)
            : await getProjectMemories(context.projectId, { status: "active" });
        for (const m of projectMemories) {
            if (excludeIds.has(m.id)) continue;
            const content = `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.statement}${m.rationale ? ` | Rationale: ${m.rationale}` : ""}`;
            const relevance = calculateRelevance(query, content, m.tags)
                * (m.importance === "critical" ? 1.5 : m.importance === "important" ? 1.2 : 1.0);
            if (relevance >= opts.minRelevance) {
                results.push({ id: m.id, type: "project", memoryType: m.type, content, relevance, tags: m.tags });
            }
        }
    }

    if (opts.includeStudy && context.studyId) {
        const studyMemories = await getStudyMemories(context.studyId, { status: "active" });
        for (const m of studyMemories) {
            if (context.projectId && m.projectId !== context.projectId) continue;
            if (excludeIds.has(m.id)) continue;
            const content = `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.content}`;
            const relevance = calculateRelevance(query, m.content, m.tags) * (m.confidence ?? 1.0);
            if (relevance >= opts.minRelevance) {
                results.push({
                    id: m.id, type: "study", memoryType: m.type, content, relevance,
                    source: m.source || undefined, tags: m.tags,
                });
            }
        }
    }

    if (opts.includeStudy && context.projectId && query) {
        const scopedStudyMatches = await searchStudyMemories(context.projectId, query, context.studyId
            ? { studyId: context.studyId }
            : undefined);

        for (const m of scopedStudyMatches) {
            if (excludeIds.has(m.id)) continue;
            const content = `[${m.type}${m.category ? ` - ${m.category}` : ""}] ${m.content}`;
            const relevance = calculateRelevance(query, m.content, m.tags) * (m.confidence ?? 1.0);
            if (relevance >= opts.minRelevance) {
                results.push({
                    id: m.id,
                    type: "study",
                    memoryType: m.type,
                    content,
                    relevance,
                    source: m.source || undefined,
                    tags: m.tags,
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
    return searchSemanticMemories(context, opts, excludeIds);
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

    // Phase 1: Deterministic scope rules
    const deterministic = await gatherDeterministicMemories(context);
    const deterministicIds = new Set(deterministic.map((d) => d.id));

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
        new Set([...deterministicIds, ...keyword.map((k) => k.id)]),
    );

    // Phase 4: Fuse lexical + semantic layers, then trim by count and token budget
    const fused = fuseMemoryLayers(deterministic, keyword, semantic);
    const merged = fused.slice(0, maxMemories);
    const trimmed = trimToTokenBudget(merged, memoryBudgetTokens);

    // Phase 5: Emit context_assembly event if runId provided
    if (context.runId && trimmed.length > 0) {
        const excluded = merged
            .filter((m) => !trimmed.some((t) => t.id === m.id))
            .map((m) => ({ id: m.id, reason: "budget_exceeded" }));

        const tokensByLayer = (type: string) =>
            trimmed.filter((m) => m.type === type).reduce((sum, m) => sum + estimateTokens(m.content), 0);

        await emitEvent(context.runId, "context_assembly", {
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
        }).catch(() => {}); // Non-critical — don't fail retrieval
    }

    // Log retrieval for audit trail
    if (trimmed.length > 0) {
        await logMemoryRetrieval({
            userId: context.userId,
            projectId: context.projectId,
            conversationId: context.conversationId,
            query: context.query || "context-based",
            memories: trimmed,
        });
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

    const updates: Promise<unknown>[] = [];
    if (userIds.length > 0) {
        const values = userIds.map((id) => Prisma.sql`${id}`);
        updates.push(prisma.$executeRaw`
            UPDATE "UserMemory"
            SET "usedInAnswerCount" = "usedInAnswerCount" + 1
            WHERE "id" IN (${Prisma.join(values)})
        `);
    }
    if (projectIds.length > 0) {
        const values = projectIds.map((id) => Prisma.sql`${id}`);
        updates.push(prisma.$executeRaw`
            UPDATE "ProjectMemory"
            SET "usedInAnswerCount" = "usedInAnswerCount" + 1
            WHERE "id" IN (${Prisma.join(values)})
        `);
    }
    if (studyIds.length > 0) {
        const values = studyIds.map((id) => Prisma.sql`${id}`);
        updates.push(prisma.$executeRaw`
            UPDATE "StudyMemory"
            SET "usedInAnswerCount" = "usedInAnswerCount" + 1
            WHERE "id" IN (${Prisma.join(values)})
        `);
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
}) {
    const memoryIdsByType = input.memories.reduce(
        (acc, mem) => {
            if (!acc[mem.type]) acc[mem.type] = [];
            acc[mem.type].push(mem.id);
            return acc;
        },
        {} as Record<string, string[]>,
    );

    for (const [memoryType, ids] of Object.entries(memoryIdsByType)) {
        await prisma.memoryRetrieval.create({
            data: {
                conversationId: input.conversationId,
                query: input.query,
                memoryType,
                memoryIds: ids,
                resultCount: ids.length,
                userId: input.userId,
                projectId: input.projectId,
            },
        });
    }
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
                SET "retrievalCount" = "retrievalCount" + 1
                WHERE "id" IN (${Prisma.join(userIdValues)})
            `,
        );
    }
    if (projectIds.length > 0) {
        const projectIdValues = projectIds.map((id) => Prisma.sql`${id}`);
        updates.push(
            prisma.$executeRaw`
                UPDATE "ProjectMemory"
                SET "retrievalCount" = "retrievalCount" + 1
                WHERE "id" IN (${Prisma.join(projectIdValues)})
            `,
        );
    }
    if (studyIds.length > 0) {
        const studyIdValues = studyIds.map((id) => Prisma.sql`${id}`);
        updates.push(
            prisma.$executeRaw`
                UPDATE "StudyMemory"
                SET "retrievalCount" = "retrievalCount" + 1
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
