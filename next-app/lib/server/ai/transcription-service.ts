import "server-only";

import { after } from "next/server";
import { AI_CONFIG } from "@/lib/ai/config";
import { extractAIErrorEnvelope } from "@/lib/ai/error-envelope";
import { projectIdSchema } from "@/lib/schemas/ids";
import { assertProjectAccess } from "@/lib/server/access";
import type { AuthContext } from "@/lib/server/auth/session";
import { logServerWarn } from "@/lib/server/logging";
import type { CopilotPage } from "@/types/ai";
import {
    reserveProviderUsageAttempt,
    tryMarkUsageReservationReconcilable,
    trySettleUsageReservation,
} from "./rate-limiter";
import { transcribeAudio, TRANSCRIPTION_MODEL } from "./transcription";

const TRANSCRIPTION_USAGE_SOURCE = "voice_transcription" as const;
const LEGACY_UNKNOWN = "legacy_unknown" as const;

const VALID_COPILOT_PAGES = new Set<CopilotPage>([
    "draft",
    "protocol",
    "ledger",
    "study",
    "overview",
    "notes",
    "memory",
    "ai",
]);

export type TranscriptionGovernanceErrorCode =
    | "INVALID_TRANSCRIPTION_PAGE"
    | "INVALID_TRANSCRIPTION_PROJECT_ID"
    | "TRANSCRIPTION_PROJECT_ACCESS_DENIED"
    | "AI_RATE_LIMIT_EXCEEDED"
    | "AI_DAILY_TOKEN_LIMIT_EXCEEDED"
    | "AI_TRANSCRIPTION_DAILY_LIMIT_EXCEEDED"
    | "AI_USAGE_ADMISSION_TIMEOUT"
    | "AI_USAGE_ADMISSION_FAILED";

export class TranscriptionGovernanceError extends Error {
    readonly code: TranscriptionGovernanceErrorCode;
    readonly status: number;
    readonly retryAfterSeconds?: number;

    constructor(
        code: TranscriptionGovernanceErrorCode,
        message: string,
        options: {
            status: number;
            retryAfterSeconds?: number;
        },
    ) {
        super(message);
        this.name = "TranscriptionGovernanceError";
        this.code = code;
        this.status = options.status;
        this.retryAfterSeconds = options.retryAfterSeconds;
    }
}

export function isTranscriptionGovernanceError(error: unknown): error is TranscriptionGovernanceError {
    return error instanceof TranscriptionGovernanceError;
}

function normalizeOptionalText(value?: string | null): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function parseCopilotPage(rawPage?: string | null): CopilotPage | undefined {
    const normalized = normalizeOptionalText(rawPage);
    if (!normalized) return undefined;
    if (!VALID_COPILOT_PAGES.has(normalized as CopilotPage)) {
        throw new TranscriptionGovernanceError(
            "INVALID_TRANSCRIPTION_PAGE",
            "Invalid transcription page.",
            { status: 400 },
        );
    }
    return normalized as CopilotPage;
}

async function parseAuthorizedProjectId(
    actor: AuthContext,
    rawProjectId?: string | null,
): Promise<string | null> {
    const normalized = normalizeOptionalText(rawProjectId);
    if (!normalized) return null;

    const parsed = projectIdSchema.safeParse(normalized);
    if (!parsed.success) {
        throw new TranscriptionGovernanceError(
            "INVALID_TRANSCRIPTION_PROJECT_ID",
            "Invalid transcription project ID.",
            { status: 400 },
        );
    }

    try {
        await assertProjectAccess(
            { ownerId: actor.userId, workspaceId: actor.workspaceId },
            parsed.data,
        );
    } catch {
        throw new TranscriptionGovernanceError(
            "TRANSCRIPTION_PROJECT_ACCESS_DENIED",
            "Project not found or access denied.",
            { status: 403 },
        );
    }

    return parsed.data;
}

