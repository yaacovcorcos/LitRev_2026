import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/session";
import { ingestCitationPreviewMetric } from "@/lib/server/citation-preview-metrics";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireApiSession(request);
        if (!authResult.ok) return authResult.response;

        const body = await request.json();
        const result = await ingestCitationPreviewMetric(authResult.context, body);

        return Response.json(
            {
                success: true,
                deduped: result.deduped,
            },
            { status: 202 }
        );
    } catch (error) {
        if (error instanceof z.ZodError) {
            return Response.json(
                {
                    success: false,
                    error: "Invalid telemetry payload",
                    issues: error.issues,
                },
                { status: 400 }
            );
        }

        if (error instanceof Error && error.message.toLowerCase().includes("access denied")) {
            return Response.json(
                {
                    success: false,
                    error: "Project not found or access denied",
                },
                { status: 403 }
            );
        }

        console.error("[telemetry/citation-preview] ingestion failed", error);
        return Response.json(
            {
                success: false,
                error: "Telemetry ingestion failed",
            },
            { status: 500 }
        );
    }
}
