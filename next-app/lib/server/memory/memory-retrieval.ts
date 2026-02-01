/**
 * Memory Retrieval System
 * Intelligently fetches relevant memories for AI context injection
 */

import { prisma } from "@/lib/server/prisma";
import { getUserMemories } from "./user-memory";
import { getProjectMemories, searchProjectMemories } from "./project-memory";
import { getStudyMemories, searchStudyMemories } from "./study-memory";

export interface MemoryContext {
    userId: string;
    projectId?: string;
    studyId?: string;
    query?: string;
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

/**
 * Calculate simple relevance score based on keyword matching
 */
function calculateRelevance(query: string, text: string, tags: string[]): number {
    if (!query) return 0.5; // Default relevance if no query

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

/**
 * Retrieve all relevant memories for a given context
 */
export async function retrieveMemories(
    context: MemoryContext,
    options?: {
        maxMemories?: number;
        minRelevance?: number;
        includeUser?: boolean;
        includeProject?: boolean;
        includeStudy?: boolean;
    }
): Promise<RetrievedMemory[]> {
    const {
        maxMemories = 10,
        minRelevance = 0.3,
        includeUser = true,
        includeProject = true,
        includeStudy = true,
    } = options || {};

    const allMemories: RetrievedMemory[] = [];
    const query = context.query || "";

    // 1. Retrieve user memories
    if (includeUser) {
        const userMemories = await getUserMemories(context.userId, {
            status: "active",
        });

        for (const memory of userMemories) {
            const content = `${memory.key}: ${memory.value}${
                memory.rationale ? ` (${memory.rationale})` : ""
            }`;
            const relevance = calculateRelevance(query, content, memory.tags);

            if (relevance >= minRelevance) {
                allMemories.push({
                    id: memory.id,
                    type: "user",
                    memoryType: memory.type,
                    content,
                    relevance,
                    tags: memory.tags,
                });
            }
        }
    }

    // 2. Retrieve project memories
    if (includeProject && context.projectId) {
        const projectMemories = query
            ? await searchProjectMemories(context.projectId, query)
            : await getProjectMemories(context.projectId, { status: "active" });

        for (const memory of projectMemories) {
            const content = `[${memory.type}${memory.category ? ` - ${memory.category}` : ""}] ${
                memory.statement
            }${memory.rationale ? ` | Rationale: ${memory.rationale}` : ""}`;
            const relevance = calculateRelevance(query, content, memory.tags);

            if (relevance >= minRelevance) {
                allMemories.push({
                    id: memory.id,
                    type: "project",
                    memoryType: memory.type,
                    content,
                    relevance: relevance * (memory.importance === "critical" ? 1.5 : memory.importance === "important" ? 1.2 : 1.0),
                    tags: memory.tags,
                });
            }
        }
    }

    // 3. Retrieve study memories
    if (includeStudy && context.studyId) {
        const studyMemories = await getStudyMemories(context.studyId, {
            status: "active",
        });

        for (const memory of studyMemories) {
            const content = `[${memory.type}${memory.category ? ` - ${memory.category}` : ""}] ${
                memory.content
            }`;
            const relevance = calculateRelevance(query, memory.content, memory.tags);

            if (relevance >= minRelevance) {
                allMemories.push({
                    id: memory.id,
                    type: "study",
                    memoryType: memory.type,
                    content,
                    relevance: relevance * (memory.confidence || 1.0),
                    source: memory.source || undefined,
                    tags: memory.tags,
                });
            }
        }
    }

    // Sort by relevance and limit
    const sortedMemories = allMemories
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, maxMemories);

    // Log retrieval for audit trail
    if (sortedMemories.length > 0) {
        await logMemoryRetrieval({
            userId: context.userId,
            projectId: context.projectId,
            query: query || "context-based",
            memories: sortedMemories,
        });
    }

    return sortedMemories;
}

/**
 * Log memory retrieval for audit trail
 */
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
        {} as Record<string, string[]>
    );

    // Log each memory type separately
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

/**
 * Format memories for AI context injection
 */
export function formatMemoriesForContext(memories: RetrievedMemory[]): string {
    if (memories.length === 0) {
        return "";
    }

    const userMemories = memories.filter((m) => m.type === "user");
    const projectMemories = memories.filter((m) => m.type === "project");
    const studyMemories = memories.filter((m) => m.type === "study");

    const sections: string[] = [];

    if (userMemories.length > 0) {
        sections.push(
            `User Preferences:\n${userMemories.map((m) => `- ${m.content}`).join("\n")}`
        );
    }

    if (projectMemories.length > 0) {
        sections.push(
            `Project Context:\n${projectMemories.map((m) => `- ${m.content}`).join("\n")}`
        );
    }

    if (studyMemories.length > 0) {
        sections.push(
            `Study Information:\n${studyMemories.map((m) => `- ${m.content}`).join("\n")}`
        );
    }

    return `\n\n## Relevant Memory\n\n${sections.join("\n\n")}\n`;
}

/**
 * Retrieve and format memories in one call
 */
export async function retrieveAndFormatMemories(
    context: MemoryContext,
    options?: {
        maxMemories?: number;
        minRelevance?: number;
    }
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
    const totalMemoriesRetrieved = retrievals.reduce(
        (sum, r) => sum + r.resultCount,
        0
    );
    const avgMemoriesPerRetrieval =
        totalRetrievals > 0 ? totalMemoriesRetrieved / totalRetrievals : 0;

    const memoryTypeCounts = retrievals.reduce(
        (acc, r) => {
            acc[r.memoryType] = (acc[r.memoryType] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    return {
        totalRetrievals,
        totalMemoriesRetrieved,
        avgMemoriesPerRetrieval,
        memoryTypeCounts,
        recentRetrievals: retrievals.slice(0, 10),
    };
}
