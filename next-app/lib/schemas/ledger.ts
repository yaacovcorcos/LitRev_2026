import { z } from "zod";
import { cuidSchema } from "./ids";

export const studyStatusSchema = z.enum(["pending", "extracted", "active", "excluded"]);
export const qualitySchema = z.enum(["High", "Medium", "Low", "-"]);

/** StudyDetails is extensible with [key: string]: unknown */
export const studyDetailsSchema = z.record(z.string(), z.unknown());

export const studySchema = z.object({
    id: cuidSchema,
    title: z.string().min(1).max(2000),
    authors: z.string().max(5000),
    year: z.number().int().min(1800).max(2200),
    status: studyStatusSchema,
    quality: qualitySchema,
    details: studyDetailsSchema.optional(),
});

export const studyInputSchema = studySchema.extend({
    id: cuidSchema.optional(),
});

export const paginationOptionsSchema = z.object({
    cursor: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(500).optional(),
});

export const mentionedStudyInputSchema = z.object({
    title: z.string().max(2000).optional(),
    authors: z.string().max(5000).optional(),
    year: z.number().int().min(1800).max(2200).optional(),
    doi: z.string().max(500).optional(),
    pmid: z.string().max(50).optional(),
    s2PaperId: z.string().max(200).optional(),
    sourceUrl: z.string().max(2000).optional(),
});
