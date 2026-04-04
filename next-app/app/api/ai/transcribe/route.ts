import { NextRequest, NextResponse } from "next/server";
import { classifyAIError } from "@/lib/server/ai/error-classification";
import {
    isTranscriptionGovernanceError,
    transcribeAudioForActor,
} from "@/lib/server/ai/transcription-service";
import { runWithActorContext } from "@/lib/server/actor";
import { requireApiSession } from "@/lib/server/auth/session";
import { logServerError } from "@/lib/server/logging";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function providerFailureResponse(error: unknown) {
    const classified = classifyAIError(error);
    const headers = new Headers();

    if (typeof classified.retryAfterMs === "number" && Number.isFinite(classified.retryAfterMs)) {
        headers.set("Retry-After", String(Math.max(1, Math.ceil(classified.retryAfterMs / 1000))));
    }

    switch (classified.reason) {
        case "rate_limit":
            return NextResponse.json(
                { error: "Transcription service is busy. Please try again soon." },
                { status: 503, headers },
            );
        case "timeout":
            return NextResponse.json(
                { error: "Transcription service timed out. Please try again." },
                { status: 504, headers },
            );
        default:
            return NextResponse.json(
                { error: "Transcription service is temporarily unavailable." },
                { status: 502, headers },
            );
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireApiSession(request);
        if (!authResult.ok) return authResult.response;

        return await runWithActorContext(authResult.context, async () => {
            const formData = await request.formData();
            const audioFile = formData.get("audio");

            if (!(audioFile instanceof File)) {
                return NextResponse.json(
                    { error: "No audio file provided" },
                    { status: 400 }
                );
            }

            if (audioFile.size > MAX_AUDIO_BYTES) {
                return NextResponse.json(
                    { error: "Audio file too large (max 25MB)" },
                    { status: 413 }
                );
            }

            const language = formData.get("language");
            const prompt = formData.get("prompt");
            const page = formData.get("page");
            const projectId = formData.get("projectId");

            const result = await transcribeAudioForActor({
                actor: authResult.context,
                audioFile,
                language: typeof language === "string" ? language : null,
                prompt: typeof prompt === "string" ? prompt : null,
                page: typeof page === "string" ? page : null,
                projectId: typeof projectId === "string" ? projectId : null,
            });

            return NextResponse.json(result);
        });
    } catch (error) {
        logServerError("ai-transcribe-route", "transcription failed", undefined, error);
        if (isTranscriptionGovernanceError(error)) {
            const headers = new Headers();
            if (typeof error.retryAfterSeconds === "number" && Number.isFinite(error.retryAfterSeconds)) {
                headers.set("Retry-After", String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
            }
            return NextResponse.json(
                {
                    error: error.message,
                    code: error.code,
                },
                {
                    status: error.status,
                    headers,
                },
            );
        }

        return providerFailureResponse(error);
    }
}
