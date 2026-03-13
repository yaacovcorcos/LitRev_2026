import { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/server/auth/session";
import { getConversationWithSummaryById } from "@/lib/server/ai/memory";
import { buildRunRecoveryResponse } from "@/lib/server/agent/run-recovery";

export const runtime = "nodejs";

function buildSafeMissingResponse(conversationId: string, runId: string) {
    return {
        conversationId,
        runId,
        runStatus: "missing",
        isActive: false,
        lastActivityAt: null,
        lastDurableProgressAt: null,
        finalizationState: null,
        lastSequence: null,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "retry",
        abnormalEndClassification: null,
    } as const;
}

export async function POST(request: NextRequest) {
    const authResult = await requireApiSession(request);
    if (!authResult.ok) return authResult.response;

    const body = await request.json().catch(() => null) as {
        conversationId?: unknown;
        runId?: unknown;
        afterSequence?: unknown;
    } | null;

    if (!body || typeof body.conversationId !== "string" || typeof body.runId !== "string") {
        return new Response(
            JSON.stringify({ error: "conversationId and runId are required" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    if (body.afterSequence !== undefined && (!Number.isInteger(body.afterSequence) || Number(body.afterSequence) < -1)) {
        return new Response(
            JSON.stringify({ error: "afterSequence must be an integer >= -1 when provided" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    const conversation = await getConversationWithSummaryById(
        body.conversationId,
        authResult.context.userId,
        authResult.context.workspaceId,
    );

    if (!conversation) {
        return new Response(
            JSON.stringify(buildSafeMissingResponse(body.conversationId, body.runId)),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    }

    const payload = await buildRunRecoveryResponse({
        conversationId: conversation.id,
        runId: body.runId,
        afterSequence: typeof body.afterSequence === "number" ? body.afterSequence : undefined,
    });

    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}
