import { z } from "zod";

export const artifactReviewStatusSchema = z.enum(["accepted", "rejected", "edited"]);

export const autonomyLevelSchema = z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
]);

export const autonomyPresetSchema = z.enum(["manual", "assisted", "autonomous", "custom"]);

export const toolOverridesSchema = z.record(z.string(), autonomyLevelSchema);
