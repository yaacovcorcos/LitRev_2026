/**
 * Study Memory Service
 * Manages study-level facts and summaries
 */

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import {
    authorityFromSource,
    extractMemoryKeyFromTags,
    normalizeMemoryAuthority,
    normalizeMemoryPolarity,
    sourceFromTags,
    type MemoryAuthority,
    type MemoryPolarity,
    type MemorySource,
} from "@/lib/memory-contracts";

export type StudyMemoryType = "summary" | "finding" | "limitation" | "quality" | "methods" | "results";
export type StudyMemoryCategory = "methods" | "results" | "bias" | "population" | "intervention" | "outcomes";
export type StudyMemorySource = MemorySource;

type StudyMemoryDbClient = typeof prisma | Prisma.TransactionClient;

export interface CreateStudyMemoryInput {
    studyId: string;
    projectId: string;
    type: StudyMemoryType;
    key?: string;
    content: string;
    category?: StudyMemoryCategory;
    source?: StudyMemorySource;
    authority?: MemoryAuthority;
    polarity?: MemoryPolarity;
    sourceRefType?: string;
    sourceRefId?: string;
    locator?: Prisma.InputJsonValue;
    confidence?: number;
    tags?: string[];
}

export interface UpdateStudyMemoryInput {
    key?: string;
    content?: string;
    category?: StudyMemoryCategory;
    source?: StudyMemorySource;
    authority?: MemoryAuthority;
    polarity?: MemoryPolarity;
    sourceRefType?: string;
    sourceRefId?: string;
    locator?: Prisma.InputJsonValue;
    confidence?: number;
    pinned?: boolean;
    tags?: string[];
    status?: "active" | "archived";
}

function normalizeMemoryKey(value: string | null | undefined): string | undefined {
    const key = value?.trim();
    return key || undefined;
}

function withKeyTag(tags: string[] | undefined, key: string | undefined): string[] {
    const existing = tags ?? [];
    if (!key) return existing;
    const keyTag = `memory-key:${key}`;
    return existing.includes(keyTag) ? existing : [...existing, keyTag];
}

function createStudyMemoryData(input: CreateStudyMemoryInput): Prisma.StudyMemoryUncheckedCreateInput {
    const key = normalizeMemoryKey(input.key ?? extractMemoryKeyFromTags(input.tags));
    const tags = withKeyTag(input.tags, key);
    const source = sourceFromTags(tags, input.source ?? "explicit_user");
    return {
        studyId: input.studyId,
        projectId: input.projectId,
        type: input.type,
        key,
        content: input.content,
        category: input.category,
        source,
        authority: input.authority ?? authorityFromSource(source, "inferred"),
        polarity: input.polarity ?? "affirming",
        sourceRefType: input.sourceRefType,
        sourceRefId: input.sourceRefId,
        locator: input.locator,
        confidence: input.confidence,
        tags,
        embeddingStatus: "pending",
    };
}

