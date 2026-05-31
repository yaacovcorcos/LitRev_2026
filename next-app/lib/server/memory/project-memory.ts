/**
 * Project Memory Service
 * Manages project-level goals, criteria, and decisions
 */

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import {
    authorityFromSource,
    extractMemoryKeyFromTags,
    normalizeMemoryAuthority,
    normalizeMemoryPolarity,
    projectImportanceRank,
    sourceFromTags,
    type MemoryAuthority,
    type MemoryPolarity,
    type MemorySource,
} from "@/lib/memory-contracts";

type ProjectMemoryDbClient = typeof prisma | Prisma.TransactionClient;

export type ProjectMemoryType = "decision" | "definition" | "criterion" | "goal";
export type ProjectMemoryCategory = "inclusion" | "exclusion" | "outcome" | "population" | "intervention" | "comparison";
export type ProjectMemoryStatus = "active" | "revised" | "archived";
export type ProjectMemoryImportance = "critical" | "important" | "normal";

export interface CreateProjectMemoryInput {
    projectId: string;
    type: ProjectMemoryType;
    key?: string;
    statement: string;
    category?: ProjectMemoryCategory;
    rationale?: string;
    context?: string;
    tags?: string[];
    importance?: ProjectMemoryImportance;
    source?: MemorySource;
    authority?: MemoryAuthority;
    polarity?: MemoryPolarity;
    sourceRefType?: string;
    sourceRefId?: string;
    confidence?: number;
    pinned?: boolean;
}

