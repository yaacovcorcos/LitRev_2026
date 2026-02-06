import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/server/ai/transcription";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
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
    } catch (error) {
        console.error("Transcription error:", error);
        const message = error instanceof Error ? error.message : "Transcription failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
