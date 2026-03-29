/**
 * User Memory Service
 * Manages user-level preferences and styles
 */

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";

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
}

export interface UpdateUserMemoryInput {
    value?: string;
    rationale?: string;
    tags?: string[];
    status?: UserMemoryStatus;
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
        create: {
            userId,
            key,
            ...data,
        },
        update: {
            ...data,
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
        tags?: string[];
    },
    db: UserMemoryDbClient = prisma,
) {
    return db.userMemory.findMany({
        where: {
            userId,
            type: options?.type,
            status: options?.status ?? "active",
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
    return db.userMemory.update({
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
 * Archive a user memory
 */
export async function archiveUserMemory(id: string) {
    return updateUserMemory(id, {
        status: "archived",
    });
}

/**
 * Delete a user memory permanently
 */
export async function deleteUserMemory(id: string) {
    return prisma.userMemory.delete({
        where: { id },
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
