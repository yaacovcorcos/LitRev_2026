export type SendQueueMode = "queue" | "interrupt";

const DEFAULT_SEND_QUEUE_MODE: SendQueueMode = "queue";
const DEFAULT_MAX_QUEUED_MESSAGES = 3;
const MAX_QUEUED_MESSAGES_CAP = 20;

export function resolveSendQueueMode(raw: string | undefined): SendQueueMode {
    const normalized = raw?.trim().toLowerCase();
    if (normalized === "interrupt") return "interrupt";
    if (normalized === "queue") return "queue";
    return DEFAULT_SEND_QUEUE_MODE;
}

export function resolveMaxQueuedMessages(raw: string | undefined): number {
    const parsed = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_QUEUED_MESSAGES;
    return Math.min(parsed, MAX_QUEUED_MESSAGES_CAP);
}
