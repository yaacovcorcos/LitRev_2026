import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/session";

export const runtime = "nodejs";

const contextCaptureMetricSchema = z.object({
    eventId: z.string().min(1),
    version: z.number().int().positive(),
    type: z.enum([
        "context_capture_opened",
        "context_capture_sent",
        "context_capture_reused",
        "context_capture_removed",
        "context_capture_scope_mismatch",
        "context_capture_action_failed",
    ]),
    projectId: z.string().nullable(),
    clientTimestamp: z.string().min(1),
    payload: z.object({
        surface: z.enum(["protocol", "draft", "ledger", "study", "notes", "memory", "ai", "copilot", "popup", "overview"]),
        targetKinds: z.array(z.enum([
            "protocol_section",
            "protocol_field",
            "protocol_criterion",
            "draft_selection",
            "study",
            "study_set",
            "note",
            "note_selection",
            "artifact",
            "assistant_message",
        ])).max(12),
        actionId: z.enum([
            "ask_ai",
            "send_to_copilot",
            "compare_selected_studies",
            "summarize_for_notes",
            "refine_protocol_field",
            "check_claim_support",
            "rewrite_selection",
        ]).nullable().optional(),
        launchMode: z.enum(["popup", "prefill", "immediate_send", "fallback_prefill"]).nullable().optional(),
        reason: z.string().max(500).nullable().optional(),
    }),
});

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireApiSession(request);
        if (!authResult.ok) return authResult.response;

        const body = await request.json();
        contextCaptureMetricSchema.parse(body);

        return Response.json({ success: true }, { status: 202 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return Response.json(
                {
                    success: false,
                    error: "Invalid telemetry payload",
                    issues: error.issues,
                },
                { status: 400 },
            );
        }

        console.error("[telemetry/context-capture] ingestion failed", error);
        return Response.json(
            {
                success: false,
                error: "Telemetry ingestion failed",
            },
            { status: 500 },
        );
    }
}
