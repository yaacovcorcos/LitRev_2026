/**
 * CopilotInput Adapter
 * Binds ProjectCopilotContext to the reusable CopilotInputCore.
 */

"use client";

import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import type { CopilotPage } from "@/types/ai";
import { CopilotInputCore } from "./CopilotInputCore";

export type CopilotInputProps = {
    page: CopilotPage;
    section?: string;
    studyId?: string;
    inputPlaceholder: string;
    prefill?: string;
    onPrefillConsumed?: () => void;
};

export function CopilotInput({ page, section, studyId, inputPlaceholder, prefill, onPrefillConsumed }: CopilotInputProps) {
    const {
        isLoading,
        sendMessage,
        cancelStream,
        pendingAttachment,
        isAttaching,
        attachFile,
        attachExistingFile,
        clearAttachment,
        projectId,
        autonomyPreset,
        updateAutonomyPreset,
        setShowAutonomySettings,
        pendingChoices,
        clearChoices,
    } = useProjectCopilot();

    return (
        <CopilotInputCore
            page={page}
            section={section}
            studyId={studyId}
            inputPlaceholder={inputPlaceholder}
            prefill={prefill}
            onPrefillConsumed={onPrefillConsumed}
            isLoading={isLoading}
            sendMessage={sendMessage}
            cancelStream={cancelStream}
            pendingAttachment={pendingAttachment}
            isAttaching={isAttaching}
            attachFile={attachFile}
            attachExistingFile={attachExistingFile}
            clearAttachment={clearAttachment}
            projectId={projectId}
            autonomyPreset={autonomyPreset}
            updateAutonomyPreset={updateAutonomyPreset}
            setShowAutonomySettings={setShowAutonomySettings}
            pendingChoices={pendingChoices}
            clearChoices={clearChoices}
            modelStorageKey="litrev_copilot_model"
            showAutonomyPreset
            showAttachments
            showVoice
        />
    );
}
