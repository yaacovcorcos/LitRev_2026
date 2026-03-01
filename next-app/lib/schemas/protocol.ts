import { z } from "zod";

export const picoDataSchema = z.object({
    population: z.string().max(5000),
    intervention: z.string().max(5000),
    comparison: z.string().max(5000),
    outcome: z.string().max(5000),
});

export const eligibilityDataSchema = z.object({
    inclusion: z.array(z.string().max(2000)).max(100),
    exclusion: z.array(z.string().max(2000)).max(100),
});

export const searchStrategyDataSchema = z.object({
    query: z.string().max(10_000),
    databases: z.array(z.string().max(200)).max(50),
});

export const methodologyDataSchema = z.object({
    studyDesigns: z.array(z.string().max(200)).max(50),
    timeFrameStart: z.string().max(100),
    timeFrameEnd: z.string().max(100),
    qualityAssessmentTool: z.string().max(500),
    qualityAssessmentNotes: z.string().max(5000),
});

export const protocolDataSchema = z.object({
    researchQuestion: z.string().max(5000),
    pico: picoDataSchema,
    eligibility: eligibilityDataSchema,
    searchStrategy: searchStrategyDataSchema,
    methodology: methodologyDataSchema,
});
