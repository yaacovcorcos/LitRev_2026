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
