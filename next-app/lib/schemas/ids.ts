import { z } from "zod";

/** Standard CUID identifier (Prisma default) */
export const cuidSchema = z.string().min(1).max(128);

/** Project ID */
export const projectIdSchema = cuidSchema;

/** Study ID */
export const studyIdSchema = cuidSchema;

/** Generic resource ID */
export const resourceIdSchema = cuidSchema;

/** Positive integer for limits/counts */
export const positiveIntSchema = z.number().int().positive();

/** Non-negative integer */
export const nonNegativeIntSchema = z.number().int().nonnegative();

/** Safe string — non-empty, capped length */
export const safeStringSchema = z.string().min(1).max(10_000);

/** Search query string */
export const searchQuerySchema = z.string().min(1).max(1_000);

/** Tags array */
export const tagsSchema = z.array(z.string().max(100)).max(50);
