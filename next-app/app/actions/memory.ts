/**
 * Memory Server Actions
 * Server-side actions for managing user, project, and study memories
 */

"use server";

import {
    // User Memory
    setUserMemory,
    getUserMemory,
    getUserMemories,
    updateUserMemory,
    archiveUserMemory,
    deleteUserMemory,
    searchUserMemories,
    type CreateUserMemoryInput,
    type UpdateUserMemoryInput,
    type UserMemoryType,
    type UserMemoryStatus,

    // Project Memory
    createProjectMemory,
    getProjectMemory,
    getProjectMemories,
    updateProjectMemory,
    archiveProjectMemory,
    deleteProjectMemory,
    searchProjectMemories,
    getProjectMemoryHistory,
    type CreateProjectMemoryInput,
    type UpdateProjectMemoryInput,
    type ProjectMemoryType,
    type ProjectMemoryCategory,
    type ProjectMemoryStatus,
    type ProjectMemoryImportance,

    // Study Memory
    createStudyMemory,
    getStudyMemory,
    getStudyMemories,
    getProjectStudyMemories,
    updateStudyMemory,
    deleteStudyMemory,
    searchStudyMemories,
    batchCreateStudyMemories,
    getStudyMemorySummary,
    type CreateStudyMemoryInput,
    type UpdateStudyMemoryInput,
    type StudyMemoryType,
    type StudyMemoryCategory,
    type StudyMemorySource,

    // Memory Retrieval
    retrieveMemories,
    retrieveAndFormatMemories,
    getMemoryRetrievalStats,
    getMemoryQualityMetrics,
    runMemoryMaintenance,
    validateSemanticRolloutStatus,
    type MemoryContext,
    type RetrievedMemory,

    // PRISMA Stats
    getPRISMAStats,
    type PRISMAStats,
} from "@/lib/server/memory";
import { z } from "zod";
import { withAction, withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import { cuidSchema, projectIdSchema, searchQuerySchema } from "@/lib/schemas/ids";
import {
    createUserMemoryInputSchema,
    updateUserMemoryInputSchema,
    getUserMemoriesOptionsSchema,
    createProjectMemoryInputSchema,
    updateProjectMemoryInputSchema,
    getProjectMemoriesOptionsSchema,
    createStudyMemoryInputSchema,
    updateStudyMemoryInputSchema,
    getStudyMemoriesOptionsSchema,
    getProjectStudyMemoriesOptionsSchema,
    memoryContextSchema,
    memoryRetrievalOptionsSchema,
    searchStudyMemoriesOptionsSchema,
    memoryMaintenanceOptionsSchema,
} from "@/lib/schemas/memory";

async function assertProjectAccess(userId: string, workspaceId: string, projectId: string): Promise<void> {
    const project = await prisma.project.findFirst({
        where: { id: projectId, ownerId: userId, workspaceId },
        select: { id: true },
    });
    if (!project) {
        throw new Error("Project not found or access denied");
    }
}

async function assertStudyAccess(
    userId: string,
    workspaceId: string,
    studyId: string,
    expectedProjectId?: string,
): Promise<{ projectId: string }> {
    const study = await prisma.study.findFirst({
        where: {
            id: studyId,
            ...(expectedProjectId ? { projectId: expectedProjectId } : {}),
            project: { ownerId: userId, workspaceId },
        },
        select: { projectId: true },
    });
    if (!study) {
        throw new Error("Study not found or access denied");
    }
    return { projectId: study.projectId };
}

async function assertUserMemoryAccess(userId: string, id: string): Promise<void> {
    const memory = await prisma.userMemory.findFirst({
        where: { id, userId },
        select: { id: true },
    });
    if (!memory) {
        throw new Error("User memory not found or access denied");
    }
}

async function assertProjectMemoryAccess(
    userId: string,
    workspaceId: string,
    id: string,
): Promise<{ projectId: string }> {
    const memory = await prisma.projectMemory.findFirst({
        where: {
            id,
            project: { ownerId: userId, workspaceId },
        },
        select: { projectId: true },
    });
    if (!memory) {
        throw new Error("Project memory not found or access denied");
    }
    return { projectId: memory.projectId };
}

async function assertStudyMemoryAccess(
    userId: string,
    workspaceId: string,
    id: string,
): Promise<{ projectId: string; studyId: string }> {
    const memory = await prisma.studyMemory.findFirst({
        where: {
            id,
            project: { ownerId: userId, workspaceId },
        },
        select: { projectId: true, studyId: true },
    });
    if (!memory) {
        throw new Error("Study memory not found or access denied");
    }
    return { projectId: memory.projectId, studyId: memory.studyId };
}

async function assertRetrievalContextAccess(
    userId: string,
    workspaceId: string,
    context: MemoryContext,
): Promise<void> {
    if (context.projectId) {
        await assertProjectAccess(userId, workspaceId, context.projectId);
    }
    if (context.studyId) {
        await assertStudyAccess(userId, workspaceId, context.studyId, context.projectId);
    }
}

// ============================================================================
// USER MEMORY ACTIONS
// ============================================================================

export async function setUserMemoryAction(input: CreateUserMemoryInput) {
    return withValidatedAction(createUserMemoryInputSchema, input,
        (v) => withAuth(({ userId }) => setUserMemory({ ...v, userId } as CreateUserMemoryInput)),
    );
}

export async function getUserMemoryAction(key: string) {
    return withValidatedAction(z.string().min(1).max(500), key,
        (k) => withAuth(({ userId }) => getUserMemory(userId, k)),
    );
}

export async function getUserMemoriesAction(
    options?: {
        type?: UserMemoryType;
        status?: UserMemoryStatus;
        tags?: string[];
    }
) {
    return withValidatedAction(getUserMemoriesOptionsSchema.optional(), options,
        (v) => withAuth(({ userId }) => getUserMemories(userId, v)),
    );
}

const updateUserMemoryActionInput = z.object({
    id: cuidSchema,
    input: updateUserMemoryInputSchema,
});

export async function updateUserMemoryAction(
    id: string,
    input: UpdateUserMemoryInput
) {
    return withValidatedAction(updateUserMemoryActionInput, { id, input },
        (v) => withAuth(async ({ userId }) => {
            await assertUserMemoryAccess(userId, v.id);
            return updateUserMemory(v.id, v.input as UpdateUserMemoryInput);
        }),
    );
}

export async function archiveUserMemoryAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId }) => {
            await assertUserMemoryAccess(userId, id);
            return archiveUserMemory(id);
        }),
    );
}

