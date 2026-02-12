"use client";

import { useCallback } from "react";
import { Modal } from "@/components/Modal";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { PRESET_LEVELS } from "@/lib/agent/autonomy-presets";
import {
    AUTONOMY_LABELS,
    HARD_CAPS,
    type AutonomyLevel,
    type AutonomyPreset,
} from "@/types/agent";
import styles from "../ProjectCopilot.module.css";

const TOOLS: { name: string; label: string; icon: string; desc: string }[] = [
    { name: "search_pubmed", label: "Search PubMed", icon: "search", desc: "Find studies" },
    { name: "extract_pdf", label: "Extract PDF", icon: "picture_as_pdf", desc: "Parse uploaded PDFs" },
    { name: "add_to_ledger", label: "Add to Ledger", icon: "playlist_add", desc: "Add studies" },
    { name: "exclude_study", label: "Exclude Study", icon: "remove_circle_outline", desc: "Remove studies" },
    { name: "update_note", label: "Update Note", icon: "edit_note", desc: "Write draft sections" },
    { name: "update_protocol", label: "Update Protocol", icon: "rule", desc: "Change protocol fields" },
    { name: "bulk_screening", label: "Batch Screening", icon: "filter_list", desc: "Screen multiple" },
    { name: "retrieve_memory", label: "Retrieve Memory", icon: "psychology", desc: "Access past context" },
    { name: "create_note", label: "Create Note", icon: "note_add", desc: "Save observations" },
    { name: "store_memory", label: "Store Memory", icon: "bookmark", desc: "Remember preferences" },
];

const PRESETS: { key: Exclude<AutonomyPreset, "custom">; label: string }[] = [
    { key: "manual", label: "Manual" },
    { key: "assisted", label: "Assisted" },
    { key: "autonomous", label: "Autonomous" },
];

export function AutonomySettings() {
    const {
        showAutonomySettings,
        setShowAutonomySettings,
        autonomyPreset,
        autonomyToolOverrides,
        updateAutonomyOverrides,
        resetToPreset,
    } = useProjectCopilot();

    const getEffectiveLevel = useCallback(
        (toolName: string): AutonomyLevel => {
            if (autonomyToolOverrides[toolName] !== undefined) {
                return autonomyToolOverrides[toolName];
            }
            const presetLevels = PRESET_LEVELS[autonomyPreset] ?? PRESET_LEVELS.assisted;
            return (presetLevels[toolName] ?? 2) as AutonomyLevel;
        },
        [autonomyPreset, autonomyToolOverrides],
    );

    const handleLevelChange = useCallback(
        (toolName: string, level: AutonomyLevel) => {
            const newOverrides = { ...autonomyToolOverrides, [toolName]: level };
            updateAutonomyOverrides(newOverrides);
        },
        [autonomyToolOverrides, updateAutonomyOverrides],
    );

    if (!showAutonomySettings) return null;

    return (
        <Modal
            isOpen={showAutonomySettings}
            onClose={() => setShowAutonomySettings(false)}
            ariaLabelledBy="autonomy-settings-title"
        >
            <div className={styles.autonomyHeader}>
                <h2 id="autonomy-settings-title" className={styles.autonomyTitle}>
                    Autonomy Settings
                </h2>
                <button
                    type="button"
                    className={styles.autonomyCloseBtn}
                    onClick={() => setShowAutonomySettings(false)}
                    aria-label="Close"
                >
                    <span className="material-icons-round">close</span>
                </button>
            </div>

            {/* Preset quick-select */}
            <div className={styles.autonomyPresetRow}>
                {PRESETS.map((p) => (
                    <button
                        key={p.key}
                        type="button"
                        className={`${styles.autonomyPresetBtn} ${autonomyPreset === p.key ? styles.autonomyPresetBtnActive : ""}`}
                        onClick={() => resetToPreset(p.key)}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Tool table */}
            <div className={styles.autonomyToolTable}>
                {TOOLS.map((tool) => {
                    const hardCap = HARD_CAPS[tool.name];
                    const effectiveLevel = getEffectiveLevel(tool.name);

                    return (
                        <div key={tool.name} className={styles.autonomyToolRow}>
                            <div className={styles.autonomyToolInfo}>
                                <span className={`material-icons-round ${styles.autonomyToolIcon}`}>
                                    {tool.icon}
                                </span>
                                <div>
                                    <div className={styles.autonomyToolName}>{tool.label}</div>
                                    <div className={styles.autonomyToolDesc}>{tool.desc}</div>
                                </div>
                            </div>
                            <div className={styles.autonomyLevelSelector}>
                                {([0, 1, 2, 3, 4] as AutonomyLevel[]).map((level) => {
                                    const isDisabled = hardCap !== undefined && level > hardCap;
                                    const isActive = effectiveLevel === level;
                                    return (
                                        <button
                                            key={level}
                                            type="button"
                                            className={`${styles.autonomyLevelBtn} ${isActive ? styles.autonomyLevelBtnActive : ""}`}
                                            disabled={isDisabled}
                                            title={`${AUTONOMY_LABELS[level]}${isDisabled ? " (hard cap)" : ""}`}
                                            onClick={() => handleLevelChange(tool.name, level)}
                                        >
                                            {level}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className={styles.autonomyLegend}>
                {([0, 1, 2, 3, 4] as AutonomyLevel[]).map((l) => (
                    <span key={l} className={styles.autonomyLegendItem}>
                        <strong>{l}</strong> {AUTONOMY_LABELS[l]}
                    </span>
                ))}
            </div>
        </Modal>
    );
}
