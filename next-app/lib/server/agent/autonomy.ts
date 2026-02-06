/**
 * Autonomy Configuration
 * Resolves effective autonomy level per tool (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { AutonomyLevel, AutonomyPreset } from "@/types/agent";
import { HARD_CAPS } from "@/types/agent";
import { getTool } from "@/lib/server/ai/tools/base";

/** Default presets — tool name → autonomy level */
const PRESET_LEVELS: Record<AutonomyPreset, Record<string, AutonomyLevel>> = {
    manual: {
        search_pubmed: 1,
        extract_pdf: 1,
        add_to_ledger: 1,
        exclude_study: 1,
        edit_draft: 1,
        update_criteria: 1,
        delete_study: 1,
        bulk_screening: 1,
        retrieve_memory: 1,
        create_note: 1,
    },
    assisted: {
        search_pubmed: 2,
        extract_pdf: 3,
        add_to_ledger: 2,
        exclude_study: 2,
        edit_draft: 2,
        update_criteria: 2,
        delete_study: 2,
        bulk_screening: 2,
        retrieve_memory: 4,
        create_note: 3,
    },
    autonomous: {
        search_pubmed: 4,
        extract_pdf: 4,
        add_to_ledger: 3,
        exclude_study: 3,
        edit_draft: 3,
        update_criteria: 2,
        delete_study: 2,
        bulk_screening: 3,
        retrieve_memory: 4,
        create_note: 4,
    },
    custom: {},
};

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
        let level = overrides[toolName] as AutonomyLevel;
        return applyHardCap(toolName, level);
    }

    // Fall back to preset level
    const preset = config.preset as AutonomyPreset;
    const presetLevels = PRESET_LEVELS[preset] ?? PRESET_LEVELS.assisted;
    const tool = getTool(toolName);
    let level = (presetLevels[toolName] ?? tool?.autonomy?.defaultLevel ?? 2) as AutonomyLevel;

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
    return prisma.autonomyConfig.upsert({
        where: {
            userId_projectId: {
                userId,
                projectId: projectId ?? "",
            },
        },
        create: {
            userId,
            projectId: projectId ?? null,
            preset,
            toolOverrides: (toolOverrides ?? {}) as object,
        },
        update: {
            preset,
            toolOverrides: (toolOverrides ?? {}) as object,
        },
    });
}
