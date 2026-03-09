import { NextResponse } from "next/server";
import { openOrCreateDemoProject } from "@/lib/server/demo-project";
import {
  DEV_QUICK_LOGIN_USER_ID,
  isDevQuickLoginAllowed,
} from "@/lib/server/auth/dev-quick-login";

export async function POST() {
  if (!isDevQuickLoginAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const workspaceId = `workspace-${DEV_QUICK_LOGIN_USER_ID}`;
  const project = await openOrCreateDemoProject({
    ownerId: DEV_QUICK_LOGIN_USER_ID,
    workspaceId,
  });

  return NextResponse.json({
    ok: true,
    projectId: project.id,
  });
}
