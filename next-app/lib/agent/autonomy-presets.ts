/**
 * Autonomy Preset Levels
 * Shared between server (autonomy.ts) and client (AutonomySettings.tsx)
 */

import type { AutonomyLevel, AutonomyPreset } from "@/types/agent";

/** Default presets — tool name → autonomy level */
export const PRESET_LEVELS: Record<AutonomyPreset, Record<string, AutonomyLevel>> = {
    manual: {
        search_pubmed: 1,
        extract_pdf: 1,
        add_to_ledger: 1,
        exclude_study: 1,
        update_note: 1,
        update_protocol: 1,
        bulk_screening: 1,
        retrieve_memory: 1,
        create_note: 1,
        store_memory: 1,
    },
    assisted: {
        search_pubmed: 2,
        extract_pdf: 3,
        add_to_ledger: 2,
        exclude_study: 2,
        update_note: 2,
        update_protocol: 2,
        bulk_screening: 2,
        retrieve_memory: 4,
        create_note: 3,
        store_memory: 2,
    },
    autonomous: {
        search_pubmed: 4,
        extract_pdf: 4,
        add_to_ledger: 3,
        exclude_study: 2,
        update_note: 2,
        update_protocol: 2,
        bulk_screening: 2,
        retrieve_memory: 4,
        create_note: 4,
        store_memory: 2,
    },
    custom: {},
};
