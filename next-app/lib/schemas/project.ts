import { z } from "zod";

export const projectProgressSchema = z.object({
    phase: z.string(),
    percent: z.number(),
    papers: z.number().int(),
});

export const projectSchema = z.object({
    id: z.string().min(1).max(128),
    demoKey: z.string().min(1).max(128).nullable().optional(),
    name: z.string().min(1).max(500),
    description: z.string().max(5000).optional(),
    status: z.enum(["harvesting", "ready"]),
    statusText: z.string().max(200),
    papers: z.number().int().nonnegative().optional(),
    progress: projectProgressSchema.optional(),
    modified: z.string(),
    created: z.string(),
});

export const projectUpdatesSchema = projectSchema.partial();
