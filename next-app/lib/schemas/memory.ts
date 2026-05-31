import { z } from "zod";
import { cuidSchema, tagsSchema } from "./ids";
import {
    EMBEDDING_STATUS_VALUES,
    MEMORY_AUTHORITY_VALUES,
    MEMORY_POLARITY_VALUES,
    MEMORY_SOURCE_VALUES,
} from "@/lib/memory-contracts";

export const memoryAuthoritySchema = z.enum(MEMORY_AUTHORITY_VALUES);
export const memoryPolaritySchema = z.enum(MEMORY_POLARITY_VALUES);
export const memorySourceSchema = z.enum(MEMORY_SOURCE_VALUES);
export const embeddingStatusSchema = z.enum(EMBEDDING_STATUS_VALUES);

const sourceRefTypeSchema = z.enum(["artifact", "conversation", "protocol", "study", "note", "system"]).optional();
const sourceRefIdSchema = z.string().min(1).max(500).optional();

// ── User Memory ──────────────────────────────────────────────────────────────

export const userMemoryTypeSchema = z.enum(["preference", "style", "workflow"]);
export const userMemoryStatusSchema = z.enum(["active", "archived"]);
export type UserMemoryType = z.infer<typeof userMemoryTypeSchema>;
export type UserMemoryStatus = z.infer<typeof userMemoryStatusSchema>;

export const createUserMemoryInputSchema = z.object({
    type: userMemoryTypeSchema,
    key: z.string().min(1).max(500),
    value: z.string().min(1).max(10_000),
    rationale: z.string().max(5000).optional(),
    tags: tagsSchema.optional(),
    source: memorySourceSchema.optional(),
    authority: memoryAuthoritySchema.optional(),
    polarity: memoryPolaritySchema.optional(),
    sourceRefType: sourceRefTypeSchema,
    sourceRefId: sourceRefIdSchema,
    confidence: z.number().min(0).max(1).optional(),
    pinned: z.boolean().optional(),
});
export type CreateUserMemoryInput = z.infer<typeof createUserMemoryInputSchema>;

export const updateUserMemoryInputSchema = z.object({
    value: z.string().min(1).max(10_000).optional(),
    rationale: z.string().max(5000).optional(),
    tags: tagsSchema.optional(),
    status: userMemoryStatusSchema.optional(),
    source: memorySourceSchema.optional(),
    authority: memoryAuthoritySchema.optional(),
    polarity: memoryPolaritySchema.optional(),
    sourceRefType: sourceRefTypeSchema,
    sourceRefId: sourceRefIdSchema,
    confidence: z.number().min(0).max(1).optional(),
    pinned: z.boolean().optional(),
});
export type UpdateUserMemoryInput = z.infer<typeof updateUserMemoryInputSchema>;

export const getUserMemoriesOptionsSchema = z.object({
    type: userMemoryTypeSchema.optional(),
    status: userMemoryStatusSchema.optional(),
    authority: memoryAuthoritySchema.optional(),
    tags: z.array(z.string()).optional(),
});

// ── Project Memory ───────────────────────────────────────────────────────────

export const projectMemoryTypeSchema = z.enum(["decision", "definition", "criterion", "goal"]);
export const projectMemoryCategorySchema = z.enum(["inclusion", "exclusion", "outcome", "population", "intervention", "comparison"]);
export const projectMemoryStatusSchema = z.enum(["active", "revised", "archived"]);
export const projectMemoryImportanceSchema = z.enum(["critical", "important", "normal"]);
export type ProjectMemoryType = z.infer<typeof projectMemoryTypeSchema>;
export type ProjectMemoryCategory = z.infer<typeof projectMemoryCategorySchema>;
export type ProjectMemoryStatus = z.infer<typeof projectMemoryStatusSchema>;
export type ProjectMemoryImportance = z.infer<typeof projectMemoryImportanceSchema>;

