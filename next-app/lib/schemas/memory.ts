import { z } from "zod";
import { cuidSchema, tagsSchema } from "./ids";

// ── User Memory ──────────────────────────────────────────────────────────────

export const userMemoryTypeSchema = z.enum(["preference", "style", "workflow"]);
export const userMemoryStatusSchema = z.enum(["active", "archived"]);

export const createUserMemoryInputSchema = z.object({
    type: userMemoryTypeSchema,
    key: z.string().min(1).max(500),
    value: z.string().min(1).max(10_000),
    rationale: z.string().max(5000).optional(),
    tags: tagsSchema.optional(),
});

export const updateUserMemoryInputSchema = z.object({
    value: z.string().min(1).max(10_000).optional(),
    rationale: z.string().max(5000).optional(),
    tags: tagsSchema.optional(),
    status: userMemoryStatusSchema.optional(),
});

export const getUserMemoriesOptionsSchema = z.object({
    type: userMemoryTypeSchema.optional(),
    status: userMemoryStatusSchema.optional(),
    tags: z.array(z.string()).optional(),
});

// ── Project Memory ───────────────────────────────────────────────────────────

export const projectMemoryTypeSchema = z.enum(["decision", "definition", "criterion", "goal"]);
export const projectMemoryCategorySchema = z.enum(["inclusion", "exclusion", "outcome", "population", "intervention", "comparison"]);
export const projectMemoryStatusSchema = z.enum(["active", "revised", "archived"]);
export const projectMemoryImportanceSchema = z.enum(["critical", "important", "normal"]);

export const createProjectMemoryInputSchema = z.object({
    projectId: cuidSchema,
    type: projectMemoryTypeSchema,
    statement: z.string().min(1).max(10_000),
    category: projectMemoryCategorySchema.optional(),
    rationale: z.string().max(5000).optional(),
    context: z.string().max(10_000).optional(),
    tags: tagsSchema.optional(),
    importance: projectMemoryImportanceSchema.optional(),
});

export const updateProjectMemoryInputSchema = z.object({
    statement: z.string().min(1).max(10_000).optional(),
    rationale: z.string().max(5000).optional(),
    context: z.string().max(10_000).optional(),
    tags: tagsSchema.optional(),
    importance: projectMemoryImportanceSchema.optional(),
    status: projectMemoryStatusSchema.optional(),
});

export const getProjectMemoriesOptionsSchema = z.object({
    type: projectMemoryTypeSchema.optional(),
    category: projectMemoryCategorySchema.optional(),
    status: projectMemoryStatusSchema.optional(),
    importance: projectMemoryImportanceSchema.optional(),
    tags: z.array(z.string()).optional(),
});

// ── Study Memory ─────────────────────────────────────────────────────────────

export const studyMemoryTypeSchema = z.enum(["summary", "finding", "limitation", "quality", "methods", "results"]);
export const studyMemoryCategorySchema = z.enum(["methods", "results", "bias", "population", "intervention", "outcomes"]);
export const studyMemorySourceSchema = z.enum(["ai_generated", "user_input", "extracted"]);

export const createStudyMemoryInputSchema = z.object({
    studyId: cuidSchema,
    projectId: cuidSchema,
    type: studyMemoryTypeSchema,
    content: z.string().min(1).max(50_000),
    category: studyMemoryCategorySchema.optional(),
    source: studyMemorySourceSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
    tags: tagsSchema.optional(),
});

export const updateStudyMemoryInputSchema = z.object({
    content: z.string().min(1).max(50_000).optional(),
    category: studyMemoryCategorySchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
    tags: tagsSchema.optional(),
    status: z.enum(["active", "archived"]).optional(),
});

export const getStudyMemoriesOptionsSchema = z.object({
    type: studyMemoryTypeSchema.optional(),
    category: studyMemoryCategorySchema.optional(),
    status: z.string().max(50).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    tags: z.array(z.string()).optional(),
});

export const getProjectStudyMemoriesOptionsSchema = z.object({
    type: studyMemoryTypeSchema.optional(),
    category: studyMemoryCategorySchema.optional(),
    minConfidence: z.number().min(0).max(1).optional(),
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

export const memoryRetrievalOptionsSchema = z.object({
    maxMemories: z.number().int().min(1).max(500).optional(),
    minRelevance: z.number().min(0).max(1).optional(),
    includeUser: z.boolean().optional(),
    includeProject: z.boolean().optional(),
    includeStudy: z.boolean().optional(),
});

export const searchStudyMemoriesOptionsSchema = z.object({
    studyId: cuidSchema.optional(),
});

export const memoryMaintenanceOptionsSchema = z.object({
    dryRun: z.boolean().optional(),
});
