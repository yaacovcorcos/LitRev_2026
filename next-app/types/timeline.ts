/**
 * Timeline Type Definitions
 * The typed TimelineItem[] union that drives the conversation UI
 * (planC Phase 0.3)
 */

import type { ArtifactType, ArtifactStatus } from "./artifacts";
import type { CopilotPage, UserInputQuestionType, UserInputOption } from "./ai";
import type { ContextCaptureTarget } from "./context-capture";

// ── Attachment (carried on user messages) ────────────────────────────────────

export interface TimelineFileAttachment {
    fileAssetId?: string;
    filename: string;
    mimeType: string;
    size: number;
    extractedText?: string;
}

export interface TimelineContextAttachment {
    type: "context_capture";
    target: ContextCaptureTarget;
}

export type TimelineAttachment = TimelineFileAttachment | TimelineContextAttachment;

// ── TimelineItem — discriminated union ───────────────────────────────────────

export type TimelineItem =
    | TimelineUserMessage
    | TimelineAssistantMessage
    | TimelineArtifact
    | TimelineToolActivity
    | TimelineProgress
    | TimelineCheckpoint
    | TimelineError
    | TimelineUserInputRequest;

export interface TimelineUserMessage {
    type: "user_message";
    id: string;
    content: string;
    attachments?: TimelineAttachment[];
    createdAt: string;
}

export interface TimelineAssistantMessage {
    type: "assistant_message";
    id: string;
    content: string;
    reasoning?: {
        text: string;
        state?: "streaming" | "done";
        truncated?: boolean;
    };
    createdAt: string;
}

export interface TimelineArtifact {
    type: "artifact";
    id: string;
    artifactId: string;
    artifactType: ArtifactType;
    status: ArtifactStatus;
    title: string;
    payload: unknown;
    version: number;
    createdAt: string;
}

export interface TimelineToolActivity {
    type: "tool_activity";
    id: string;
    callId: string;
    toolName: string;
    status: "queued" | "running" | "done" | "failed";
    summary?: string;
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
    createdAt: string;
}

export interface TimelineProgress {
    type: "progress";
    id: string;
    message: string;
    current?: number;
    total?: number;
}

export interface TimelineCheckpoint {
    type: "checkpoint";
    id: string;
    label: string;
    createdAt: string;
}

export interface TimelineError {
    type: "error";
    id: string;
    message: string;
    retryable: boolean;
    createdAt: string;
}

export interface TimelineUserInputRequest {
    type: "user_input_request";
    id: string;
    callId: string;
    page?: CopilotPage;
    section?: string;
    question: string;
    questionType: UserInputQuestionType;
    options?: UserInputOption[];
    header?: string;
    context?: string;
    answered: boolean;
    answer?: string;
    createdAt: string;
}
