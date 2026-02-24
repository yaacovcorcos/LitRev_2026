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
import { withAction, type ActionResult } from "@/lib/server/action-utils";

// ============================================================================
// USER MEMORY ACTIONS
// ============================================================================

export async function setUserMemoryAction(input: CreateUserMemoryInput) {
    return withAction(() => setUserMemory(input));
}

export async function getUserMemoryAction(userId: string, key: string) {
    return withAction(() => getUserMemory(userId, key));
}

export async function getUserMemoriesAction(
    userId: string,
    options?: {
        type?: UserMemoryType;
        status?: UserMemoryStatus;
        tags?: string[];
    }
) {
    return withAction(() => getUserMemories(userId, options));
}

export async function updateUserMemoryAction(
    id: string,
    input: UpdateUserMemoryInput
) {
    return withAction(() => updateUserMemory(id, input));
}

export async function archiveUserMemoryAction(id: string) {
    return withAction(() => archiveUserMemory(id));
}

export async function deleteUserMemoryAction(id: string) {
    return withAction(() => deleteUserMemory(id));
}

export async function searchUserMemoriesAction(userId: string, query: string) {
    return withAction(() => searchUserMemories(userId, query));
}

// ============================================================================
// PROJECT MEMORY ACTIONS
// ============================================================================

export async function createProjectMemoryAction(input: CreateProjectMemoryInput) {
    return withAction(() => createProjectMemory(input));
}

export async function getProjectMemoryAction(id: string) {
    return withAction(() => getProjectMemory(id));
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
    return withAction(() => getProjectMemories(projectId, options));
}

export async function updateProjectMemoryAction(
    id: string,
    input: UpdateProjectMemoryInput
) {
    return withAction(() => updateProjectMemory(id, input));
}

export async function archiveProjectMemoryAction(id: string) {
    return withAction(() => archiveProjectMemory(id));
}

export async function deleteProjectMemoryAction(id: string) {
    return withAction(() => deleteProjectMemory(id));
}

export async function searchProjectMemoriesAction(
    projectId: string,
    query: string
) {
    return withAction(() => searchProjectMemories(projectId, query));
}

export async function getProjectMemoryHistoryAction(id: string) {
    return withAction(() => getProjectMemoryHistory(id));
}

// ============================================================================
// STUDY MEMORY ACTIONS
// ============================================================================

export async function createStudyMemoryAction(input: CreateStudyMemoryInput) {
    return withAction(() => createStudyMemory(input));
}

export async function getStudyMemoryAction(id: string) {
    return withAction(() => getStudyMemory(id));
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
    return withAction(() => getStudyMemories(studyId, options));
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
    return withAction(() => getProjectStudyMemories(projectId, options));
}

export async function updateStudyMemoryAction(
    id: string,
    input: UpdateStudyMemoryInput
) {
    return withAction(() => updateStudyMemory(id, input));
}

export async function deleteStudyMemoryAction(id: string) {
    return withAction(() => deleteStudyMemory(id));
}

export async function searchStudyMemoriesAction(
    projectId: string,
    query: string,
    options?: { studyId?: string }
) {
    return withAction(() => searchStudyMemories(projectId, query, options));
}

export async function batchCreateStudyMemoriesAction(
    memories: CreateStudyMemoryInput[]
) {
    return withAction(() => batchCreateStudyMemories(memories));
}

export async function getStudyMemorySummaryAction(studyId: string) {
    return withAction(() => getStudyMemorySummary(studyId));
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
    return withAction(() => retrieveMemories(context, options));
}

export async function retrieveAndFormatMemoriesAction(
    context: MemoryContext,
    options?: {
        maxMemories?: number;
        minRelevance?: number;
    }
): Promise<ActionResult<string>> {
    return withAction(() => retrieveAndFormatMemories(context, options));
}

export async function getMemoryRetrievalStatsAction(projectId: string) {
    return withAction(() => getMemoryRetrievalStats(projectId));
}

export async function getMemoryQualityMetricsAction(projectId: string, userId: string = "single-user") {
    return withAction(() => getMemoryQualityMetrics(projectId, userId));
}

export async function runMemoryMaintenanceAction(
    projectId: string,
    options?: { userId?: string; dryRun?: boolean },
) {
    return withAction(() => runMemoryMaintenance({
        projectId,
        userId: options?.userId ?? "single-user",
        dryRun: options?.dryRun ?? false,
    }));
}

export async function getSemanticRolloutStatusAction() {
    return withAction(() => validateSemanticRolloutStatus());
}

// ============================================================================
// PRISMA STATS ACTIONS
// ============================================================================

export async function getPRISMAStatsAction(projectId: string): Promise<ActionResult<PRISMAStats>> {
    return withAction(() => getPRISMAStats(projectId));
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
