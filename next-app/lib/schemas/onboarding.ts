import { z } from "zod";
import { picoDataSchema, eligibilityDataSchema, protocolDataSchema } from "./protocol";

export const onboardingStepIdSchema = z.enum([
    "topicQuestion", "pico", "criteria", "strategy", "workflow", "launch",
]);

export const onboardingStepStatusSchema = z.enum(["pending", "completed", "skipped"]);

export const onboardingDerivedProfileSchema = z.object({
    strictness: z.enum(["low", "moderate", "high"]),
    timelinePressure: z.enum(["low", "medium", "high"]),
    recallVsPrecision: z.enum(["recall", "balanced", "precision"]),
    evidenceDepth: z.enum(["rapid", "standard", "comprehensive"]),
});

export const onboardingProgressUpdatesSchema = z.object({
    stepStatuses: z.record(onboardingStepIdSchema, onboardingStepStatusSchema),
    derivedProfile: onboardingDerivedProfileSchema.nullable(),
});

export const strategyVariantSchema = z.object({
    id: z.string().min(1).max(200),
    mode: z.enum(["precision", "balanced", "recall"]),
    query: z.string().max(10_000),
    databases: z.array(z.string().max(200)).max(20),
    tradeoff: z.string().max(2000),
});

export const strategyPreviewResultSchema = z.object({
    variants: z.array(strategyVariantSchema).max(10),
    expectedVolume: z.string().max(1000),
    provenance: z.string().max(2000),
});

// Re-export protocol schemas used by onboarding actions
export { picoDataSchema, eligibilityDataSchema, protocolDataSchema };