function updateStudyMemoryData(
    input: UpdateStudyMemoryInput,
    existing: {
        key: string | null;
        tags: string[];
        source: string | null;
        authority: string;
    },
): Prisma.StudyMemoryUncheckedUpdateInput {
    const key = input.key !== undefined ? normalizeMemoryKey(input.key) : normalizeMemoryKey(existing.key);
    const tags = input.tags !== undefined || input.key !== undefined
        ? withKeyTag(input.tags ?? existing.tags, key)
        : undefined;
    const source = input.source !== undefined || input.tags !== undefined
        ? sourceFromTags(tags ?? existing.tags, input.source ?? existing.source)
        : undefined;
    const authority = input.authority !== undefined
        ? normalizeMemoryAuthority(input.authority)
        : source !== undefined
            ? authorityFromSource(source, existing.authority)
            : undefined;
    const data: Prisma.StudyMemoryUncheckedUpdateInput = {
        ...input,
        ...(input.key !== undefined ? { key } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(authority !== undefined ? { authority } : {}),
        ...(input.polarity !== undefined ? { polarity: normalizeMemoryPolarity(input.polarity) } : {}),
        ...(input.status === "archived" ? { archivedAt: new Date() } : {}),
        ...(input.status === "active" ? { archivedAt: null } : {}),
    };

    if (
        input.content !== undefined
        || input.tags !== undefined
        || input.source !== undefined
        || input.authority !== undefined
        || input.polarity !== undefined
        || input.locator !== undefined
    ) {
        data.embeddingStatus = "pending";
    }

    return data;
}

/**
 * Create a study memory
 */
export async function createStudyMemory(input: CreateStudyMemoryInput) {
    return prisma.studyMemory.create({
        data: createStudyMemoryData(input),
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
        authority?: MemoryAuthority;
        tags?: string[];
    }
) {
    return prisma.studyMemory.findMany({
        where: {
            studyId,
            type: options?.type,
            category: options?.category,
            status: options?.status ?? "active",
            authority: options?.authority,
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
 * Get memories for a study only after binding it to the expected project.
 * Use this anywhere the caller is working from project scope.
 */
export async function getStudyMemoriesForProject(
    projectId: string,
    studyId: string,
    options?: Parameters<typeof getStudyMemories>[1],
    db: StudyMemoryDbClient = prisma,
) {
    return db.studyMemory.findMany({
        where: {
            projectId,
            studyId,
            type: options?.type,
            category: options?.category,
            status: options?.status ?? "active",
            authority: options?.authority,
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
        authority?: MemoryAuthority;
        tags?: string[];
    }
) {
    return prisma.studyMemory.findMany({
        where: {
            projectId,
            type: options?.type,
            category: options?.category,
            status: "active",
            authority: options?.authority,
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
    const existing = await prisma.studyMemory.findUnique({
        where: { id },
        select: {
            key: true,
            tags: true,
            source: true,
            authority: true,
        },
    });
    if (!existing) {
        throw new Error("Memory not found");
    }
    return prisma.studyMemory.update({
        where: { id },
        data: updateStudyMemoryData(input, existing),
    });
}

/**
 * Archive a study memory.
 */
export async function archiveStudyMemory(id: string) {
    return prisma.$transaction(async (tx) => {
        await tx.memoryEmbedding.deleteMany({
            where: { memoryType: "study", memoryId: id },
        });
        return tx.studyMemory.update({
            where: { id },
            data: {
                status: "archived",
                archivedAt: new Date(),
                embeddingStatus: "pending",
            },
        });
    });
}

/**
 * Delete a study memory
 */
export async function deleteStudyMemory(id: string) {
    return prisma.$transaction(async (tx) => {
        await tx.memoryEmbedding.deleteMany({
            where: { memoryType: "study", memoryId: id },
        });
        return tx.studyMemory.delete({
            where: { id },
        });
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
    return prisma.$transaction(async (tx) => {
        const matches = await tx.studyMemory.findMany({
            where: {
                studyId,
                tags: { has: tag },
            },
            select: { id: true },
        });
        const ids = matches.map((memory) => memory.id);
        if (ids.length === 0) return 0;
        await tx.memoryEmbedding.deleteMany({
            where: {
                memoryType: "study",
                memoryId: { in: ids },
            },
        });
        const result = await tx.studyMemory.deleteMany({
            where: {
                id: { in: ids },
            },
        });
        return result.count;
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
        data: memories.map(createStudyMemoryData),
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
            source: "deep_analysis",
            authority: "inferred",
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
            source: "deep_analysis",
            authority: "inferred",
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
            source: "deep_analysis",
            authority: "inferred",
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
            source: "deep_analysis",
            authority: "inferred",
            confidence: 0.7,
            tags: ["deep-analysis"],
        });
    }

    if (memories.length > 0) {
        await batchCreateStudyMemories(memories);
    }
}