export async function deleteUserMemoryAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId }) => {
            await assertUserMemoryAccess(userId, id);
            return deleteUserMemory(id);
        }),
    );
}

export async function searchUserMemoriesAction(query: string) {
    return withAction(() =>
        withAuth(({ userId }) => searchUserMemories(userId, query)),
    );
}

// ============================================================================
// PROJECT MEMORY ACTIONS
// ============================================================================

export async function createProjectMemoryAction(input: CreateProjectMemoryInput) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, input.projectId);
            return createProjectMemory(input);
        }),
    );
}

export async function getProjectMemoryAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, id);
            return getProjectMemory(id);
        }),
    );
}

export async function getProjectMemoriesAction(
    projectId: string,
    options?: {
        type?: ProjectMemoryType;
        category?: ProjectMemoryCategory;
        status?: ProjectMemoryStatus;
        importance?: ProjectMemoryImportance;
        tags?: string[];
    }
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, projectId);
            return getProjectMemories(projectId, options);
        }),
    );
}

export async function updateProjectMemoryAction(
    id: string,
    input: UpdateProjectMemoryInput
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, id);
            return updateProjectMemory(id, input);
        }),
    );
}

export async function archiveProjectMemoryAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, id);
            return archiveProjectMemory(id);
        }),
    );
}

export async function deleteProjectMemoryAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, id);
            return deleteProjectMemory(id);
        }),
    );
}

export async function searchProjectMemoriesAction(
    projectId: string,
    query: string
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, projectId);
            return searchProjectMemories(projectId, query);
        }),
    );
}

export async function getProjectMemoryHistoryAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, id);
            return getProjectMemoryHistory(id);
        }),
    );
}

// ============================================================================
// STUDY MEMORY ACTIONS
// ============================================================================

export async function createStudyMemoryAction(input: CreateStudyMemoryInput) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, input.projectId);
            await assertStudyAccess(userId, workspaceId, input.studyId, input.projectId);
            return createStudyMemory(input);
        }),
    );
}

export async function getStudyMemoryAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyMemoryAccess(userId, workspaceId, id);
            return getStudyMemory(id);
        }),
    );
}

