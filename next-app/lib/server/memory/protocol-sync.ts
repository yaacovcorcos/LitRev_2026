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
    type: "definition" | "criterion" | "goal";
    category?: ProjectMemoryCategory;
    statement: string;
    tag: string;
    key: string;
}

// Note: methodology/search scalar/list fields are currently mapped to `definition`
// because ProjectMemoryType does not yet include methodology-specific subtypes.

const PICO_FIELDS: { key: keyof ProtocolData["pico"]; category: ProjectMemoryCategory }[] = [
    { key: "population", category: "population" },
    { key: "intervention", category: "intervention" },
    { key: "comparison", category: "comparison" },
    { key: "outcome", category: "outcome" },
];

/**
 * Sync protocol data to ProjectMemory entries.
 * - Research question → type: "goal"
 * - PICO/search/methodology scalar fields → type: "definition"
 * - Eligibility criteria + list-style methodology fields → type: "criterion"/"definition"
 * - All synced memories get importance: "critical", a stable "protocol:*" key,
 *   and a "protocol-sync:" tag
 * - Diffs against existing: creates new, revises changed, archives removed
 */
export async function syncProtocolToMemory(
    projectId: string,
    protocolData: ProtocolData,
): Promise<{ created: number; revised: number; archived: number }> {
    // 1. Build desired memory list from protocol data
    const desired: DesiredMemory[] = [];

    const researchQuestion = protocolData.researchQuestion?.trim();
    if (researchQuestion) {
        desired.push({
            type: "goal",
            statement: researchQuestion,
            tag: "protocol-sync:research-question",
            key: "protocol:research-question",
        });
    }

    for (const { key, category } of PICO_FIELDS) {
        const value = protocolData.pico[key]?.trim();
        if (value) {
            desired.push({
                type: "definition",
                category,
                statement: value,
                tag: `protocol-sync:pico-${key}`,
                key: `protocol:pico-${key}`,
            });
        }
    }

    const searchQuery = protocolData.searchStrategy.query?.trim();
    if (searchQuery) {
        desired.push({
            type: "definition",
            statement: `Search query: ${searchQuery}`,
            tag: "protocol-sync:search-query",
            key: "protocol:search-query",
        });
    }

    for (let i = 0; i < protocolData.searchStrategy.databases.length; i++) {
        const value = protocolData.searchStrategy.databases[i]?.trim();
        if (value) {
            desired.push({
                type: "definition",
                statement: `Database: ${value}`,
                tag: `protocol-sync:database-${i}`,
                key: `protocol:database-${i}`,
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
                key: `protocol:inclusion-${i}`,
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
                key: `protocol:exclusion-${i}`,
            });
        }
    }

    for (let i = 0; i < protocolData.methodology.studyDesigns.length; i++) {
        const value = protocolData.methodology.studyDesigns[i]?.trim();
        if (value) {
            desired.push({
                type: "definition",
                statement: `Study design: ${value}`,
                tag: `protocol-sync:study-design-${i}`,
                key: `protocol:study-design-${i}`,
            });
        }
    }

    const timeFrameStart = protocolData.methodology.timeFrameStart?.trim();
    if (timeFrameStart) {
        desired.push({
            type: "definition",
            statement: `Time frame start: ${timeFrameStart}`,
            tag: "protocol-sync:timeframe-start",
            key: "protocol:timeframe-start",
        });
    }

    const timeFrameEnd = protocolData.methodology.timeFrameEnd?.trim();
    if (timeFrameEnd) {
        desired.push({
            type: "definition",
            statement: `Time frame end: ${timeFrameEnd}`,
            tag: "protocol-sync:timeframe-end",
            key: "protocol:timeframe-end",
        });
    }

    const qualityTool = protocolData.methodology.qualityAssessmentTool?.trim();
    if (qualityTool) {
        desired.push({
            type: "definition",
            statement: `Quality assessment tool: ${qualityTool}`,
            tag: "protocol-sync:quality-tool",
            key: "protocol:quality-tool",
        });
    }

    const qualityNotes = protocolData.methodology.qualityAssessmentNotes?.trim();
    if (qualityNotes) {
        desired.push({
            type: "definition",
            statement: `Quality assessment notes: ${qualityNotes}`,
            tag: "protocol-sync:quality-notes",
            key: "protocol:quality-notes",
        });
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
                await updateProjectMemory(ex.id, { statement: d.statement, key: d.key });
                revised++;
            }
            // Same statement → skip (idempotent)
        } else {
            // New memory
            await createProjectMemory({
                projectId,
                type: d.type,
                key: d.key,
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
