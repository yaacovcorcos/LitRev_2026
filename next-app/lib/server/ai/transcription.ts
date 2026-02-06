/**
 * Groq Whisper Transcription Service
 * Uses the OpenAI SDK with Groq's baseURL for speech-to-text
 */
import "server-only";

import OpenAI from "openai";

let groqClient: OpenAI | null = null;

function getGroqClient(): OpenAI {
    if (!groqClient) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error("GROQ_API_KEY environment variable is not set");
        }
        groqClient = new OpenAI({
            apiKey,
            baseURL: "https://api.groq.com/openai/v1",
        });
    }
    return groqClient;
}

export async function transcribeAudio(
    audioFile: File,
    options?: {
        language?: string;
        prompt?: string;
    }
): Promise<{ text: string }> {
    const client = getGroqClient();

    const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-large-v3-turbo",
        response_format: "json",
        language: options?.language,
        prompt: options?.prompt,
    });

    return { text: transcription.text };
}
