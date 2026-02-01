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
    type MemoryContext,
    type RetrievedMemory,
} from "@/lib/server/memory";

// ============================================================================
// USER MEMORY ACTIONS
// ============================================================================

export async function setUserMemoryAction(input: CreateUserMemoryInput) {
    return setUserMemory(input);
}

export async function getUserMemoryAction(userId: string, key: string) {
    return getUserMemory(userId, key);
}

export async function getUserMemoriesAction(
    userId: string,
    options?: {
        type?: UserMemoryType;
        status?: UserMemoryStatus;
        tags?: string[];
    }
) {
    return getUserMemories(userId, options);
}

export async function updateUserMemoryAction(
    id: string,
    input: UpdateUserMemoryInput
) {
    return updateUserMemory(id, input);
}

export async function archiveUserMemoryAction(id: string) {
    return archiveUserMemory(id);
}

export async function deleteUserMemoryAction(id: string) {
    return deleteUserMemory(id);
}

export async function searchUserMemoriesAction(userId: string, query: string) {
    return searchUserMemories(userId, query);
}

// ============================================================================
// PROJECT MEMORY ACTIONS
// ============================================================================

export async function createProjectMemoryAction(input: CreateProjectMemoryInput) {
    return createProjectMemory(input);
}

export async function getProjectMemoryAction(id: string) {
    return getProjectMemory(id);
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
    return getProjectMemories(projectId, options);
}

export async function updateProjectMemoryAction(
    id: string,
    input: UpdateProjectMemoryInput
) {
    return updateProjectMemory(id, input);
}

export async function archiveProjectMemoryAction(id: string) {
    return archiveProjectMemory(id);
}

export async function deleteProjectMemoryAction(id: string) {
    return deleteProjectMemory(id);
}

export async function searchProjectMemoriesAction(
    projectId: string,
    query: string
) {
    return searchProjectMemories(projectId, query);
}

export async function getProjectMemoryHistoryAction(id: string) {
    return getProjectMemoryHistory(id);
}

// ============================================================================
// STUDY MEMORY ACTIONS
// ============================================================================

export async function createStudyMemoryAction(input: CreateStudyMemoryInput) {
    return createStudyMemory(input);
}

export async function getStudyMemoryAction(id: string) {
    return getStudyMemory(id);
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
    return getStudyMemories(studyId, options);
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
    return getProjectStudyMemories(projectId, options);
}

export async function updateStudyMemoryAction(
    id: string,
    input: UpdateStudyMemoryInput
) {
    return updateStudyMemory(id, input);
}

export async function deleteStudyMemoryAction(id: string) {
    return deleteStudyMemory(id);
}

export async function searchStudyMemoriesAction(
    projectId: string,
    query: string,
    options?: { studyId?: string }
) {
    return searchStudyMemories(projectId, query, options);
}

export async function batchCreateStudyMemoriesAction(
    memories: CreateStudyMemoryInput[]
) {
    return batchCreateStudyMemories(memories);
}

export async function getStudyMemorySummaryAction(studyId: string) {
    return getStudyMemorySummary(studyId);
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
): Promise<RetrievedMemory[]> {
    return retrieveMemories(context, options);
}

export async function retrieveAndFormatMemoriesAction(
    context: MemoryContext,
    options?: {
        maxMemories?: number;
        minRelevance?: number;
    }
): Promise<string> {
    return retrieveAndFormatMemories(context, options);
}

export async function getMemoryRetrievalStatsAction(projectId: string) {
    return getMemoryRetrievalStats(projectId);
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
