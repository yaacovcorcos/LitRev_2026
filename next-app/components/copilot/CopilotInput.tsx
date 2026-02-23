/**
 * CopilotInput Adapter
 * Binds ProjectCopilotContext to the reusable CopilotInputCore.
 */

"use client";

import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { useProjectState } from "@/hooks/useProjectState";
import type { CopilotPage } from "@/types/ai";
import { CopilotInputCoreClient } from "./CopilotInputCoreClient";

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
        summarizeAndRefresh,
        shouldOfferSummary,
        isSummarizing,
    } = useProjectCopilot();
    const projectSnapshot = useProjectState(projectId);

    return (
        <CopilotInputCoreClient
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
            hasProtocol={projectSnapshot.hasProtocol}
            autonomyPreset={autonomyPreset}
            updateAutonomyPreset={updateAutonomyPreset}
            setShowAutonomySettings={setShowAutonomySettings}
            pendingChoices={pendingChoices}
            clearChoices={clearChoices}
            modelStorageKey="litrev_copilot_model"
            showAutonomyPreset
            showAttachments
            showVoice
            onCompress={summarizeAndRefresh}
            canCompress={shouldOfferSummary}
            isCompressing={isSummarizing}
        />
    );
}
