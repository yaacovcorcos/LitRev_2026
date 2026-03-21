"use client";

import { useCallback, useEffect, useState } from "react";

import { getAutonomyConfigAction, updateAutonomyAction } from "@/app/actions/agent";
import type { AutonomyLevel, AutonomyPreset } from "@/types/agent";

export function useProjectAutonomyConfig(projectId: string) {
    const [autonomyPreset, setAutonomyPreset] = useState<AutonomyPreset>("assisted");
    const [autonomyToolOverrides, setAutonomyToolOverrides] = useState<Record<string, AutonomyLevel>>({});
    const [showAutonomySettings, setShowAutonomySettings] = useState(false);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const result = await getAutonomyConfigAction(projectId);
                if (cancelled || !result.success || !result.config) return;
                setAutonomyPreset(result.config.preset as AutonomyPreset);
                setAutonomyToolOverrides(
                    (result.config.toolOverrides ?? {}) as Record<string, AutonomyLevel>,
                );
            } catch (error) {
                console.error("Failed to load autonomy config", error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const updateAutonomyPreset = useCallback(async (preset: AutonomyPreset) => {
        setAutonomyPreset(preset);
        setAutonomyToolOverrides({});
        try {
            await updateAutonomyAction(preset, undefined, projectId);
        } catch (error) {
            console.error("Failed to update autonomy preset", error);
        }
    }, [projectId]);

    const updateAutonomyOverrides = useCallback(async (overrides: Record<string, AutonomyLevel>) => {
        setAutonomyToolOverrides(overrides);
        setAutonomyPreset("custom");
        try {
            await updateAutonomyAction("custom", overrides, projectId);
        } catch (error) {
            console.error("Failed to update autonomy overrides", error);
        }
    }, [projectId]);

    const resetToPreset = useCallback(async (preset: AutonomyPreset) => {
        setAutonomyPreset(preset);
        setAutonomyToolOverrides({});
        try {
            await updateAutonomyAction(preset, undefined, projectId);
        } catch (error) {
            console.error("Failed to reset autonomy preset", error);
        }
    }, [projectId]);

    return {
        autonomyPreset,
        autonomyToolOverrides,
        showAutonomySettings,
        setShowAutonomySettings,
        updateAutonomyPreset,
        updateAutonomyOverrides,
        resetToPreset,
    };
}