export async function getStudyMemoriesAction(
    studyId: string,
    options?: {
        type?: StudyMemoryType;
        category?: StudyMemoryCategory;
        status?: string;
        minConfidence?: number;
        tags?: string[];
    }
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyAccess(userId, workspaceId, studyId);
            return getStudyMemories(studyId, options);
        }),
    );
}

export async function getProjectStudyMemoriesAction(
    projectId: string,
    options?: {
        type?: StudyMemoryType;
        category?: StudyMemoryCategory;
        minConfidence?: number;
        tags?: string[];
    }
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, projectId);
            return getProjectStudyMemories(projectId, options);
        }),
    );
}

export async function updateStudyMemoryAction(
    id: string,
    input: UpdateStudyMemoryInput
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyMemoryAccess(userId, workspaceId, id);
            return updateStudyMemory(id, input);
        }),
    );
}

export async function deleteStudyMemoryAction(id: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyMemoryAccess(userId, workspaceId, id);
            return deleteStudyMemory(id);
        }),
    );
}

export async function searchStudyMemoriesAction(
    projectId: string,
    query: string,
    options?: { studyId?: string }
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, projectId);
            if (options?.studyId) {
                await assertStudyAccess(userId, workspaceId, options.studyId, projectId);
            }
            return searchStudyMemories(projectId, query, options);
        }),
    );
}

export async function batchCreateStudyMemoriesAction(
    memories: CreateStudyMemoryInput[]
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            for (const memory of memories) {
                await assertProjectAccess(userId, workspaceId, memory.projectId);
                await assertStudyAccess(userId, workspaceId, memory.studyId, memory.projectId);
            }
            return batchCreateStudyMemories(memories);
        }),
    );
}

export async function getStudyMemorySummaryAction(studyId: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyAccess(userId, workspaceId, studyId);
            return getStudyMemorySummary(studyId);
        }),
    );
}

// ============================================================================
// MEMORY RETRIEVAL ACTIONS
// ============================================================================

export async function retrieveMemoriesAction(
    context: MemoryContext,
    options?: {
        maxMemories?: number;
        minRelevance?: number;
        includeUser?: boolean;
        includeProject?: boolean;
        includeStudy?: boolean;
    }
): Promise<ActionResult<RetrievedMemory[]>> {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertRetrievalContextAccess(userId, workspaceId, context);
            return retrieveMemories({ ...context, userId }, options);
        }),
    );
}

export async function retrieveAndFormatMemoriesAction(
    context: MemoryContext,
    options?: {
        maxMemories?: number;
        minRelevance?: number;
    }
): Promise<ActionResult<string>> {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertRetrievalContextAccess(userId, workspaceId, context);
            return retrieveAndFormatMemories({ ...context, userId }, options);
        }),
    );
}

export async function getMemoryRetrievalStatsAction(projectId: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, projectId);
            return getMemoryRetrievalStats(projectId);
        }),
    );
}

export async function getMemoryQualityMetricsAction(projectId: string) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, projectId);
            return getMemoryQualityMetrics(projectId, userId);
        }),
    );
}

export async function runMemoryMaintenanceAction(
    projectId: string,
    options?: { dryRun?: boolean },
) {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, projectId);
            return runMemoryMaintenance({
                projectId,
                userId,
                dryRun: options?.dryRun ?? false,
            });
        }),
    );
}

export async function getSemanticRolloutStatusAction() {
    return withAction(() =>
        withAuth(async () => validateSemanticRolloutStatus()),
    );
}

// ============================================================================
// PRISMA STATS ACTIONS
// ============================================================================

export async function getPRISMAStatsAction(projectId: string): Promise<ActionResult<PRISMAStats>> {
    return withAction(() =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, projectId);
            return getPRISMAStats(projectId);
        }),
    );
}

// ============================================================================
// EXPORT TYPES FOR CLIENT-SIDE USE
// ============================================================================

export type {
    // User Memory
    CreateUserMemoryInput,
    UpdateUserMemoryInput,
    UserMemoryType,
    UserMemoryStatus,

    // Project Memory
    CreateProjectMemoryInput,
    UpdateProjectMemoryInput,
    ProjectMemoryType,
    ProjectMemoryCategory,
    ProjectMemoryStatus,
    ProjectMemoryImportance,

    // Study Memory
    CreateStudyMemoryInput,
    UpdateStudyMemoryInput,
    StudyMemoryType,
    StudyMemoryCategory,
    StudyMemorySource,

    // Memory Retrieval
    MemoryContext,
    RetrievedMemory,
};
