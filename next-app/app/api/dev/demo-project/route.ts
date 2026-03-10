import { NextRequest, NextResponse } from "next/server";
import { openOrCreateDemoProject } from "@/lib/server/demo-project";
import {
  ensureDevQuickLoginIdentity,
  isDevQuickLoginAllowed,
} from "@/lib/server/auth/dev-quick-login";

export async function POST(request: NextRequest) {
  if (!isDevQuickLoginAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    seedKey?: string | null;
  };
  const identity = await ensureDevQuickLoginIdentity(body.seedKey);
  const project = await openOrCreateDemoProject({
    ownerId: identity.userId,
    workspaceId: identity.workspaceId,
  });

  return NextResponse.json({
    ok: true,
    projectId: project.id,
  });
}
