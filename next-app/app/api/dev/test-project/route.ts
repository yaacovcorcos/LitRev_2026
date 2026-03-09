import { NextRequest, NextResponse } from "next/server";
import { createProject } from "@/lib/server/projects";
import {
  DEV_QUICK_LOGIN_USER_ID,
  isDevQuickLoginAllowed,
} from "@/lib/server/auth/dev-quick-login";

function generateProjectId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(request: NextRequest) {
  if (!isDevQuickLoginAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
  };

  const name = body.name?.trim() || `E2E Project ${Date.now()}`;
  const workspaceId = `workspace-${DEV_QUICK_LOGIN_USER_ID}`;
  const now = new Date().toISOString();

  const project = await createProject(
    {
      ownerId: DEV_QUICK_LOGIN_USER_ID,
      workspaceId,
    },
    {
      id: generateProjectId(),
      name,
      description: body.description?.trim() || "E2E seeded test project",
      status: "ready",
      statusText: "Ready for review",
      created: now,
      modified: now,
      progress: {
        phase: "ready",
        percent: 100,
        papers: 0,
      },
    },
  );

  return NextResponse.json({
    ok: true,
    projectId: project.id,
  });
}
