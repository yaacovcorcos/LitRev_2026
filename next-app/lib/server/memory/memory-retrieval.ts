/**
 * Memory Retrieval System
 * Deterministic-first retrieval with keyword scoring fallback (planC Phase 5.4)
 */

import { prisma } from "@/lib/server/prisma";
import { getUserMemories } from "./user-memory";
import { getProjectMemories, searchProjectMemories } from "./project-memory";
import { getStudyMemories, searchStudyMemories } from "./study-memory";
import { emitEvent } from "@/lib/server/agent/events";
import type { AgentMode } from "@/types/agent";

export interface MemoryContext {
    userId: string;
    projectId?: string;
    studyId?: string;
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

    return Math.min(score, 1.0);
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

    return results.sort((a, b) => b.relevance - a.relevance);
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

    // Phase 3: Merge and trim to budget
    const merged = [...deterministic, ...keyword].slice(0, maxMemories);
    const trimmed = trimToTokenBudget(merged, memoryBudgetTokens);

    // Phase 4: Emit context_assembly event if runId provided
    if (context.runId && trimmed.length > 0) {
        const excluded = merged
            .filter((m) => !trimmed.some((t) => t.id === m.id))
            .map((m) => ({ id: m.id, reason: "budget_exceeded" }));

        const tokensByLayer = (type: string) =>
            trimmed.filter((m) => m.type === type).reduce((sum, m) => sum + estimateTokens(m.content), 0);

        await emitEvent(context.runId, "context_assembly", {
            deterministicCount: deterministic.length,
            keywordCount: keyword.length,
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
            query: context.query || "context-based",
            memories: trimmed,
        });
    }

    return trimmed;
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
