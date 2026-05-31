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
    archiveStudyMemory,
    deleteStudyMemory,
    searchStudyMemories,
    batchCreateStudyMemories,
    getStudyMemorySummary,
    type CreateStudyMemoryInput,
    type UpdateStudyMemoryInput,
    type StudyMemoryType,
    type StudyMemoryCategory,

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
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import { cuidSchema } from "@/lib/schemas/ids";
import {
    createUserMemoryInputSchema,
    updateUserMemoryInputSchema,
    getUserMemoriesOptionsSchema,
    createProjectMemoryInputSchema,
    getProjectMemoriesActionInputSchema,
    updateProjectMemoryActionInputSchema,
    searchProjectMemoriesActionInputSchema,
    createStudyMemoryInputSchema,
    getStudyMemoriesActionInputSchema,
    getProjectStudyMemoriesActionInputSchema,
    updateStudyMemoryActionInputSchema,
    searchStudyMemoriesActionInputSchema,
    batchCreateStudyMemoriesActionInputSchema,
    retrieveMemoriesActionInputSchema,
    memoryRetrievalOptionsSchema,
    projectIdInputSchema,
    semanticRolloutStatusInputSchema,
    memoryMaintenanceActionInputSchema,
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
    if (context.citedStudyIds?.length) {
        if (!context.projectId) {
            throw new Error("Context with cited studies requires project scope");
        }
        const uniqueIds = [...new Set(context.citedStudyIds)];
        for (const studyId of uniqueIds) {
            await assertStudyAccess(userId, workspaceId, studyId, context.projectId);
        }
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
    return withValidatedAction(cuidSchema, id,
        (v) => withAuth(async ({ userId }) => {
            await assertUserMemoryAccess(userId, v);
            return archiveUserMemory(v);
        }),
    );
}

export async function deleteUserMemoryAction(id: string) {
    return withValidatedAction(cuidSchema, id,
        (v) => withAuth(async ({ userId }) => {
            await assertUserMemoryAccess(userId, v);
            return deleteUserMemory(v);
        }),
    );
}

export async function searchUserMemoriesAction(query: string) {
    return withValidatedAction(z.string().min(1).max(5000), query,
        (q) => withAuth(({ userId }) => searchUserMemories(userId, q)),
    );
}

// ============================================================================
// PROJECT MEMORY ACTIONS
// ============================================================================

export async function createProjectMemoryAction(input: CreateProjectMemoryInput) {
    return withValidatedAction(createProjectMemoryInputSchema, input,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return createProjectMemory(v as CreateProjectMemoryInput);
        }),
    );
}

export async function getProjectMemoryAction(id: string) {
    return withValidatedAction(cuidSchema, id,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, v);
            return getProjectMemory(v);
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
    return withValidatedAction(getProjectMemoriesActionInputSchema, { projectId, options },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return getProjectMemories(v.projectId, v.options);
        }),
    );
}

export async function updateProjectMemoryAction(
    id: string,
    input: UpdateProjectMemoryInput
) {
    return withValidatedAction(updateProjectMemoryActionInputSchema, { id, input },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, v.id);
            return updateProjectMemory(v.id, v.input as UpdateProjectMemoryInput);
        }),
    );
}

export async function archiveProjectMemoryAction(id: string) {
    return withValidatedAction(cuidSchema, id,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, v);
            return archiveProjectMemory(v);
        }),
    );
}

export async function deleteProjectMemoryAction(id: string) {
    return withValidatedAction(cuidSchema, id,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, v);
            return deleteProjectMemory(v);
        }),
    );
}

export async function searchProjectMemoriesAction(
    projectId: string,
    query: string
) {
    return withValidatedAction(searchProjectMemoriesActionInputSchema, { projectId, query },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return searchProjectMemories(v.projectId, v.query);
        }),
    );
}

export async function getProjectMemoryHistoryAction(id: string) {
    return withValidatedAction(cuidSchema, id,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectMemoryAccess(userId, workspaceId, v);
            return getProjectMemoryHistory(v);
        }),
    );
}

// ============================================================================
// STUDY MEMORY ACTIONS
// ============================================================================

export async function createStudyMemoryAction(input: CreateStudyMemoryInput) {
    return withValidatedAction(createStudyMemoryInputSchema, input,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            await assertStudyAccess(userId, workspaceId, v.studyId, v.projectId);
            return createStudyMemory(v as CreateStudyMemoryInput);
        }),
    );
}

