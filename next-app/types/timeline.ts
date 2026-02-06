/**
 * Timeline Type Definitions
 * The typed TimelineItem[] union that drives the conversation UI
 * (planC Phase 0.3)
 */

import type { ArtifactType, ArtifactStatus } from "./artifacts";

// ── Attachment (carried on user messages) ────────────────────────────────────

export interface TimelineAttachment {
    fileAssetId?: string;
    filename: string;
    mimeType: string;
    size: number;
    extractedText?: string;
}

// ── TimelineItem — discriminated union ───────────────────────────────────────

export type TimelineItem =
    | TimelineUserMessage
    | TimelineAssistantMessage
    | TimelineArtifact
    | TimelineProgress
    | TimelineCheckpoint
    | TimelineError;

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
