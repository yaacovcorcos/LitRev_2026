import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/session";
import { ingestChatUnificationMetric } from "@/lib/server/chat-unification-metrics";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiSession(request);
    if (!authResult.ok) return authResult.response;

    const body = await request.json();
    const result = await ingestChatUnificationMetric(authResult.context, body);

    return Response.json(
      {
        success: true,
        deduped: result.deduped,
        id: result.id,
      },
      { status: 202 },
    );
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

    if (error instanceof Error && error.message.includes("access denied")) {
      return Response.json(
        {
          success: false,
          error: "Project not found or access denied",
        },
        { status: 403 },
      );
    }

    console.error("[telemetry/chat-unification] ingestion failed", error);
    return Response.json(
      {
        success: false,
        error: "Telemetry ingestion failed",
      },
      { status: 500 },
    );
  }
}
