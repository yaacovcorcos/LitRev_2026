/**
 * Study Memory Service
 * Manages study-level facts and summaries
 */

import { prisma } from "@/lib/server/prisma";

export type StudyMemoryType = "summary" | "finding" | "limitation" | "quality" | "methods" | "results";
export type StudyMemoryCategory = "methods" | "results" | "bias" | "population" | "intervention" | "outcomes";
export type StudyMemorySource = "ai_generated" | "user_input" | "extracted";

export interface CreateStudyMemoryInput {
    studyId: string;
    projectId: string;
    type: StudyMemoryType;
    content: string;
    category?: StudyMemoryCategory;
    source?: StudyMemorySource;
    confidence?: number;
    tags?: string[];
}

export interface UpdateStudyMemoryInput {
    content?: string;
    category?: StudyMemoryCategory;
    confidence?: number;
    tags?: string[];
    status?: "active" | "archived";
}

/**
 * Create a study memory
 */
export async function createStudyMemory(input: CreateStudyMemoryInput) {
    return prisma.studyMemory.create({
        data: input,
    });
}

/**
 * Get a specific study memory
 */
export async function getStudyMemory(id: string) {
    return prisma.studyMemory.findUnique({
        where: { id },
    });
}

/**
 * Get all memories for a study
 */
export async function getStudyMemories(
    studyId: string,
    options?: {
        type?: StudyMemoryType;
        category?: StudyMemoryCategory;
        status?: string;
        minConfidence?: number;
        tags?: string[];
    }
) {
    return prisma.studyMemory.findMany({
        where: {
            studyId,
            type: options?.type,
            category: options?.category,
            status: options?.status ?? "active",
            ...(options?.minConfidence !== undefined
                ? { confidence: { gte: options.minConfidence } }
                : {}),
            ...(options?.tags?.length
                ? { tags: { hasSome: options.tags } }
                : {}),
        },
        orderBy: [
            { type: "asc" },
            { createdAt: "desc" },
        ],
    });
}

/**
 * Get all memories for a project (across all studies)
 */
export async function getProjectStudyMemories(
    projectId: string,
    options?: {
        type?: StudyMemoryType;
        category?: StudyMemoryCategory;
        minConfidence?: number;
        tags?: string[];
    }
) {
    return prisma.studyMemory.findMany({
        where: {
            projectId,
            type: options?.type,
            category: options?.category,
            status: "active",
            ...(options?.minConfidence !== undefined
                ? { confidence: { gte: options.minConfidence } }
                : {}),
            ...(options?.tags?.length
                ? { tags: { hasSome: options.tags } }
                : {}),
        },
        include: {
            study: {
                select: {
                    id: true,
                    title: true,
                    authors: true,
                    year: true,
                },
            },
        },
        orderBy: [
            { type: "asc" },
            { createdAt: "desc" },
        ],
    });
}

/**
 * Update a study memory
 */
export async function updateStudyMemory(
    id: string,
    input: UpdateStudyMemoryInput
) {
    return prisma.studyMemory.update({
        where: { id },
        data: input,
    });
}

/**
 * Delete a study memory
 */
export async function deleteStudyMemory(id: string) {
    return prisma.studyMemory.delete({
        where: { id },
    });
}

/**
 * Delete all study memories for a study that have a specific tag.
 * Used for idempotent re-creation (e.g., deep analysis re-runs).
 */
export async function deleteStudyMemoriesByTag(
    studyId: string,
    tag: string
): Promise<number> {
    const result = await prisma.studyMemory.deleteMany({
        where: {
            studyId,
            tags: { has: tag },
        },
    });
    return result.count;
}

/**
 * Search study memories
 */
export async function searchStudyMemories(
    projectId: string,
    query: string,
    options?: { studyId?: string }
) {
    const lowerQuery = query.toLowerCase();

    return prisma.studyMemory.findMany({
        where: {
            projectId,
            ...(options?.studyId ? { studyId: options.studyId } : {}),
            status: "active",
            content: { contains: lowerQuery, mode: "insensitive" },
        },
        include: {
            study: {
                select: {
                    id: true,
                    title: true,
                    authors: true,
                    year: true,
                },
            },
        },
        orderBy: [
            { confidence: "desc" },
            { createdAt: "desc" },
        ],
    });
}

/**
 * Batch create study memories (useful for AI extraction)
 */
export async function batchCreateStudyMemories(
    memories: CreateStudyMemoryInput[]
) {
    return prisma.studyMemory.createMany({
        data: memories,
    });
}

/**
 * Get summary of all memories for a study
 */
export async function getStudyMemorySummary(studyId: string) {
    const memories = await prisma.studyMemory.findMany({
        where: { studyId, status: "active" },
        orderBy: { type: "asc" },
    });

    // Group by type
    const grouped = memories.reduce((acc, memory) => {
        if (!acc[memory.type]) {
            acc[memory.type] = [];
        }
        acc[memory.type].push(memory);
        return acc;
    }, {} as Record<string, typeof memories>);

    return grouped;
}

/**
 * Create StudyMemory records from deep analysis results.
 * Idempotent: deletes any existing "deep-analysis" tagged memories first.
 */
export async function createMemoriesFromDeepAnalysis(
    studyId: string,
    projectId: string,
    details: Record<string, unknown>,
    quality?: string
): Promise<void> {
    await deleteStudyMemoriesByTag(studyId, "deep-analysis");

    const memories: CreateStudyMemoryInput[] = [];

    if (typeof details.aiSummary === "string" && details.aiSummary.length > 0) {
        memories.push({
            studyId,
            projectId,
            type: "summary",
            content: details.aiSummary,
            source: "ai_generated",
            confidence: 0.8,
            tags: ["deep-analysis"],
        });
    }

    const methodsParts: string[] = [];
    if (typeof details.studyType === "string") methodsParts.push(`Study type: ${details.studyType}`);
    if (typeof details.sampleSize === "number") methodsParts.push(`Sample size: ${details.sampleSize}`);
    if (methodsParts.length > 0) {
        memories.push({
            studyId,
            projectId,
            type: "methods",
            content: methodsParts.join(". "),
            source: "ai_generated",
            confidence: 0.7,
            tags: ["deep-analysis"],
        });
    }

    const qualityParts: string[] = [];
    if (quality && quality !== "-") qualityParts.push(`Quality: ${quality}`);
    if (typeof details.qualityRationale === "string") qualityParts.push(details.qualityRationale);
    if (qualityParts.length > 0) {
        memories.push({
            studyId,
            projectId,
            type: "quality",
            content: qualityParts.join(". "),
            source: "ai_generated",
            confidence: 0.75,
            tags: ["deep-analysis"],
        });
    }

    if (typeof details.primaryOutcome === "string" && details.primaryOutcome.length > 0) {
        memories.push({
            studyId,
            projectId,
            type: "results",
            content: `Primary outcome: ${details.primaryOutcome}`,
            source: "ai_generated",
            confidence: 0.7,
            tags: ["deep-analysis"],
        });
    }

    if (memories.length > 0) {
        await batchCreateStudyMemories(memories);
    }
}
