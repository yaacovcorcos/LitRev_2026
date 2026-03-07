"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { AutonomyPreset } from "@/types/agent";
import styles from "./CopilotInput.module.css";

type CopilotAutonomyPresetButtonProps = {
    autonomyPreset: AutonomyPreset;
    onUpdateAutonomyPreset: (preset: AutonomyPreset) => void | Promise<void>;
    onOpenAutonomySettings: () => void;
};

const AUTONOMY_PRESETS: Array<{
    key: AutonomyPreset;
    label: string;
    icon: string;
    description: string;
}> = [
    { key: "manual", label: "Manual", icon: "back_hand", description: "Review every action before it applies." },
    { key: "assisted", label: "Assisted", icon: "handshake", description: "Auto-run low-risk actions, review the rest." },
    { key: "autonomous", label: "Auto", icon: "smart_toy", description: "Auto-apply actions when policy allows." },
];

function getPresetLabel(preset: AutonomyPreset): string {
    if (preset === "manual") return "Manual";
    if (preset === "autonomous") return "Auto";
    if (preset === "custom") return "Custom";
    return "Assisted";
}

function getPresetIcon(preset: AutonomyPreset): string {
    if (preset === "manual") return "back_hand";
    if (preset === "autonomous") return "smart_toy";
    if (preset === "custom") return "tune";
    return "handshake";
}

export function CopilotAutonomyPresetButton({
    autonomyPreset,
    onUpdateAutonomyPreset,
    onOpenAutonomySettings,
}: CopilotAutonomyPresetButtonProps) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className={styles.presetBtn}
                    aria-label="Autonomy preset"
                    title="Autonomy preset"
                >
                    <span className="material-icons-round" style={{ fontSize: 14 }}>
                        {getPresetIcon(autonomyPreset)}
                    </span>
                    <span>{getPresetLabel(autonomyPreset)}</span>
                    <span className="material-icons-round" style={{ fontSize: 14 }}>expand_more</span>
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content className={styles.presetDropdown} side="top" align="start" sideOffset={4}>
                    <DropdownMenu.RadioGroup
                        value={autonomyPreset === "custom" ? "assisted" : autonomyPreset}
                        onValueChange={(value) => onUpdateAutonomyPreset(value as AutonomyPreset)}
                    >
                        {AUTONOMY_PRESETS.map((preset) => (
                            <DropdownMenu.RadioItem
                                key={preset.key}
                                value={preset.key}
                                className={`${styles.presetItem} ${autonomyPreset === preset.key ? styles.presetItemActive : ""}`}
                            >
                                <span className={`material-icons-round ${styles.presetItemIcon}`}>
                                    {preset.icon}
                                </span>
                                <span className={styles.presetItemName}>{preset.label}</span>
                                <span className={styles.presetItemDesc}>{preset.description}</span>
                            </DropdownMenu.RadioItem>
                        ))}
                    </DropdownMenu.RadioGroup>
                    <DropdownMenu.Separator className={styles.presetDivider} />
                    <DropdownMenu.Item
                        className={`${styles.presetItem} ${autonomyPreset === "custom" ? styles.presetItemActive : ""}`}
                        onSelect={onOpenAutonomySettings}
                    >
                        <span className={`material-icons-round ${styles.presetItemIcon}`}>tune</span>
                        <span className={styles.presetItemName}>Custom</span>
                        <span className={styles.presetItemDesc}>Open full autonomy settings.</span>
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