export async function getStudyMemoryAction(id: string) {
    return withValidatedAction(cuidSchema, id,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyMemoryAccess(userId, workspaceId, v);
            return getStudyMemory(v);
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
    return withValidatedAction(getStudyMemoriesActionInputSchema, { studyId, options },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyAccess(userId, workspaceId, v.studyId);
            return getStudyMemories(v.studyId, v.options);
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
    return withValidatedAction(getProjectStudyMemoriesActionInputSchema, { projectId, options },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return getProjectStudyMemories(v.projectId, v.options);
        }),
    );
}

export async function updateStudyMemoryAction(
    id: string,
    input: UpdateStudyMemoryInput
) {
    return withValidatedAction(updateStudyMemoryActionInputSchema, { id, input },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyMemoryAccess(userId, workspaceId, v.id);
            return updateStudyMemory(v.id, v.input as UpdateStudyMemoryInput);
        }),
    );
}

export async function archiveStudyMemoryAction(id: string) {
    return withValidatedAction(cuidSchema, id,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyMemoryAccess(userId, workspaceId, v);
            return archiveStudyMemory(v);
        }),
    );
}

export async function deleteStudyMemoryAction(id: string) {
    return withValidatedAction(cuidSchema, id,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyMemoryAccess(userId, workspaceId, v);
            return deleteStudyMemory(v);
        }),
    );
}

export async function searchStudyMemoriesAction(
    projectId: string,
    query: string,
    options?: { studyId?: string }
) {
    return withValidatedAction(searchStudyMemoriesActionInputSchema, { projectId, query, options },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            if (v.options?.studyId) {
                await assertStudyAccess(userId, workspaceId, v.options.studyId, v.projectId);
            }
            return searchStudyMemories(v.projectId, v.query, v.options);
        }),
    );
}

export async function batchCreateStudyMemoriesAction(
    memories: CreateStudyMemoryInput[]
) {
    return withValidatedAction(batchCreateStudyMemoriesActionInputSchema, memories,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            for (const memory of v) {
                await assertProjectAccess(userId, workspaceId, memory.projectId);
                await assertStudyAccess(userId, workspaceId, memory.studyId, memory.projectId);
            }
            return batchCreateStudyMemories(v as CreateStudyMemoryInput[]);
        }),
    );
}

export async function getStudyMemorySummaryAction(studyId: string) {
    return withValidatedAction(cuidSchema, studyId,
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertStudyAccess(userId, workspaceId, v);
            return getStudyMemorySummary(v);
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
        memoryBudgetTokens?: number;
    }
): Promise<ActionResult<RetrievedMemory[]>> {
    return withValidatedAction(retrieveMemoriesActionInputSchema, { context, options },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertRetrievalContextAccess(userId, workspaceId, v.context as MemoryContext);
            return retrieveMemories({ ...(v.context as MemoryContext), userId }, v.options);
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
    return withValidatedAction(z.object({
        context: retrieveMemoriesActionInputSchema.shape.context,
        options: memoryRetrievalOptionsSchema.pick({
            maxMemories: true,
            minRelevance: true,
            memoryBudgetTokens: true,
        }).optional(),
    }), { context, options },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertRetrievalContextAccess(userId, workspaceId, v.context as MemoryContext);
            return retrieveAndFormatMemories({ ...(v.context as MemoryContext), userId }, v.options);
        }),
    );
}

export async function getMemoryRetrievalStatsAction(projectId: string) {
    return withValidatedAction(projectIdInputSchema, { projectId },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return getMemoryRetrievalStats(v.projectId);
        }),
    );
}

export async function getMemoryQualityMetricsAction(projectId: string) {
    return withValidatedAction(projectIdInputSchema, { projectId },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return getMemoryQualityMetrics(v.projectId, userId);
        }),
    );
}

export async function runMemoryMaintenanceAction(
    projectId: string,
    options?: { dryRun?: boolean },
) {
    return withValidatedAction(memoryMaintenanceActionInputSchema, { projectId, options },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return runMemoryMaintenance({
                projectId: v.projectId,
                userId,
                dryRun: v.options?.dryRun ?? false,
            });
        }),
    );
}

export async function getSemanticRolloutStatusAction(projectId: string) {
    return withValidatedAction(semanticRolloutStatusInputSchema, { projectId },
        (v) => withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return validateSemanticRolloutStatus();
        }),
    );
}

// ============================================================================
// PRISMA STATS ACTIONS
// ============================================================================

export async function getPRISMAStatsAction(projectId: string): Promise<ActionResult<PRISMAStats>> {
    return withValidatedAction(projectIdInputSchema, { projectId },
        (v) =>
        withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(userId, workspaceId, v.projectId);
            return getPRISMAStats(v.projectId);
        }),
    );
}