export interface UpdateProjectMemoryInput {
    key?: string;
    statement?: string;
    rationale?: string;
    context?: string;
    tags?: string[];
    importance?: ProjectMemoryImportance;
    status?: ProjectMemoryStatus;
    source?: MemorySource;
    authority?: MemoryAuthority;
    polarity?: MemoryPolarity;
    sourceRefType?: string;
    sourceRefId?: string;
    confidence?: number;
    pinned?: boolean;
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

function createProjectMemoryData(input: CreateProjectMemoryInput): Prisma.ProjectMemoryUncheckedCreateInput {
    const key = normalizeMemoryKey(input.key ?? extractMemoryKeyFromTags(input.tags));
    const tags = withKeyTag(input.tags, key);
    const source = sourceFromTags(tags, input.source ?? "explicit_user");
    const authority = input.authority ?? authorityFromSource(source);
    const importance = input.importance ?? "normal";

    return {
        projectId: input.projectId,
        type: input.type,
        key,
        statement: input.statement,
        category: input.category,
        rationale: input.rationale,
        context: input.context,
        tags,
        importance,
        importanceRank: projectImportanceRank(importance),
        source,
        authority,
        polarity: input.polarity ?? "affirming",
        sourceRefType: input.sourceRefType,
        sourceRefId: input.sourceRefId,
        confidence: input.confidence ?? 1,
        pinned: input.pinned ?? false,
        embeddingStatus: "pending",
    };
}

function updateProjectMemoryData(
    input: UpdateProjectMemoryInput,
    existing: {
        key: string | null;
        tags: string[];
        source: string;
        authority: string;
    },
): Prisma.ProjectMemoryUncheckedUpdateInput {
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
    const data: Prisma.ProjectMemoryUncheckedUpdateInput = {
        ...input,
        ...(input.key !== undefined ? { key } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(input.importance !== undefined ? { importanceRank: projectImportanceRank(input.importance) } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(authority !== undefined ? { authority } : {}),
        ...(input.polarity !== undefined ? { polarity: normalizeMemoryPolarity(input.polarity) } : {}),
        ...(input.status === "archived" ? { archivedAt: new Date() } : {}),
    };

    if (
        input.statement !== undefined
        || input.rationale !== undefined
        || input.context !== undefined
        || input.tags !== undefined
        || input.source !== undefined
        || input.authority !== undefined
        || input.polarity !== undefined
    ) {
        data.embeddingStatus = "pending";
    }

    return data;
}

/**
 * Create a project memory
 */
export async function createProjectMemory(input: CreateProjectMemoryInput) {
    return createProjectMemoryWithDb(prisma, input);
}

export async function createProjectMemoryWithDb(
    db: ProjectMemoryDbClient,
    input: CreateProjectMemoryInput,
) {
    return db.projectMemory.create({
        data: createProjectMemoryData(input),
    });
}

/**
 * Get a specific project memory
 */
export async function getProjectMemory(id: string) {
    return prisma.projectMemory.findUnique({
        where: { id },
    });
}

/**
 * Get all memories for a project
 */
export async function getProjectMemories(
    projectId: string,
    options?: {
        type?: ProjectMemoryType;
        category?: ProjectMemoryCategory;
        status?: ProjectMemoryStatus;
        importance?: ProjectMemoryImportance;
        authority?: MemoryAuthority;
        tags?: string[];
    },
    db: ProjectMemoryDbClient = prisma,
) {
    return db.projectMemory.findMany({
        where: {
            projectId,
            type: options?.type,
            category: options?.category,
            status: options?.status ?? "active",
            importance: options?.importance,
            authority: options?.authority,
            ...(options?.tags?.length
                ? { tags: { hasSome: options.tags } }
                : {}),
        },
        orderBy: [
            { importanceRank: "desc" },
            { updatedAt: "desc" },
        ],
    });
}

/**
 * Update a project memory (creates new version if revised)
 */
export async function updateProjectMemory(
    id: string,
    input: UpdateProjectMemoryInput,
    db: ProjectMemoryDbClient = prisma,
) {
    if (db === prisma) {
        return prisma.$transaction((tx) => updateProjectMemoryInDb(tx, id, input));
    }

    return updateProjectMemoryInDb(db, id, input);
}

async function updateProjectMemoryInDb(
    db: ProjectMemoryDbClient,
    id: string,
    input: UpdateProjectMemoryInput,
) {
    const existing = await db.projectMemory.findUnique({
        where: { id },
    });

    if (!existing) {
        throw new Error("Memory not found");
    }

    // If statement changed and status is active, create new version
    if (input.statement && input.statement !== existing.statement && existing.status === "active") {
        const newKey = normalizeMemoryKey(input.key ?? existing.key ?? extractMemoryKeyFromTags(existing.tags));
        const newTags = withKeyTag(input.tags ?? existing.tags, newKey);
        const source = sourceFromTags(newTags, input.source ?? existing.source);
        const importance = input.importance ?? (existing.importance as ProjectMemoryImportance);
        const created = await db.projectMemory.create({
            data: createProjectMemoryData({
                projectId: existing.projectId,
                type: existing.type as ProjectMemoryType,
                key: newKey,
                category: existing.category as ProjectMemoryCategory | undefined,
                statement: input.statement,
                rationale: input.rationale ?? existing.rationale ?? undefined,
                context: input.context ?? existing.context ?? undefined,
                tags: newTags,
                importance,
                source,
                authority: input.authority ?? normalizeMemoryAuthority(existing.authority),
                polarity: input.polarity ?? normalizeMemoryPolarity(existing.polarity),
                sourceRefType: input.sourceRefType ?? existing.sourceRefType ?? undefined,
                sourceRefId: input.sourceRefId ?? existing.sourceRefId ?? undefined,
                confidence: input.confidence ?? existing.confidence,
                pinned: input.pinned ?? existing.pinned,
            }),
        });

        await db.memoryEmbedding.deleteMany({
            where: { memoryType: "project", memoryId: id },
        });

        await db.projectMemory.update({
            where: { id },
            data: {
                status: "revised",
                supersededBy: created.id,
                embeddingStatus: "pending",
            },
        });

        return db.projectMemory.update({
            where: { id: created.id },
            data: {
                version: existing.version + 1,
            },
        });
    }

    // Otherwise just update in place
    return db.projectMemory.update({
        where: { id },
        data: updateProjectMemoryData(input, existing),
    });
}

/**
 * Archive a project memory
 */
export async function archiveProjectMemory(id: string) {
    return archiveProjectMemoryWithDb(prisma, id);
}

export async function archiveProjectMemoryWithDb(
    db: ProjectMemoryDbClient,
    id: string,
) {
    const run = async (client: ProjectMemoryDbClient) => {
        await client.memoryEmbedding.deleteMany({
            where: { memoryType: "project", memoryId: id },
        });
        return client.projectMemory.update({
            where: { id },
            data: {
                status: "archived",
                archivedAt: new Date(),
                embeddingStatus: "pending",
            },
        });
    };
    if (db === prisma) {
        return prisma.$transaction((tx) => run(tx));
    }
    return run(db);
}

/**
 * Delete a project memory permanently
 */
export async function deleteProjectMemory(id: string) {
    return prisma.$transaction(async (tx) => {
        await tx.memoryEmbedding.deleteMany({
            where: { memoryType: "project", memoryId: id },
        });
        return tx.projectMemory.delete({
            where: { id },
        });
    });
}

/**
 * Search project memories
 */
export async function searchProjectMemories(projectId: string, query: string) {
    const lowerQuery = query.toLowerCase();

    return prisma.projectMemory.findMany({
        where: {
            projectId,
            status: "active",
            OR: [
                { statement: { contains: lowerQuery, mode: "insensitive" } },
                { rationale: { contains: lowerQuery, mode: "insensitive" } },
                { context: { contains: lowerQuery, mode: "insensitive" } },
            ],
        },
        orderBy: [
            { importanceRank: "desc" },
            { updatedAt: "desc" },
        ],
    });
}

/**
 * Get memory version history
 */
export async function getProjectMemoryHistory(id: string) {
    const memory = await prisma.projectMemory.findUnique({
        where: { id },
    });

    if (!memory) return [];

    const key = normalizeMemoryKey(memory.key ?? extractMemoryKeyFromTags(memory.tags));
    if (key) {
        return prisma.projectMemory.findMany({
            where: {
                projectId: memory.projectId,
                key,
            },
            orderBy: { version: "desc" },
        });
    }

    // Find direct neighbors in the version chain. New rows are pointed to by
    // older rows through supersededBy, so include both directions.
    return prisma.projectMemory.findMany({
        where: {
            projectId: memory.projectId,
            type: memory.type,
            OR: [
                { id },
                { supersededBy: id },
                ...(memory.supersededBy ? [{ id: memory.supersededBy }] : []),
            ],
        },
        orderBy: { version: "desc" },
    });
}