function scheduleReservationRetry(
    reservationId: string,
    taskName: string,
    task: () => Promise<boolean>,
): void {
    try {
        after(async () => {
            try {
                const completed = await task();
                if (!completed) {
                    logServerWarn("transcription-service", `${taskName} remains pending`, {
                        reservationId,
                    });
                }
            } catch (error) {
                logServerWarn("transcription-service", `${taskName} retry rejected`, {
                    reservationId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
    } catch (error) {
        logServerWarn("transcription-service", `${taskName} retry was not scheduled`, {
            reservationId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function rethrowTranscriptionAdmissionError(error: unknown): never {
    const errorMeta = extractAIErrorEnvelope(error);
    switch (errorMeta?.code) {
        case "AI_RATE_LIMIT_EXCEEDED":
            throw new TranscriptionGovernanceError(
                "AI_RATE_LIMIT_EXCEEDED",
                `Rate limit exceeded. Maximum ${AI_CONFIG.maxRequestsPerMinute} provider attempts per minute.`,
                { status: 429, retryAfterSeconds: 60 },
            );
        case "DAILY_TOKEN_LIMIT_EXCEEDED":
            throw new TranscriptionGovernanceError(
                "AI_DAILY_TOKEN_LIMIT_EXCEEDED",
                `Daily token limit exceeded. Maximum ${AI_CONFIG.maxTokensPerDay} tokens per day.`,
                { status: 429 },
            );
        case "AI_SOURCE_DAILY_ATTEMPT_LIMIT_EXCEEDED":
            throw new TranscriptionGovernanceError(
                "AI_TRANSCRIPTION_DAILY_LIMIT_EXCEEDED",
                `Daily transcription limit exceeded. Maximum ${AI_CONFIG.maxTranscriptionsPerDay} provider attempts per day.`,
                { status: 429 },
            );
        case "AI_USAGE_ADMISSION_TIMEOUT":
        case "AI_USAGE_ADMISSION_FAILED":
            throw new TranscriptionGovernanceError(
                errorMeta.code,
                "Usage admission could not complete before the transcription provider was called. Please retry.",
                { status: 503, retryAfterSeconds: 1 },
            );
        default:
            throw error;
    }
}

export async function transcribeAudioForActor(input: {
    actor: AuthContext;
    audioFile: File;
    language?: string | null;
    prompt?: string | null;
    page?: string | null;
    projectId?: string | null;
}): Promise<{ text: string }> {
    const page = parseCopilotPage(input.page);
    const projectId = await parseAuthorizedProjectId(input.actor, input.projectId);
    const scope = {
        projectId,
        userId: input.actor.userId,
        workspaceId: input.actor.workspaceId,
    };

    let reservation: Awaited<ReturnType<typeof reserveProviderUsageAttempt>>;
    try {
        reservation = await reserveProviderUsageAttempt({
            attemptKey: crypto.randomUUID(),
            scope,
            provider: "openai",
            model: TRANSCRIPTION_MODEL,
            estimatedTokens: 1,
            source: TRANSCRIPTION_USAGE_SOURCE,
            contextPage: page ?? LEGACY_UNKNOWN,
            conversationId: null,
            dailyAttemptLimit: AI_CONFIG.maxTranscriptionsPerDay,
        });
    } catch (error) {
        rethrowTranscriptionAdmissionError(error);
    }

    let result: { text: string };
    try {
        result = await transcribeAudio(input.audioFile, {
            language: normalizeOptionalText(input.language),
            prompt: normalizeOptionalText(input.prompt),
        });
    } catch (error) {
        const marked = await tryMarkUsageReservationReconcilable(
            reservation.id,
            "failed",
            "TRANSCRIPTION_PROVIDER_FAILED",
        );
        if (!marked) {
            scheduleReservationRetry(
                reservation.id,
                "usage reservation outcome update",
                () => tryMarkUsageReservationReconcilable(
                    reservation.id,
                    "failed",
                    "TRANSCRIPTION_PROVIDER_FAILED",
                    { deadlineMs: 2_000 },
                ),
            );
        }
        throw error;
    }

    const settlement = {
        reservationId: reservation.id,
        model: TRANSCRIPTION_MODEL,
        inputTokens: 0,
        outputTokens: 0,
    };
    const settled = await trySettleUsageReservation(settlement);
    if (!settled) {
        scheduleReservationRetry(
            reservation.id,
            "usage settlement",
            () => trySettleUsageReservation(settlement, { deadlineMs: 2_000 }),
        );
    }

    return result;
}
