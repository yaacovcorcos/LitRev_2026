import { NextRequest, NextResponse } from "next/server";
import { SELECTABLE_MODEL_IDS } from "@/lib/ai/config";
import { requireApiSession } from "@/lib/server/auth/session";
import { getModelAvailabilityMap } from "@/lib/server/ai/model-availability";

export const runtime = "nodejs";

/** Client-safe provider readiness. No key values or route credentials leave the server. */
export async function GET(request: NextRequest) {
    const authResult = await requireApiSession(request);
    if (!authResult.ok) return authResult.response;

    const serverAvailability = getModelAvailabilityMap();
    const availability = Object.fromEntries(
        SELECTABLE_MODEL_IDS.map((modelId) => [modelId, serverAvailability[modelId]?.configured ?? false]),
    );

    return NextResponse.json(
        { availability },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
