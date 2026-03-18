/**
 * CopilotInput Adapter
 * Binds ProjectCopilotContext to the reusable CopilotInputCore.
 */

"use client";

import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { useProjectState } from "@/hooks/useProjectState";
import { createQueuedFollowUp } from "@/lib/ai/queued-followup";
import type { CopilotPage } from "@/types/ai";
import { CopilotInputCoreClient } from "./CopilotInputCoreClient";

export type CopilotInputProps = {
    page: CopilotPage;
    section?: string;
    studyId?: string;
    inputPlaceholder: string;
    prefillCommand?: { text: string; id: string } | null;
    onPrefillConsumed?: () => void;
    attachedStack?: "none" | "attached";
    interactionLocked?: boolean;
};

export function CopilotInput({
    page,
    section,
    studyId,
    inputPlaceholder,
    prefillCommand,
    onPrefillConsumed,
    attachedStack = "none",
    interactionLocked = false,
}: CopilotInputProps) {
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
        currentConversationId,
        queuedFollowUp,
        queueQueuedFollowUp,
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
            hasQueuedFollowUp={queuedFollowUp !== null}
            attachedStack={attachedStack}
            interactionLocked={interactionLocked}
            onQueueFollowUp={(payload) => {
                queueQueuedFollowUp(createQueuedFollowUp({
                    ...payload,
                    conversationId: currentConversationId ?? null,
                    source: "draft",
                }));
            }}
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