export const createProjectMemoryInputSchema = z.object({
    projectId: cuidSchema,
    type: projectMemoryTypeSchema,
    key: z.string().min(1).max(500).optional(),
    statement: z.string().min(1).max(10_000),
    category: projectMemoryCategorySchema.optional(),
    rationale: z.string().max(5000).optional(),
    context: z.string().max(10_000).optional(),
    tags: tagsSchema.optional(),
    importance: projectMemoryImportanceSchema.optional(),
    source: memorySourceSchema.optional(),
    authority: memoryAuthoritySchema.optional(),
    polarity: memoryPolaritySchema.optional(),
    sourceRefType: sourceRefTypeSchema,
    sourceRefId: sourceRefIdSchema,
    confidence: z.number().min(0).max(1).optional(),
    pinned: z.boolean().optional(),
});
export type CreateProjectMemoryInput = z.infer<typeof createProjectMemoryInputSchema>;

export const updateProjectMemoryInputSchema = z.object({
    key: z.string().min(1).max(500).optional(),
    statement: z.string().min(1).max(10_000).optional(),
    rationale: z.string().max(5000).optional(),
    context: z.string().max(10_000).optional(),
    tags: tagsSchema.optional(),
    importance: projectMemoryImportanceSchema.optional(),
    status: projectMemoryStatusSchema.optional(),
    source: memorySourceSchema.optional(),
    authority: memoryAuthoritySchema.optional(),
    polarity: memoryPolaritySchema.optional(),
    sourceRefType: sourceRefTypeSchema,
    sourceRefId: sourceRefIdSchema,
    confidence: z.number().min(0).max(1).optional(),
    pinned: z.boolean().optional(),
});
export type UpdateProjectMemoryInput = z.infer<typeof updateProjectMemoryInputSchema>;

export const getProjectMemoriesOptionsSchema = z.object({
    type: projectMemoryTypeSchema.optional(),
    category: projectMemoryCategorySchema.optional(),
    status: projectMemoryStatusSchema.optional(),
    importance: projectMemoryImportanceSchema.optional(),
    authority: memoryAuthoritySchema.optional(),
    tags: z.array(z.string()).optional(),
});

// ── Study Memory ─────────────────────────────────────────────────────────────

export const studyMemoryTypeSchema = z.enum(["summary", "finding", "limitation", "quality", "methods", "results"]);
export const studyMemoryCategorySchema = z.enum(["methods", "results", "bias", "population", "intervention", "outcomes"]);
export const studyMemorySourceSchema = memorySourceSchema;
export type StudyMemoryType = z.infer<typeof studyMemoryTypeSchema>;
export type StudyMemoryCategory = z.infer<typeof studyMemoryCategorySchema>;
export type StudyMemorySource = z.infer<typeof studyMemorySourceSchema>;

export const createStudyMemoryInputSchema = z.object({
    studyId: cuidSchema,
    projectId: cuidSchema,
    type: studyMemoryTypeSchema,
    key: z.string().min(1).max(500).optional(),
    content: z.string().min(1).max(50_000),
    category: studyMemoryCategorySchema.optional(),
    source: studyMemorySourceSchema.optional(),
    authority: memoryAuthoritySchema.optional(),
    polarity: memoryPolaritySchema.optional(),
    sourceRefType: sourceRefTypeSchema,
    sourceRefId: sourceRefIdSchema,
    locator: z.record(z.string(), z.unknown()).optional(),
    confidence: z.number().min(0).max(1).optional(),
    tags: tagsSchema.optional(),
});
export type CreateStudyMemoryInput = z.infer<typeof createStudyMemoryInputSchema>;

export const updateStudyMemoryInputSchema = z.object({
    key: z.string().min(1).max(500).optional(),
    content: z.string().min(1).max(50_000).optional(),
    category: studyMemoryCategorySchema.optional(),
    source: studyMemorySourceSchema.optional(),
    authority: memoryAuthoritySchema.optional(),
    polarity: memoryPolaritySchema.optional(),
    sourceRefType: sourceRefTypeSchema,
    sourceRefId: sourceRefIdSchema,
    locator: z.record(z.string(), z.unknown()).optional(),
    confidence: z.number().min(0).max(1).optional(),
    tags: tagsSchema.optional(),
    status: z.enum(["active", "archived"]).optional(),
});
export type UpdateStudyMemoryInput = z.infer<typeof updateStudyMemoryInputSchema>;

