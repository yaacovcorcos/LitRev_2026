import type { AgentMode } from "@/types/agent";
import type { CopilotPage, DeliveryMode, ReasoningEffort } from "@/types/ai";
import type { SelectableModelId } from "@/lib/ai/config";

export type GenerationPreferenceSnapshot = {
    model: SelectableModelId;
    reasoningEffort: ReasoningEffort;
    deliveryMode: DeliveryMode;
};

export type QueuedFollowUp = GenerationPreferenceSnapshot & {
    id: string;
    text: string;
    createdAt: number;
    conversationId: string | null;
    page: CopilotPage;
    section?: string;
    studyId?: string;
    agentMode?: AgentMode;
    source: "draft";
};
