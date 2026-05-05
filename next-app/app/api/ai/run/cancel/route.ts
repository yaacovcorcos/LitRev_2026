import { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/server/auth/session";
import { getConversationWithSummaryById } from "@/lib/server/ai/memory";
import { abortRegisteredRun } from "@/lib/server/agent/run-cancellation";
import { cancelConversationRun } from "@/lib/server/agent/run";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const authResult = await requireApiSession(request);
    if (!authResult.ok) return authResult.response;

    const body = await request.json().catch(() => null) as {
        conversationId?: unknown;
        runId?: unknown;
    } | null;

    if (!body || typeof body.conversationId !== "string" || typeof body.runId !== "string") {
        return new Response(
            JSON.stringify({ error: "conversationId and runId are required" }),
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
            JSON.stringify({ cancelled: false, abortedInProcess: false }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    }

    const abortedInProcess = abortRegisteredRun(body.runId);
    const cancelledCount = await cancelConversationRun(body.runId, conversation.id);

    return new Response(
        JSON.stringify({ cancelled: cancelledCount > 0, abortedInProcess }),
        { status: 200, headers: { "Content-Type": "application/json" } },
    );
}
