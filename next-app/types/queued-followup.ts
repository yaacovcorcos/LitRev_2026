import type { AgentMode } from "@/types/agent";
import type { CopilotPage } from "@/types/ai";
import type { SelectableModelId } from "@/lib/ai/config";

export type QueuedFollowUp = {
    id: string;
    text: string;
    createdAt: number;
    conversationId: string | null;
    page: CopilotPage;
    section?: string;
    studyId?: string;
    model?: SelectableModelId;
    agentMode?: AgentMode;
    source: "draft";
};

