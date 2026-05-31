/**
 * User Memory Service
 * Manages user-level preferences and styles
 */

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import {
    authorityFromSource,
    normalizeMemoryAuthority,
    normalizeMemoryPolarity,
    sourceFromTags,
    type MemoryAuthority,
    type MemoryPolarity,
    type MemorySource,
} from "@/lib/memory-contracts";

type UserMemoryDbClient = typeof prisma | Prisma.TransactionClient;

export type UserMemoryType = "preference" | "style" | "workflow";
export type UserMemoryStatus = "active" | "archived";

export interface CreateUserMemoryInput {
    userId: string;
    type: UserMemoryType;
    key: string;
    value: string;
    rationale?: string;
    tags?: string[];
    source?: MemorySource;
    authority?: MemoryAuthority;
    polarity?: MemoryPolarity;
    sourceRefType?: string;
    sourceRefId?: string;
    confidence?: number;
    pinned?: boolean;
}

export interface UpdateUserMemoryInput {
    value?: string;
    rationale?: string;
    tags?: string[];
    status?: UserMemoryStatus;
    source?: MemorySource;
    authority?: MemoryAuthority;
    polarity?: MemoryPolarity;
    sourceRefType?: string;
    sourceRefId?: string;
    confidence?: number;
    pinned?: boolean;
}

function createUserMemoryData(input: CreateUserMemoryInput) {
    const source = sourceFromTags(input.tags, input.source ?? "explicit_user");
    return {
        ...input,
        source,
        authority: input.authority ?? authorityFromSource(source, "confirmed"),
        polarity: input.polarity ?? "affirming",
        confidence: input.confidence ?? 1,
        pinned: input.pinned ?? false,
        embeddingStatus: "pending",
    };
}

function updateUserMemoryData(
    input: UpdateUserMemoryInput,
    fallback?: {
        source?: string | null;
        authority?: string | null;
    },
) {
    const source = input.source !== undefined || input.tags !== undefined
        ? sourceFromTags(input.tags, input.source ?? fallback?.source ?? "explicit_user")
        : undefined;
    const authority = input.authority !== undefined
        ? normalizeMemoryAuthority(input.authority)
        : source !== undefined
            ? authorityFromSource(source, fallback?.authority ?? "confirmed")
            : undefined;
    const data: Prisma.UserMemoryUncheckedUpdateInput = {
        ...input,
        ...(source !== undefined ? { source } : {}),
        ...(authority !== undefined ? { authority } : {}),
        ...(input.polarity !== undefined ? { polarity: normalizeMemoryPolarity(input.polarity) } : {}),
        ...(input.status === "archived" ? { archivedAt: new Date() } : {}),
        ...(input.status === "active" ? { archivedAt: null } : {}),
    };

    if (
        input.value !== undefined
        || input.rationale !== undefined
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
 * Create or update a user memory
 */
export async function setUserMemory(input: CreateUserMemoryInput) {
    return setUserMemoryWithDb(prisma, input);
}

export async function setUserMemoryWithDb(
    db: UserMemoryDbClient,
    input: CreateUserMemoryInput,
) {
    const { userId, key, ...data } = input;

    return db.userMemory.upsert({
        where: {
            userId_key: { userId, key },
        },
        create: createUserMemoryData({ userId, key, ...data }),
        update: {
            ...updateUserMemoryData(data),
            status: "active",
            archivedAt: null,
            updatedAt: new Date(),
        },
    });
}

/**
 * Get a specific user memory by key
 */
export async function getUserMemory(userId: string, key: string) {
    return prisma.userMemory.findUnique({
        where: {
            userId_key: { userId, key },
        },
    });
}

/**
 * Get all active memories for a user
 */
export async function getUserMemories(
    userId: string,
    options?: {
        type?: UserMemoryType;
        status?: UserMemoryStatus;
        authority?: MemoryAuthority;
        tags?: string[];
    },
    db: UserMemoryDbClient = prisma,
) {
    return db.userMemory.findMany({
        where: {
            userId,
            type: options?.type,
            status: options?.status ?? "active",
            authority: options?.authority,
            ...(options?.tags?.length
                ? { tags: { hasSome: options.tags } }
                : {}),
        },
        orderBy: { updatedAt: "desc" },
    });
}

/**
 * Update a user memory
 */
export async function updateUserMemory(
    id: string,
    input: UpdateUserMemoryInput,
    db: UserMemoryDbClient = prisma,
) {
    const existing = await db.userMemory.findUnique({
        where: { id },
        select: {
            source: true,
            authority: true,
        },
    });
    if (!existing) {
        throw new Error("Memory not found");
    }
    return db.userMemory.update({
        where: { id },
        data: updateUserMemoryData(input, existing),
    });
}

/**
 * Archive a user memory
 */
export async function archiveUserMemory(id: string) {
    return prisma.$transaction(async (tx) => {
        await tx.memoryEmbedding.deleteMany({
            where: { memoryType: "user", memoryId: id },
        });
        return updateUserMemory(id, {
            status: "archived",
        }, tx);
    });
}

/**
 * Delete a user memory permanently
 */
export async function deleteUserMemory(id: string) {
    return prisma.$transaction(async (tx) => {
        await tx.memoryEmbedding.deleteMany({
            where: { memoryType: "user", memoryId: id },
        });
        return tx.userMemory.delete({
            where: { id },
        });
    });
}

/**
 * Search user memories by query string
 */
export async function searchUserMemories(userId: string, query: string) {
    const lowerQuery = query.toLowerCase();

    return prisma.userMemory.findMany({
        where: {
            userId,
            status: "active",
            OR: [
                { key: { contains: lowerQuery, mode: "insensitive" } },
                { value: { contains: lowerQuery, mode: "insensitive" } },
                { rationale: { contains: lowerQuery, mode: "insensitive" } },
            ],
        },
        orderBy: { updatedAt: "desc" },
    });
}
