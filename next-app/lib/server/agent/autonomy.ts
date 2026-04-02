/**
 * Autonomy Configuration
 * Resolves effective autonomy level per tool (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { AutonomyLevel, AutonomyPreset } from "@/types/agent";
import { HARD_CAPS } from "@/types/agent";
import { PRESET_LEVELS } from "@/lib/agent/autonomy-presets";
import { getTool } from "@/lib/server/ai/tools/base";

/**
 * Get the effective autonomy config for a user+project combination.
 * Resolution order: project-specific → user default → system default ("assisted").
 */
export async function getAutonomyConfig(userId?: string, projectId?: string) {
    // Try project-specific config
    if (userId && projectId) {
        const projectConfig = await prisma.autonomyConfig.findUnique({
            where: { userId_projectId: { userId, projectId } },
        });
        if (projectConfig) return projectConfig;
    }

    // Try user default (projectId = null)
    if (userId) {
        const userConfig = await prisma.autonomyConfig.findFirst({
            where: { userId, projectId: null },
        });
        if (userConfig) return userConfig;
    }

    // System default
    return {
        id: "system-default",
        userId: null,
        projectId: null,
        preset: "assisted" as const,
        toolOverrides: {} as Record<string, unknown>,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Get the effective autonomy level for a specific tool.
 */
export function getToolAutonomyLevel(
    toolName: string,
    config: { preset: string; toolOverrides: Record<string, unknown> }
): AutonomyLevel {
    const overrides = config.toolOverrides as Record<string, number>;

    // Check tool-specific override first
    if (overrides[toolName] !== undefined) {
        const level = overrides[toolName] as AutonomyLevel;
        return applyHardCap(toolName, level);
    }

    // Fall back to preset level
    const preset = config.preset as AutonomyPreset;
    const presetLevels = PRESET_LEVELS[preset] ?? PRESET_LEVELS.assisted;
    const tool = getTool(toolName);
    const level = (presetLevels[toolName] ?? tool?.autonomy?.defaultLevel ?? 2) as AutonomyLevel;

    return applyHardCap(toolName, level);
}

/**
 * Apply hard safety cap to an autonomy level
 */
function applyHardCap(toolName: string, level: AutonomyLevel): AutonomyLevel {
    const cap = HARD_CAPS[toolName];
    if (cap !== undefined && level > cap) {
        return cap;
    }
    return level;
}

/**
 * Update autonomy config for a user+project
 */
export async function updateAutonomyConfig(
    userId: string,
    preset: AutonomyPreset,
    toolOverrides?: Record<string, AutonomyLevel>,
    projectId?: string
) {
    const data = {
        preset,
        toolOverrides: (toolOverrides ?? {}) as object,
    };

    // Project-specific config: safe to use compound unique upsert
    if (projectId) {
        return prisma.autonomyConfig.upsert({
            where: {
                userId_projectId: { userId, projectId },
            },
            create: { userId, projectId, ...data },
            update: data,
        });
    }

    // User default (projectId = null): findFirst + update/create since
    // Prisma compound unique can't match null values in the where clause
    const existing = await prisma.autonomyConfig.findFirst({
        where: { userId, projectId: null },
    });

    if (existing) {
        return prisma.autonomyConfig.update({
            where: { id: existing.id },
            data,
        });
    }

    return prisma.autonomyConfig.create({
        data: { userId, projectId: null, ...data },
    });
}
