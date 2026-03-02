import "server-only";

import { prisma } from "@/lib/server/prisma";
import { requireScope, type ScopeInput } from "@/lib/server/scope";
import type { ProjectActivityItem, ProjectActivityKind } from "@/types/activity";

const MIN_LIMIT = 1;
const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 8;
const MIN_PER_SOURCE = 12;
const COALESCE_WINDOW_MS = 60_000;

type ActivityCandidate = {
    id: string;
    kind: ProjectActivityKind;
    entityId: string;
    label: string;
    timestamp: Date;
    icon: string;
    href: string;
};

type CoalescedActivity = ActivityCandidate & { coalescedCount: number };

const APPLIED_ARTIFACT_TYPES = new Set([
    "study_proposal",
    "study_update",
    "draft_diff",
    "screening_batch",
    "protocol_suggestion",
    "criteria_card",
    "evidence_table",
    "scoping_report",
    "plan",
    "memory_proposal",
    "memory_forget_proposal",
]);

function clampLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(limit!)));
}

function trimLabel(value: string, max = 90): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1).trim()}…`;
}

function safeTitle(value: string | null | undefined, fallback: string): string {
    const normalized = value?.trim();
    return normalized ? trimLabel(normalized) : fallback;
}

function artifactLabel(type: string, title: string): string {
    const cleanTitle = safeTitle(title, "AI change");
    switch (type) {
        case "protocol_suggestion":
        case "criteria_card":
            return `Applied protocol change: "${cleanTitle}"`;
        case "draft_diff":
            return `Applied draft change: "${cleanTitle}"`;
        case "study_update":
        case "study_proposal":
        case "screening_batch":
        case "evidence_table":
            return `Applied ledger change: "${cleanTitle}"`;
        case "scoping_report":
            return `Saved scoping report: "${cleanTitle}"`;
        case "memory_forget_proposal":
            return `Archived memory: "${cleanTitle}"`;
        case "memory_proposal":
            return `Applied memory update: "${cleanTitle}"`;
        case "plan":
            return `Applied plan: "${cleanTitle}"`;
        default:
            return `Applied AI change: "${cleanTitle}"`;
    }
}

function artifactHref(projectId: string, type: string): string {
    switch (type) {
        case "protocol_suggestion":
        case "criteria_card":
            return `/project/${projectId}/protocol`;
        case "draft_diff":
            return `/project/${projectId}/draft`;
        case "study_update":
        case "study_proposal":
        case "screening_batch":
        case "evidence_table":
            return `/project/${projectId}/ledger`;
        default:
            return `/project/${projectId}`;
    }
}

function coalesceActivities(activities: ActivityCandidate[]): CoalescedActivity[] {
    const sorted = [...activities].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const coalesced: CoalescedActivity[] = [];
    const latestByKey = new Map<string, CoalescedActivity>();

    for (const event of sorted) {
        const key = `${event.kind}:${event.entityId}`;
        const existing = latestByKey.get(key);
        if (existing && existing.timestamp.getTime() - event.timestamp.getTime() <= COALESCE_WINDOW_MS) {
            existing.coalescedCount += 1;
            continue;
        }

        const next: CoalescedActivity = { ...event, coalescedCount: 1 };
        coalesced.push(next);
        latestByKey.set(key, next);
    }

    return coalesced;
}

function toActivityItem(event: CoalescedActivity): ProjectActivityItem {
    const suffix = event.coalescedCount > 1 ? ` (+${event.coalescedCount - 1} more)` : "";
    return {
        id: event.id,
        kind: event.kind,
        label: `${event.label}${suffix}`,
        timestamp: event.timestamp.toISOString(),
        icon: event.icon,
        href: event.href,
        coalescedCount: event.coalescedCount > 1 ? event.coalescedCount : undefined,
    };
}

export async function getProjectRecentActivity(
    scopeInput: ScopeInput,
    projectId: string,
    limit?: number,
): Promise<ProjectActivityItem[]> {
    const scope = requireScope(scopeInput ?? undefined);
    const safeLimit = clampLimit(limit);
    const perSourceLimit = Math.max(MIN_PER_SOURCE, safeLimit);

    const project = await prisma.project.findFirst({
        where: { id: projectId, workspaceId: scope.workspaceId, ownerId: scope.ownerId },
        select: { id: true },
    });
    if (!project) {
        throw new Error("Project not found or access denied.");
    }

    const [
        studies,
        notes,
        files,
        protocol,
        draft,
        artifacts,
        conversations,
    ] = await Promise.all([
        prisma.study.findMany({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            take: perSourceLimit,
            select: { id: true, title: true, year: true, createdAt: true },
        }),
        prisma.note.findMany({
            where: { projectId },
            orderBy: { updatedAt: "desc" },
            take: perSourceLimit,
            select: { id: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.fileAsset.findMany({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            take: perSourceLimit,
            select: { id: true, filename: true, kind: true, createdAt: true },
        }),
        prisma.protocol.findUnique({
            where: { projectId },
            select: { updatedAt: true },
        }),
        prisma.draft.findUnique({
            where: { projectId },
            select: { updatedAt: true },
        }),
        prisma.artifact.findMany({
            where: {
                projectId,
                status: { in: ["accepted", "auto_applied"] },
                type: { in: [...APPLIED_ARTIFACT_TYPES] },
            },
            orderBy: { createdAt: "desc" },
            take: perSourceLimit,
            select: { id: true, type: true, title: true, createdAt: true },
        }),
        prisma.aIConversation.findMany({
            where: { projectId, archived: false },
            orderBy: { updatedAt: "desc" },
            take: perSourceLimit,
            select: { id: true, title: true, updatedAt: true, createdAt: true },
        }),
    ]);

    const events: ActivityCandidate[] = [];

    for (const study of studies) {
        events.push({
            id: `study-created:${study.id}`,
            kind: "study_created",
            entityId: `study:${study.id}`,
            label: `Added study: "${safeTitle(study.title, "Untitled study")}" (${study.year})`,
            timestamp: study.createdAt,
            icon: "description",
            href: `/project/${projectId}/ledger`,
        });
    }

    for (const note of notes) {
        const isCreated = note.updatedAt.getTime() - note.createdAt.getTime() <= 30_000;
        events.push({
            id: `note-${isCreated ? "created" : "updated"}:${note.id}`,
            kind: isCreated ? "note_created" : "note_updated",
            entityId: `note:${note.id}`,
            label: `${isCreated ? "Created" : "Updated"} note: "${safeTitle(note.title, "Untitled note")}"`,
            timestamp: note.updatedAt,
            icon: "sticky_note_2",
            href: `/project/${projectId}/notes`,
        });
    }

    for (const file of files) {
        events.push({
            id: `file-uploaded:${file.id}`,
            kind: "file_uploaded",
            entityId: `file:${file.id}`,
            label: `Uploaded ${safeTitle(file.kind, "file")}: "${safeTitle(file.filename, "Unnamed file")}"`,
            timestamp: file.createdAt,
            icon: "upload_file",
            href: `/project/${projectId}/ledger`,
        });
    }

    if (protocol?.updatedAt) {
        events.push({
            id: `protocol-updated:${projectId}`,
            kind: "protocol_updated",
            entityId: `protocol:${projectId}`,
            label: "Updated protocol",
            timestamp: protocol.updatedAt,
            icon: "assignment",
            href: `/project/${projectId}/protocol`,
        });
    }

    if (draft?.updatedAt) {
        events.push({
            id: `draft-updated:${projectId}`,
            kind: "draft_updated",
            entityId: `draft:${projectId}`,
            label: "Edited draft",
            timestamp: draft.updatedAt,
            icon: "edit_note",
            href: `/project/${projectId}/draft`,
        });
    }

    for (const artifact of artifacts) {
        events.push({
            id: `artifact-applied:${artifact.id}`,
            kind: "artifact_applied",
            entityId: `artifact:${artifact.id}`,
            label: artifactLabel(artifact.type, artifact.title),
            timestamp: artifact.createdAt,
            icon: "auto_awesome",
            href: artifactHref(projectId, artifact.type),
        });
    }

    for (const conversation of conversations) {
        events.push({
            id: `conversation-updated:${conversation.id}`,
            kind: "conversation_updated",
            entityId: `conversation:${conversation.id}`,
            label: `Continued conversation: "${safeTitle(conversation.title, "Untitled conversation")}"`,
            timestamp: conversation.updatedAt,
            icon: "chat",
            href: `/project/${projectId}`,
        });
    }

    return coalesceActivities(events).slice(0, safeLimit).map(toActivityItem);
}