export const getStudyMemoriesOptionsSchema = z.object({
    type: studyMemoryTypeSchema.optional(),
    category: studyMemoryCategorySchema.optional(),
    status: z.string().max(50).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    authority: memoryAuthoritySchema.optional(),
    tags: z.array(z.string()).optional(),
});

export const getProjectStudyMemoriesOptionsSchema = z.object({
    type: studyMemoryTypeSchema.optional(),
    category: studyMemoryCategorySchema.optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    authority: memoryAuthoritySchema.optional(),
    tags: z.array(z.string()).optional(),
});

// ── Memory Retrieval ─────────────────────────────────────────────────────────

export const agentModeSchema = z.enum(["protocol", "scoping", "search", "screening", "drafting", "qa", "general"]);

export const memoryContextSchema = z.object({
    userId: z.string().min(1).optional(),
    projectId: cuidSchema.optional(),
    studyId: cuidSchema.optional(),
    conversationId: cuidSchema.optional(),
    query: z.string().max(5000).optional(),
    agentMode: agentModeSchema.optional(),
    citedStudyIds: z.array(cuidSchema).max(500).optional(),
    runId: cuidSchema.optional(),
});
export type MemoryContext = z.infer<typeof memoryContextSchema>;

export const memoryRetrievalOptionsSchema = z.object({
    maxMemories: z.number().int().min(1).max(500).optional(),
    minRelevance: z.number().min(0).max(1).optional(),
    includeUser: z.boolean().optional(),
    includeProject: z.boolean().optional(),
    includeStudy: z.boolean().optional(),
    memoryBudgetTokens: z.number().int().min(1).max(50_000).optional(),
});

export const searchStudyMemoriesOptionsSchema = z.object({
    studyId: cuidSchema.optional(),
});

export const memoryMaintenanceOptionsSchema = z.object({
    dryRun: z.boolean().optional(),
});

export const idInputSchema = z.object({ id: cuidSchema });
export const projectIdInputSchema = z.object({ projectId: cuidSchema });
export const studyIdInputSchema = z.object({ studyId: cuidSchema });

export const getProjectMemoriesActionInputSchema = z.object({
    projectId: cuidSchema,
    options: getProjectMemoriesOptionsSchema.optional(),
});

export const updateProjectMemoryActionInputSchema = z.object({
    id: cuidSchema,
    input: updateProjectMemoryInputSchema,
});

export const searchProjectMemoriesActionInputSchema = z.object({
    projectId: cuidSchema,
    query: z.string().min(1).max(5000),
});

export const getStudyMemoriesActionInputSchema = z.object({
    studyId: cuidSchema,
    options: getStudyMemoriesOptionsSchema.optional(),
});

export const getProjectStudyMemoriesActionInputSchema = z.object({
    projectId: cuidSchema,
    options: getProjectStudyMemoriesOptionsSchema.optional(),
});

export const updateStudyMemoryActionInputSchema = z.object({
    id: cuidSchema,
    input: updateStudyMemoryInputSchema,
});

export const searchStudyMemoriesActionInputSchema = z.object({
    projectId: cuidSchema,
    query: z.string().min(1).max(5000),
    options: searchStudyMemoriesOptionsSchema.optional(),
});

export const batchCreateStudyMemoriesActionInputSchema = z.array(createStudyMemoryInputSchema).min(1).max(500);

export const retrieveMemoriesActionInputSchema = z.object({
    context: memoryContextSchema,
    options: memoryRetrievalOptionsSchema.optional(),
});

export const semanticRolloutStatusInputSchema = z.object({
    projectId: cuidSchema,
});

export const memoryMaintenanceActionInputSchema = z.object({
    projectId: cuidSchema,
    options: memoryMaintenanceOptionsSchema.optional(),
});
