import { z } from "zod";
import { cuidSchema } from "./ids";

export const studyStatusSchema = z.enum(["pending", "extracted", "active", "excluded"]);
export const qualitySchema = z.enum(["High", "Medium", "Low", "-"]);
export const relevanceBandSchema = z.enum(["high", "moderate", "low"]);
export const studyRelevanceSchema = z.object({
    score: z.number().min(0).max(100),
    band: relevanceBandSchema,
    rationale: z.string().min(1).max(5000),
    components: z
        .object({
            protocolFit: z.number().min(0).max(100).optional(),
            designFit: z.number().min(0).max(100).optional(),
            outcomeDirectness: z.number().min(0).max(100).optional(),
            applicability: z.number().min(0).max(100).optional(),
            completeness: z.number().min(0).max(100).optional(),
        })
        .optional(),
});

/** StudyDetails is extensible with [key: string]: unknown */
export const studyDetailsSchema = z
    .object({
        relevance: studyRelevanceSchema.optional(),
    })
    .catchall(z.unknown());

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
