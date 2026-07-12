/**
 * ProjectConversationComposer Adapter
 * Binds ProjectConversationContext to the reusable ChatComposerCore.
 */

"use client";

import { useProjectConversation } from "@/contexts/ProjectConversationContext";
import { useProjectState } from "@/hooks/useProjectState";
import { createQueuedFollowUp } from "@/lib/ai/queued-followup";
import type { CopilotPage } from "@/types/ai";
import { ChatComposerCoreClient } from "@/components/chat/ChatComposerCoreClient";

export type ProjectConversationComposerProps = {
    page: CopilotPage;
    section?: string;
    studyId?: string;
    inputPlaceholder: string;
    prefillCommand?: { text: string; id: string } | null;
    onPrefillConsumed?: () => void;
    attachedStack?: "none" | "attached";
    interactionLocked?: boolean;
};

export function ProjectConversationComposer({
    page,
    section,
    studyId,
    inputPlaceholder,
    prefillCommand,
    onPrefillConsumed,
    attachedStack = "none",
    interactionLocked = false,
}: ProjectConversationComposerProps) {
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
        reasoningEffort,
        setReasoningEffort,
        deliveryMode,
        setDeliveryMode,
        modelAvailability,
        modelAvailabilityStatus,
        retryModelAvailability,
        currentConversationId,
        queuedFollowUp,
        queueQueuedFollowUp,
    } = useProjectConversation();
    const projectState = useProjectState(projectId);

    return (
        <ChatComposerCoreClient
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
                    model: selectedModel,
                    reasoningEffort,
                    deliveryMode,
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
            modelAvailability={modelAvailability}
            modelAvailabilityStatus={modelAvailabilityStatus}
            onRetryModelAvailability={retryModelAvailability}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={setReasoningEffort}
            deliveryMode={deliveryMode}
            onDeliveryModeChange={setDeliveryMode}
            showAutonomyPreset
            showAttachments
            showVoice
            onCompress={summarizeAndRefresh}
            canCompress={shouldOfferSummary}
            isCompressing={isSummarizing}
        />
    );
}
