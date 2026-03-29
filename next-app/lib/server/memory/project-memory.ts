/**
 * Project Memory Service
 * Manages project-level goals, criteria, and decisions
 */

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";

type ProjectMemoryDbClient = typeof prisma | Prisma.TransactionClient;

export type ProjectMemoryType = "decision" | "definition" | "criterion" | "goal";
export type ProjectMemoryCategory = "inclusion" | "exclusion" | "outcome" | "population" | "intervention" | "comparison";
export type ProjectMemoryStatus = "active" | "revised" | "archived";
export type ProjectMemoryImportance = "critical" | "important" | "normal";

export interface CreateProjectMemoryInput {
    projectId: string;
    type: ProjectMemoryType;
    statement: string;
    category?: ProjectMemoryCategory;
    rationale?: string;
    context?: string;
    tags?: string[];
    importance?: ProjectMemoryImportance;
}

export interface UpdateProjectMemoryInput {
    statement?: string;
    rationale?: string;
    context?: string;
    tags?: string[];
    importance?: ProjectMemoryImportance;
    status?: ProjectMemoryStatus;
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
        data: input,
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
            ...(options?.tags?.length
                ? { tags: { hasSome: options.tags } }
                : {}),
        },
        orderBy: [
            { importance: "desc" },
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
    const existing = await db.projectMemory.findUnique({
        where: { id },
    });

    if (!existing) {
        throw new Error("Memory not found");
    }

    // If statement changed and status is active, create new version
    if (input.statement && input.statement !== existing.statement && existing.status === "active") {
        // Mark old version as revised
        await db.projectMemory.update({
            where: { id },
            data: { status: "revised" },
        });

        // Create new version
        return db.projectMemory.create({
            data: {
                projectId: existing.projectId,
                type: existing.type,
                category: existing.category,
                statement: input.statement,
                rationale: input.rationale ?? existing.rationale,
                context: input.context ?? existing.context,
                tags: input.tags ?? existing.tags,
                importance: input.importance ?? existing.importance,
                version: existing.version + 1,
                supersededBy: existing.id,
            },
        });
    }

    // Otherwise just update in place
    return db.projectMemory.update({
        where: { id },
        data: {
            ...input,
            ...(input.status === "archived"
                ? { archivedAt: new Date() }
                : {}),
        },
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
    return db.projectMemory.update({
        where: { id },
        data: {
            status: "archived",
            archivedAt: new Date(),
        },
    });
}

/**
 * Delete a project memory permanently
 */
export async function deleteProjectMemory(id: string) {
    return prisma.projectMemory.delete({
        where: { id },
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
            { importance: "desc" },
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

    // Find all versions in the chain
    return prisma.projectMemory.findMany({
        where: {
            projectId: memory.projectId,
            type: memory.type,
            OR: [
                { id },
                { supersededBy: id },
            ],
        },
        orderBy: { version: "desc" },
    });
}
