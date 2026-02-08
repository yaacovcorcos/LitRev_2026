/**
 * Protocol-Memory Sync
 * Automatically synchronizes protocol data to ProjectMemory entries (planC Phase 5.1)
 */

import "server-only";
import type { ProtocolData } from "@/types/protocol";
import type { ProjectMemoryCategory } from "./project-memory";
import {
    createProjectMemory,
    getProjectMemories,
    updateProjectMemory,
    archiveProjectMemory,
} from "./project-memory";

interface DesiredMemory {
    type: "definition" | "criterion";
    category: ProjectMemoryCategory;
    statement: string;
    tag: string;
}

const PICO_FIELDS: { key: keyof ProtocolData["pico"]; category: ProjectMemoryCategory }[] = [
    { key: "population", category: "population" },
    { key: "intervention", category: "intervention" },
    { key: "comparison", category: "comparison" },
    { key: "outcome", category: "outcome" },
];

/**
 * Sync protocol data to ProjectMemory entries.
 * - PICO fields → type: "definition"
 * - Eligibility criteria → type: "criterion"
 * - All synced memories get importance: "critical" and a "protocol-sync:" tag
 * - Diffs against existing: creates new, revises changed, archives removed
 */
export async function syncProtocolToMemory(
    projectId: string,
    protocolData: ProtocolData,
): Promise<{ created: number; revised: number; archived: number }> {
    // 1. Build desired memory list from protocol data
    const desired: DesiredMemory[] = [];

    for (const { key, category } of PICO_FIELDS) {
        const value = protocolData.pico[key]?.trim();
        if (value) {
            desired.push({
                type: "definition",
                category,
                statement: value,
                tag: `protocol-sync:pico-${key}`,
            });
        }
    }

    for (let i = 0; i < protocolData.eligibility.inclusion.length; i++) {
        const value = protocolData.eligibility.inclusion[i]?.trim();
        if (value) {
            desired.push({
                type: "criterion",
                category: "inclusion",
                statement: value,
                tag: `protocol-sync:inclusion-${i}`,
            });
        }
    }

    for (let i = 0; i < protocolData.eligibility.exclusion.length; i++) {
        const value = protocolData.eligibility.exclusion[i]?.trim();
        if (value) {
            desired.push({
                type: "criterion",
                category: "exclusion",
                statement: value,
                tag: `protocol-sync:exclusion-${i}`,
            });
        }
    }

    // 2. Fetch existing protocol-synced memories
    const existing = await getProjectMemories(projectId, { status: "active" });
    const synced = existing.filter((m) =>
        m.tags.some((t: string) => t.startsWith("protocol-sync:"))
    );

    // Build lookup: tag → existing memory
    const existingByTag = new Map<string, typeof synced[number]>();
    for (const m of synced) {
        const syncTag = m.tags.find((t: string) => t.startsWith("protocol-sync:"));
        if (syncTag) existingByTag.set(syncTag, m);
    }

    // 3. Diff
    let created = 0;
    let revised = 0;
    let archived = 0;

    const desiredTags = new Set(desired.map((d) => d.tag));

    for (const d of desired) {
        const ex = existingByTag.get(d.tag);
        if (ex) {
            // Existing memory with same tag — check if statement changed
            if (ex.statement !== d.statement) {
                await updateProjectMemory(ex.id, { statement: d.statement });
                revised++;
            }
            // Same statement → skip (idempotent)
        } else {
            // New memory
            await createProjectMemory({
                projectId,
                type: d.type,
                category: d.category,
                statement: d.statement,
                importance: "critical",
                tags: [d.tag],
                context: "Auto-synced from protocol",
            });
            created++;
        }
    }

    // Archive memories whose tags are no longer in the desired set
    for (const [tag, mem] of existingByTag) {
        if (!desiredTags.has(tag)) {
            await archiveProjectMemory(mem.id);
            archived++;
        }
    }

    return { created, revised, archived };
}
