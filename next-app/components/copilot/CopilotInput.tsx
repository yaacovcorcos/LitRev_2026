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
    prefillCommand?: { text: string; id: string } | null;
    onPrefillConsumed?: () => void;
};

export function CopilotInput({ page, section, studyId, inputPlaceholder, prefillCommand, onPrefillConsumed }: CopilotInputProps) {
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
        attachedContextTargets,
        recentContextHistory,
        removeAttachedContextTarget,
        clearAttachedContextTargets,
        addAttachedContextTargets,
        autonomyPreset,
        updateAutonomyPreset,
        setShowAutonomySettings,
        pendingChoices,
        clearChoices,
        pendingUserInput,
        answerUserInput,
        summarizeAndRefresh,
        shouldOfferSummary,
        isSummarizing,
        selectedModel,
        setSelectedModel,
    } = useProjectCopilot();
    const projectState = useProjectState(projectId);

    return (
        <CopilotInputCoreClient
            page={page}
            section={section}
            studyId={studyId}
            inputPlaceholder={inputPlaceholder}
            prefillCommand={prefillCommand}
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
            attachedContextTargets={attachedContextTargets}
            recentContextHistory={recentContextHistory}
            removeAttachedContextTarget={removeAttachedContextTarget}
            clearAttachedContextTargets={clearAttachedContextTargets}
            addAttachedContextTargets={addAttachedContextTargets}
            hasProtocol={projectState.hasProtocolForRouting}
            autonomyPreset={autonomyPreset}
            updateAutonomyPreset={updateAutonomyPreset}
            setShowAutonomySettings={setShowAutonomySettings}
            pendingChoices={pendingChoices}
            clearChoices={clearChoices}
            pendingUserInput={pendingUserInput}
            onAnswerUserInput={answerUserInput}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            showAutonomyPreset
            showAttachments
            showVoice
            onCompress={summarizeAndRefresh}
            canCompress={shouldOfferSummary}
            isCompressing={isSummarizing}
        />
    );
}
