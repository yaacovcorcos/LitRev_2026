import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/server/ai/transcription";
import { runWithActorContext } from "@/lib/server/actor";
import { requireApiSession } from "@/lib/server/auth/session";
import { logServerError } from "@/lib/server/logging";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireApiSession(request);
        if (!authResult.ok) return authResult.response;

        return runWithActorContext(authResult.context, async () => {
            const formData = await request.formData();
            const audioFile = formData.get("audio") as File | null;

            if (!audioFile) {
                return NextResponse.json(
                    { error: "No audio file provided" },
                    { status: 400 }
                );
            }

            if (audioFile.size > 25 * 1024 * 1024) {
                return NextResponse.json(
                    { error: "Audio file too large (max 25MB)" },
                    { status: 413 }
                );
            }

            const language = (formData.get("language") as string) || undefined;
            const prompt = (formData.get("prompt") as string) || undefined;

            const result = await transcribeAudio(audioFile, { language, prompt });

            return NextResponse.json(result);
        });
    } catch (error) {
        logServerError("ai-transcribe-route", "transcription failed", undefined, error);
        const message = error instanceof Error ? error.message : "Transcription failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
