import "server-only";

import { AI_CONFIG } from "@/lib/ai/config";
import { projectIdSchema } from "@/lib/schemas/ids";
import { assertProjectAccess } from "@/lib/server/access";
import type { AuthContext } from "@/lib/server/auth/session";
import type { CopilotPage } from "@/types/ai";
import {
    checkDailyTokenLimit,
    checkRateLimit,
    countUsageRequestsSince,
    recordUsage,
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
    | "AI_TRANSCRIPTION_DAILY_LIMIT_EXCEEDED";

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

function startOfCurrentDay(): Date {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay;
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

    const [rateOk, tokensOk, successfulTranscriptionCountToday] = await Promise.all([
        checkRateLimit(scope),
        checkDailyTokenLimit(scope),
        countUsageRequestsSince(scope, startOfCurrentDay(), {
            source: TRANSCRIPTION_USAGE_SOURCE,
        }),
    ]);

    if (!rateOk) {
        throw new TranscriptionGovernanceError(
            "AI_RATE_LIMIT_EXCEEDED",
            `Rate limit exceeded. Maximum ${AI_CONFIG.maxRequestsPerMinute} requests per minute.`,
            { status: 429 },
        );
    }

    if (!tokensOk) {
        throw new TranscriptionGovernanceError(
            "AI_DAILY_TOKEN_LIMIT_EXCEEDED",
            `Daily token limit exceeded. Maximum ${AI_CONFIG.maxTokensPerDay} tokens per day.`,
            { status: 429 },
        );
    }

    if (successfulTranscriptionCountToday >= AI_CONFIG.maxTranscriptionsPerDay) {
        throw new TranscriptionGovernanceError(
            "AI_TRANSCRIPTION_DAILY_LIMIT_EXCEEDED",
            `Daily transcription limit exceeded. Maximum ${AI_CONFIG.maxTranscriptionsPerDay} successful transcriptions per day.`,
            { status: 429 },
        );
    }

    const result = await transcribeAudio(input.audioFile, {
        language: normalizeOptionalText(input.language),
        prompt: normalizeOptionalText(input.prompt),
    });

    await recordUsage(projectId, TRANSCRIPTION_MODEL, 0, 0, {
        userId: input.actor.userId,
        workspaceId: input.actor.workspaceId,
        source: TRANSCRIPTION_USAGE_SOURCE,
        contextPage: page ?? LEGACY_UNKNOWN,
    });

    return result;
}
