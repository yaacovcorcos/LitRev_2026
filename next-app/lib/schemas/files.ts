import { z } from "zod";
import { cuidSchema } from "./ids";

export const fileAssetInputSchema = z.object({
    id: cuidSchema.optional(),
    projectId: cuidSchema.optional(),
    studyId: cuidSchema.optional(),
    kind: z.string().min(1).max(100),
    format: z.string().max(100).optional(),
    filename: z.string().min(1).max(500),
    mimeType: z.string().min(1).max(200),
    size: z.number().int().nonnegative(),
    storagePath: z.string().min(1).max(2000),
    publicUrl: z.string().max(2000).nullable().optional(),
    version: z.number().int().nonnegative().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
